import { describe, it, expect } from "vitest";
import { applyVariation, describeVariation, hasAnyOp } from "@/lib/workouts/variation";
import { flattenBuilderItems, calculateTotalDurationFromItems } from "@/lib/workouts/utils";
import library from "../fixtures/workout-library.json";
import type { BuilderItem } from "@/lib/workouts/types";

const iv = (name: string, seconds: number, start: number, end?: number, role?: string) => ({
  type: "interval" as const,
  data: {
    name,
    durationSeconds: seconds,
    intensityPercentStart: start,
    ...(end !== undefined ? { intensityPercentEnd: end } : {}),
    ...(role ? { role: role as "work" } : {}),
  },
});

/** 3 x 10min at threshold, with 5min recovery — the worked example in the spec. */
const threshold: BuilderItem[] = [
  iv("Warm-up", 600, 50, 75),
  {
    type: "repeat",
    data: {
      count: 3,
      intervals: [
        { name: "Effort", durationSeconds: 600, intensityPercentStart: 95 },
        { name: "Recovery", durationSeconds: 300, intensityPercentStart: 55 },
      ],
    },
  },
  iv("Cool-down", 600, 60, 40),
];

const work = (items: BuilderItem[]) =>
  items.flatMap((item, i) =>
    item.type === "repeat"
      ? item.data.intervals.filter((x) => (x.intensityPercentStart ?? 0) > 72)
      : [],
  );

describe("intensity", () => {
  it("raises work and leaves everything else alone", () => {
    const out = applyVariation(threshold, { intensityPercent: 3 });
    const group = out[1];
    expect(group.type === "repeat" && group.data.intervals[0].intensityPercentStart).toBe(98);
    expect(group.type === "repeat" && group.data.intervals[1].intensityPercentStart).toBe(55);
    expect(out[0].type === "interval" && out[0].data.intensityPercentStart).toBe(50);
    expect(out[2].type === "interval" && out[2].data.intensityPercentEnd).toBe(40);
  });

  it("goes down as readily as up", () => {
    const out = applyVariation(threshold, { intensityPercent: -5 });
    expect(out[1].type === "repeat" && out[1].data.intervals[0].intensityPercentStart).toBe(90);
  });

  it("shifts both ends of a ramp by the same amount", () => {
    const ramped: BuilderItem[] = [iv("Ramp", 600, 90, 110, "work")];
    const out = applyVariation(ramped, { intensityPercent: 5 });
    expect(out[0].type === "interval" && out[0].data.intensityPercentStart).toBe(95);
    expect(out[0].type === "interval" && out[0].data.intensityPercentEnd).toBe(115);
  });

  it("clamps rather than failing on a long progression", () => {
    let items = threshold;
    for (let week = 0; week < 40; week++) items = applyVariation(items, { intensityPercent: 5 });
    const peak = Math.max(...flattenBuilderItems(items).map((i) => i.intensityPercentStart ?? 0));
    expect(peak).toBeLessThanOrEqual(200);
  });
});

describe("duration", () => {
  it("lengthens each work interval and not the recovery", () => {
    const out = applyVariation(threshold, { minutesPerWorkInterval: 2 });
    expect(out[1].type === "repeat" && out[1].data.intervals[0].durationSeconds).toBe(720);
    expect(out[1].type === "repeat" && out[1].data.intervals[1].durationSeconds).toBe(300);
    expect(out[0].type === "interval" && out[0].data.durationSeconds).toBe(600);
  });

  it("adds to the total once per repetition, not once per group", () => {
    // 3 reps x 2 extra minutes = 6 minutes, not 2.
    const before = calculateTotalDurationFromItems(threshold);
    const after = calculateTotalDurationFromItems(applyVariation(threshold, { minutesPerWorkInterval: 2 }));
    expect(after - before).toBe(6 * 60);
  });

  it("never shortens an interval out of existence", () => {
    const out = applyVariation(threshold, { minutesPerWorkInterval: -99 });
    expect(out[1].type === "repeat" && out[1].data.intervals[0].durationSeconds).toBeGreaterThan(0);
  });
});

describe("interval count", () => {
  it("raises the repeat count when the work is in a group", () => {
    const out = applyVariation(threshold, { workIntervalCount: 1 });
    expect(out[1].type === "repeat" && out[1].data.count).toBe(4);
  });

  it("lowers it for a recovery week", () => {
    expect(applyVariation(threshold, { workIntervalCount: -1 })[1]).toMatchObject({
      data: { count: 2 },
    });
  });

  it("never empties a group", () => {
    expect(applyVariation(threshold, { workIntervalCount: -99 })[1]).toMatchObject({
      data: { count: 1 },
    });
  });

  it("duplicates work with its recovery when the intervals are flat", () => {
    // Flat sessions have no count to raise, so the pair has to be copied or the
    // result is two work blocks welded together with no rest between.
    const flat: BuilderItem[] = [
      iv("Warm-up", 600, 50, 70),
      iv("Effort", 480, 100, undefined, "work"),
      iv("Recovery", 240, 55, undefined, "recovery"),
      iv("Effort", 480, 100, undefined, "work"),
      iv("Cool-down", 600, 60, 40),
    ];
    const out = applyVariation(flat, { workIntervalCount: 1 });
    const names = out.map((i) => (i.type === "interval" ? i.data.name : "repeat"));
    expect(names).toEqual(["Warm-up", "Effort", "Recovery", "Effort", "Recovery", "Effort", "Cool-down"]);
  });

  it("removes work with its recovery, and keeps one", () => {
    const flat: BuilderItem[] = [
      iv("Effort", 480, 100, undefined, "work"),
      iv("Recovery", 240, 55, undefined, "recovery"),
      iv("Effort", 480, 100, undefined, "work"),
    ];
    const out = applyVariation(flat, { workIntervalCount: -1 });
    expect(out.map((i) => (i.type === "interval" ? i.data.name : "repeat"))).toEqual(["Effort"]);
  });
});

describe("operators together", () => {
  it("applies count first, so a new interval gets the new length", () => {
    // "+1 interval, +2 min" describes the target session: four intervals of
    // twelve minutes. Applying length first would leave the fourth at ten.
    const out = applyVariation(threshold, { workIntervalCount: 1, minutesPerWorkInterval: 2 });
    expect(out[1].type === "repeat" && out[1].data.count).toBe(4);
    expect(out[1].type === "repeat" && out[1].data.intervals[0].durationSeconds).toBe(720);
  });

  it("never mutates the input", () => {
    const before = JSON.stringify(threshold);
    applyVariation(threshold, { intensityPercent: 10, minutesPerWorkInterval: 5, workIntervalCount: 2 });
    expect(JSON.stringify(threshold)).toBe(before);
  });

  it("is a no-op with no operators", () => {
    expect(applyVariation(threshold, {})).toEqual(threshold);
    expect(hasAnyOp({})).toBe(false);
  });
});

describe("over the real library", () => {
  const workouts = library as unknown as { name: string; intervals: BuilderItem[] }[];

  it("produces a valid workout from every one of them", () => {
    for (const w of workouts) {
      const out = applyVariation(w.intervals, {
        intensityPercent: 5,
        minutesPerWorkInterval: 2,
        workIntervalCount: 1,
      });
      const flat = flattenBuilderItems(out);
      expect(flat.length).toBeGreaterThan(0);
      for (const interval of flat) {
        expect(interval.durationSeconds).toBeGreaterThan(0);
        expect(interval.intensityPercentStart ?? 1).toBeGreaterThan(0);
      }
    }
  });

  it("makes a harder session longer, never shorter", () => {
    for (const w of workouts) {
      const before = calculateTotalDurationFromItems(w.intervals);
      const after = calculateTotalDurationFromItems(
        applyVariation(w.intervals, { minutesPerWorkInterval: 2 }),
      );
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });
});

describe("describeVariation", () => {
  it("reads like the change it made", () => {
    expect(describeVariation({ workIntervalCount: 1, minutesPerWorkInterval: 2 })).toBe(
      "+1 interval, +2 min each",
    );
    expect(describeVariation({ intensityPercent: -5, workIntervalCount: -1 })).toBe(
      "-1 interval, -5%",
    );
    expect(describeVariation({})).toBe("");
  });
});
