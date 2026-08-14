/**
 * Working out which intervals are the work.
 *
 * Progression operators only touch work intervals, and until now nothing
 * recorded which those were. An explicit `role` always wins; everything else is
 * inferred here, at read time, from the shape of the session.
 *
 * Inference is deliberately conservative and always visible: the builder shows
 * the roles it inferred so a wrong one can be corrected before anything is
 * derived from it. A silently mis-labelled interval would produce variations
 * that are wrong in a plausible way — a warm-up creeping up two minutes a week
 * — which is far worse than a visible mistake.
 */

import type { BuilderItem, IntervalRole, WorkoutInterval } from "./types";
import { getIntervalAverageIntensity, isRampInterval } from "./utils";

/** A ramp that climbs is a warm-up; one that falls is a cool-down. */
function rampDirection(interval: WorkoutInterval): "up" | "down" | null {
  if (!isRampInterval(interval)) return null;
  const start = interval.intensityPercentStart ?? 0;
  const end = interval.intensityPercentEnd ?? 0;
  if (end > start) return "up";
  if (end < start) return "down";
  return null;
}

/**
 * Above this share of FTP, an interval is not recovery whatever sits beside it.
 *
 * Being the easier half of a pair is not enough. Over-unders alternate 88% and
 * 100%: the 88s are below the group mean but they are threshold work, and
 * calling them recovery would exclude them from every progression — the
 * opposite of what the session is. A genuine rest valley sits far lower, 50-60%.
 */
const RECOVERY_CEILING_PERCENT = 72;

/**
 * Anything inside a repeat group is the work, apart from genuine valleys —
 * a repeat exists precisely to say "do this hard bit several times".
 *
 * An interval is recovery only if it is both below the group's own mean and
 * genuinely easy. Comparing within the group rather than against the session
 * matters too: a long warm-up drags the session mean down far enough that real
 * rest valleys start to look like work.
 */
function rolesWithinRepeat(intervals: WorkoutInterval[]): IntervalRole[] {
  if (intervals.length === 1) return ["work"];

  const intensities = intervals.map(getIntervalAverageIntensity);
  const mean = intensities.reduce((sum, x) => sum + x, 0) / intensities.length;

  return intensities.map((intensity) =>
    intensity < mean && intensity <= RECOVERY_CEILING_PERCENT ? "recovery" : "work",
  );
}

/**
 * The role of every interval, in the same shape as the items given.
 *
 * Returned alongside rather than written in, so callers can show what was
 * inferred without mutating a workout nobody has edited.
 */
export function inferRoles(items: BuilderItem[]): IntervalRole[][] {
  const lastIndex = items.length - 1;

  return items.map((item, index) => {
    if (item.type === "repeat") {
      return item.data.intervals.map(
        (interval, i) => interval.role ?? rolesWithinRepeat(item.data.intervals)[i],
      );
    }

    if (item.data.role) return [item.data.role];

    // A session that is one interval is that interval's work — a steady
    // endurance ride is not a warm-up for nothing.
    if (items.length === 1) return ["work"];

    const direction = rampDirection(item.data);
    const intensity = getIntervalAverageIntensity(item.data);
    const easy = intensity <= RECOVERY_CEILING_PERCENT;

    // Position decides between the two ramps: the same shape opens a session as
    // a warm-up and closes it as a cool-down. Intensity is required as well as
    // position — an opening effort at 105% is an opener, not a warm-up.
    if (index === 0 && direction !== "down" && (direction === "up" || easy)) return ["warmup"];
    if (index === lastIndex && direction !== "up" && (direction === "down" || easy)) {
      return ["cooldown"];
    }
    if (direction === "up" && index <= 1 && easy) return ["warmup"];
    if (direction === "down" && index >= lastIndex - 1 && easy) return ["cooldown"];

    // A standalone interval among repeats is judged against the session's work.
    const workIntensities = items
      .filter((other) => other.type === "repeat")
      .flatMap((other) =>
        other.type === "repeat" ? other.data.intervals.map(getIntervalAverageIntensity) : [],
      );
    const reference = workIntensities.length
      ? Math.max(...workIntensities)
      : Math.max(
          ...items.flatMap((other) =>
            other.type === "interval" ? [getIntervalAverageIntensity(other.data)] : [],
          ),
        );

    // Within a tenth of the hardest thing in the session counts as work.
    return [intensity >= reference * 0.9 ? "work" : "recovery"];
  });
}

/** The role of one interval, explicit or inferred. */
export function roleOf(items: BuilderItem[], itemIndex: number, intervalIndex = 0): IntervalRole {
  return inferRoles(items)[itemIndex]?.[intervalIndex] ?? "work";
}

/** Whether a workout has any work at all — the operators need somewhere to act. */
export function hasWorkIntervals(items: BuilderItem[]): boolean {
  return inferRoles(items).some((roles) => roles.includes("work"));
}

/**
 * Stamp the inferred roles onto a copy, so they can be edited and stored.
 *
 * Used when a workout is opened for editing: from then on its roles are
 * explicit and will not drift if the inference is ever tuned.
 */
export function materialiseRoles(items: BuilderItem[]): BuilderItem[] {
  const roles = inferRoles(items);
  return items.map((item, index) => {
    if (item.type === "repeat") {
      return {
        ...item,
        data: {
          ...item.data,
          intervals: item.data.intervals.map((interval, i) => ({
            ...interval,
            role: interval.role ?? roles[index][i],
          })),
        },
      };
    }
    return { ...item, data: { ...item.data, role: item.data.role ?? roles[index][0] } };
  });
}
