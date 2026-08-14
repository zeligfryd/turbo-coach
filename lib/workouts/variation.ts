/**
 * Deriving next week's workout from this week's.
 *
 * Three operators, each acting only on work intervals: harder, longer, or more
 * of them. Pure — input workout in, new workout out, nothing shared — so the
 * result can be previewed before it is accepted and the whole thing is testable
 * without a database.
 *
 * Every operator takes a signed amount. A recovery week is the same machinery
 * pointed the other way (`-1` interval, `-5%`) rather than a separate concept
 * for going easier, which means one set of rules to get right instead of two.
 */

import { inferRoles } from "./roles";
import type { BuilderItem, WorkoutInterval } from "./types";

export type VariationOps = {
  /** Percentage points added to work intensity. +3 turns 88% into 91%. */
  intensityPercent?: number;
  /** Minutes added to each work interval. */
  minutesPerWorkInterval?: number;
  /** Work intervals added — repeat count, or a duplicated work+recovery pair. */
  workIntervalCount?: number;
};

export const NO_OPS: VariationOps = {};

export function hasAnyOp(ops: VariationOps): boolean {
  return Boolean(ops.intensityPercent || ops.minutesPerWorkInterval || ops.workIntervalCount);
}

/**
 * Intensity is a percentage of FTP, and these bounds are what the builder
 * already accepts. Clamping rather than rejecting means a long progression
 * flattens out at the top instead of failing on week nine.
 */
const MIN_INTENSITY = 1;
const MAX_INTENSITY = 200;
/** A work interval shorter than this is not a work interval. */
const MIN_WORK_SECONDS = 10;

function shiftIntensity(interval: WorkoutInterval, points: number): WorkoutInterval {
  const shift = (value: number | undefined) =>
    value === undefined
      ? undefined
      : Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, Math.round(value + points)));
  return {
    ...interval,
    intensityPercentStart: shift(interval.intensityPercentStart),
    intensityPercentEnd: shift(interval.intensityPercentEnd),
  };
}

function shiftDuration(interval: WorkoutInterval, seconds: number): WorkoutInterval {
  return {
    ...interval,
    durationSeconds: Math.max(MIN_WORK_SECONDS, interval.durationSeconds + seconds),
  };
}

/**
 * Add or remove work intervals.
 *
 * Where the work sits inside a repeat group this is unambiguous: the count goes
 * up or down. A group is never taken below one — deleting the work entirely is
 * a different intention from making the session easier, and should be done by
 * hand.
 *
 * Where the work is written flat, "one more" has to invent the recovery that
 * separates it. The last work interval is duplicated together with whatever
 * precedes it, so the shape stays legal rather than producing two work blocks
 * welded together.
 */
function changeWorkCount(items: BuilderItem[], delta: number): BuilderItem[] {
  if (delta === 0) return items;
  const roles = inferRoles(items);

  const repeatIndex = items.findIndex(
    (item, index) => item.type === "repeat" && roles[index].includes("work"),
  );

  if (repeatIndex !== -1) {
    return items.map((item, index) => {
      if (index !== repeatIndex || item.type !== "repeat") return item;
      return { ...item, data: { ...item.data, count: Math.max(1, item.data.count + delta) } };
    });
  }

  const workIndexes = items
    .map((_, index) => index)
    .filter((index) => items[index].type === "interval" && roles[index][0] === "work");
  if (workIndexes.length === 0) return items;

  const result = [...items];

  if (delta > 0) {
    const lastWork = workIndexes[workIndexes.length - 1];
    const before = lastWork > 0 ? items[lastWork - 1] : null;
    const pairsWithRecovery = before !== null && roles[lastWork - 1]?.[0] === "recovery";
    for (let i = 0; i < delta; i++) {
      const addition = pairsWithRecovery && before ? [before, items[lastWork]] : [items[lastWork]];
      result.splice(lastWork + 1, 0, ...addition.map((item) => structuredClone(item)));
    }
    return result;
  }

  // Removing takes the last work interval and the recovery that fed it, so the
  // session does not end on a rest.
  let toRemove = -delta;
  for (let i = workIndexes.length - 1; i >= 0 && toRemove > 0; i--) {
    if (result.filter((item, index) => item.type === "interval" && roles[index]?.[0] === "work")
        .length <= 1) {
      break;
    }
    const index = workIndexes[i];
    const takesRecovery = index > 0 && roles[index - 1]?.[0] === "recovery";
    result.splice(takesRecovery ? index - 1 : index, takesRecovery ? 2 : 1);
    toRemove--;
  }
  return result;
}

/**
 * Apply the operators, in a fixed order.
 *
 * Count first, then per-interval changes, so adding an interval and lengthening
 * each one gives the new interval the new length too — "+1 interval, +2 min"
 * reads as a description of the target session, not a sequence of edits.
 */
export function applyVariation(items: BuilderItem[], ops: VariationOps): BuilderItem[] {
  if (!hasAnyOp(ops)) return structuredClone(items);

  const counted = changeWorkCount(structuredClone(items), ops.workIntervalCount ?? 0);
  const roles = inferRoles(counted);
  const seconds = Math.round((ops.minutesPerWorkInterval ?? 0) * 60);
  const points = ops.intensityPercent ?? 0;
  if (seconds === 0 && points === 0) return counted;

  const adjust = (interval: WorkoutInterval, role: string): WorkoutInterval => {
    if (role !== "work") return interval;
    let next = interval;
    if (points !== 0) next = shiftIntensity(next, points);
    if (seconds !== 0) next = shiftDuration(next, seconds);
    return next;
  };

  return counted.map((item, index) => {
    if (item.type === "repeat") {
      return {
        ...item,
        data: {
          ...item.data,
          intervals: item.data.intervals.map((interval, i) =>
            adjust(interval, roles[index][i]),
          ),
        },
      };
    }
    return { ...item, data: adjust(item.data, roles[index][0]) };
  });
}

/** A short human description of a variation, for the card that carries it. */
export function describeVariation(ops: VariationOps): string {
  const parts: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (ops.workIntervalCount) {
    parts.push(`${sign(ops.workIntervalCount)} interval${Math.abs(ops.workIntervalCount) === 1 ? "" : "s"}`);
  }
  if (ops.minutesPerWorkInterval) parts.push(`${sign(ops.minutesPerWorkInterval)} min each`);
  if (ops.intensityPercent) parts.push(`${sign(ops.intensityPercent)}%`);
  return parts.join(", ");
}
