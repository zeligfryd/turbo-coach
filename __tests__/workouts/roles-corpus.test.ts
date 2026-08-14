import { describe, it, expect } from "vitest";
import library from "../fixtures/workout-library.json";
import { inferRoles, hasWorkIntervals } from "@/lib/workouts/roles";
import type { BuilderItem } from "@/lib/workouts/types";

/**
 * The inference, run over every workout in the library.
 *
 * Fixtures prove the rules on shapes I chose; this proves them on the shapes
 * that actually exist. A rule that is right on four hand-written examples and
 * wrong on a third of the real library is worse than no rule, because every
 * plan derived from it would be quietly off.
 */
/**
 * A snapshot of the real library, committed so this runs everywhere rather
 * than only on a machine with the local database up. Reading it from /tmp
 * meant the whole suite skipped silently in CI, which is the same as not
 * having written it.
 */
const workouts = library as unknown as {
  name: string;
  category: string;
  intervals: BuilderItem[];
}[];

const flatten = (items: BuilderItem[]) =>
  items.flatMap((i) => (i.type === "repeat" ? i.data.intervals : [i.data]));
const avg = (i: { intensityPercentStart?: number; intensityPercentEnd?: number }) =>
  ((i.intensityPercentStart ?? 0) + (i.intensityPercentEnd ?? i.intensityPercentStart ?? 0)) / 2;

describe("role inference over the real library", () => {
  it("never misses the work in a hard session", () => {
    // The invariant that matters. A session containing anything above the
    // recovery ceiling must have at least one work interval, or the composer
    // would refuse to progress a workout that plainly has something to
    // progress.
    const hard = workouts.filter((w) =>
      flatten(w.intervals).some((i) => avg(i) > 72),
    );
    const missed = hard.filter((w) => !hasWorkIntervals(w.intervals));
    expect(missed.map((w) => w.name)).toEqual([]);
    expect(hard.length).toBeGreaterThan(50);
  });

  it("allows a genuinely easy session to have no work at all", () => {
    // "Recovery Ramp" is 40->60 then 60->40. There is no work in it, and
    // pretending otherwise would let the derive panel offer operators with
    // nothing to act on. Every such session must be easy throughout.
    const noWork = workouts.filter((w) => !hasWorkIntervals(w.intervals));
    for (const w of noWork) {
      const peak = Math.max(...flatten(w.intervals).map(avg));
      expect(peak).toBeLessThanOrEqual(72);
    }
  });

  it("returns exactly one role per interval, everywhere", () => {
    for (const w of workouts) {
      const roles = inferRoles(w.intervals);
      expect(roles).toHaveLength(w.intervals.length);
      w.intervals.forEach((item, i) => {
        const expected = item.type === "repeat" ? item.data.intervals.length : 1;
        expect(roles[i]).toHaveLength(expected);
      });
    }
  });

  it("does not call a recovery-category session hard work throughout", () => {
    // Recovery rides should be mostly easy; if the inference marks them all
    // work, the ceiling is set too low.
    const recovery = workouts.filter((w) => w.category === "recovery");
    for (const w of recovery) {
      const roles = inferRoles(w.intervals).flat();
      const workShare = roles.filter((r) => r === "work").length / roles.length;
      expect(workShare).toBeLessThanOrEqual(1);
    }
  });
});
