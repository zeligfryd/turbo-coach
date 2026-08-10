import { describe, it, expect } from "vitest";
import {
  acuteChronicRatio,
  addDays,
  computeAreaCoverage,
  computeWeekLoad,
  coverageStatus,
  daysBetween,
  estimateRpeFromIntensity,
  rankByStaleness,
  resolveGoals,
  sessionLoad,
  startOfWeek,
} from "@/lib/training/derive";
import { DEFAULT_AREA_TARGET_DAYS, FOCUS_AREAS } from "@/lib/training/taxonomy";
import type { CoverageEvent, PlannedItem } from "@/lib/training/types";

const TODAY = "2026-08-09"; // a Sunday

function item(overrides: Partial<PlannedItem> = {}): PlannedItem {
  return {
    id: "b1",
    source: "block",
    date: TODAY,
    dayPart: "am",
    modality: "prehab",
    name: "Upper 8",
    plannedDurationMin: 10,
    plannedRpe: 3,
    areaTags: [],
    routineId: null,
    seriesId: null,
    templateId: null,
    status: "done",
    createdBy: "user",
    acceptedAt: null,
    editableHere: true,
    workoutId: null,
    plannedTss: null,
    ...overrides,
  };
}

describe("date helpers", () => {
  it("counts days between dates", () => {
    expect(daysBetween("2026-08-01", "2026-08-09")).toBe(8);
    expect(daysBetween("2026-08-09", "2026-08-09")).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(daysBetween("2026-07-30", "2026-08-02")).toBe(3);
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-07-30", 3)).toBe("2026-08-02");
    expect(addDays("2026-08-02", -3)).toBe("2026-07-30");
  });

  it("finds Monday of the containing week", () => {
    expect(startOfWeek("2026-08-09")).toBe("2026-08-03"); // Sunday → prior Monday
    expect(startOfWeek("2026-08-03")).toBe("2026-08-03"); // Monday → itself
    expect(startOfWeek("2026-08-05")).toBe("2026-08-03"); // midweek
  });
});

describe("sessionLoad", () => {
  it("multiplies minutes by sRPE", () => {
    expect(sessionLoad(55, 7)).toBe(385);
  });

  it("returns 0 when either input is missing", () => {
    expect(sessionLoad(55, null)).toBe(0);
    expect(sessionLoad(null, 7)).toBe(0);
    expect(sessionLoad(undefined, undefined)).toBe(0);
  });

  it("returns 0 rather than guessing for an unrated session", () => {
    expect(sessionLoad(120, 0)).toBe(0);
  });
});

describe("estimateRpeFromIntensity", () => {
  it("maps intensity factor onto a 1-10 scale", () => {
    expect(estimateRpeFromIntensity(0.55)).toBeGreaterThan(2);
    expect(estimateRpeFromIntensity(0.55)).toBeLessThan(4);
    expect(estimateRpeFromIntensity(1.0)).toBeGreaterThan(8);
  });

  it("increases monotonically with intensity", () => {
    const easy = estimateRpeFromIntensity(0.6)!;
    const hard = estimateRpeFromIntensity(0.95)!;
    expect(hard).toBeGreaterThan(easy);
  });

  it("clamps to the 1-10 range", () => {
    expect(estimateRpeFromIntensity(2)).toBe(10);
    expect(estimateRpeFromIntensity(0.01)).toBe(1);
  });

  it("returns null for missing or nonsensical input", () => {
    expect(estimateRpeFromIntensity(null)).toBeNull();
    expect(estimateRpeFromIntensity(0)).toBeNull();
  });
});

describe("computeWeekLoad", () => {
  it("sums session load across modalities", () => {
    const week = computeWeekLoad(
      [
        { item: item({ modality: "strength", plannedDurationMin: 55, plannedRpe: 7 }) },
        { item: item({ modality: "prehab", plannedDurationMin: 12, plannedRpe: 3 }) },
      ],
      TODAY,
    );
    expect(week.totalLoad).toBe(385 + 36);
    expect(week.totalMinutes).toBe(67);
  });

  it("prefers actual duration and sRPE over planned", () => {
    const week = computeWeekLoad(
      [{ item: item({ plannedDurationMin: 10, plannedRpe: 3 }), actualDurationMin: 20, srpe: 5 }],
      TODAY,
    );
    expect(week.totalLoad).toBe(100);
  });

  it("excludes work that was not completed", () => {
    const week = computeWeekLoad(
      [
        { item: item({ status: "planned" }) },
        { item: item({ status: "skipped" }) },
        { item: item({ status: "ghost" }) },
      ],
      TODAY,
    );
    expect(week.totalLoad).toBe(0);
  });

  it("counts partial sessions", () => {
    const week = computeWeekLoad([{ item: item({ status: "partial" }) }], TODAY);
    expect(week.totalLoad).toBe(30);
  });

  it("excludes items outside the week", () => {
    const week = computeWeekLoad(
      [
        { item: item({ date: "2026-08-05" }) }, // inside
        { item: item({ date: "2026-07-28" }) }, // before
        { item: item({ date: "2026-08-12" }) }, // after
      ],
      TODAY,
    );
    expect(week.totalMinutes).toBe(10);
  });

  it("keeps bike TSS out of session load", () => {
    const week = computeWeekLoad(
      [
        {
          item: item({ modality: "bike", plannedDurationMin: 120, plannedRpe: 5, plannedTss: 118 }),
        },
      ],
      TODAY,
    );
    expect(week.totalLoad).toBe(600); // 120 × 5, TSS not added in
    expect(week.bikeTss).toBe(118);
  });

  it("reports every modality even when unused", () => {
    const week = computeWeekLoad([], TODAY);
    expect(week.byModality).toHaveLength(5);
    expect(week.byModality.every((m) => m.load === 0)).toBe(true);
  });
});

describe("acuteChronicRatio", () => {
  const week = (weekStart: string, totalLoad: number) => ({
    weekStart,
    totalLoad,
    totalMinutes: 0,
    byModality: [],
    bikeTss: 0,
  });

  it("is null until four weeks exist", () => {
    expect(acuteChronicRatio([week("2026-07-20", 100)])).toBeNull();
  });

  it("is 1 for a flat block", () => {
    const weeks = ["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03"].map((d) => week(d, 4000));
    expect(acuteChronicRatio(weeks)).toBe(1);
  });

  it("exceeds 1 when the latest week spikes", () => {
    const weeks = [
      week("2026-07-13", 4000),
      week("2026-07-20", 4000),
      week("2026-07-27", 4000),
      week("2026-08-03", 6000),
    ];
    expect(acuteChronicRatio(weeks)!).toBeGreaterThan(1.2);
  });

  it("is null when there is no chronic load to divide by", () => {
    const weeks = ["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03"].map((d) => week(d, 0));
    expect(acuteChronicRatio(weeks)).toBeNull();
  });
});

describe("coverageStatus", () => {
  it("bands the ratio", () => {
    expect(coverageStatus(0.2)).toBe("fresh");
    expect(coverageStatus(0.59)).toBe("fresh");
    expect(coverageStatus(0.6)).toBe("due");
    expect(coverageStatus(1)).toBe("due");
    expect(coverageStatus(1.01)).toBe("overdue");
  });

  it("distinguishes never-covered from overdue", () => {
    expect(coverageStatus(null)).toBe("never");
  });
});

describe("resolveGoals", () => {
  it("falls back to the cyclist defaults", () => {
    const resolved = resolveGoals([]);
    expect(Object.keys(resolved)).toHaveLength(6);
    expect(resolved.thoracic.targetDays).toBe(DEFAULT_AREA_TARGET_DAYS.thoracic);
    expect(resolved.thoracic.isDefault).toBe(true);
  });

  it("honours a user override", () => {
    const resolved = resolveGoals([{ area: "thoracic", target_days: 2, is_default: false }]);
    expect(resolved.thoracic).toEqual({ targetDays: 2, isDefault: false });
  });

  it("ignores rows still marked as defaults", () => {
    const resolved = resolveGoals([{ area: "thoracic", target_days: 99, is_default: true }]);
    expect(resolved.thoracic.targetDays).toBe(DEFAULT_AREA_TARGET_DAYS.thoracic);
  });

  it("is satisfiable with margin — the whole point of the six-area model", () => {
    // Σ(1/target) is the required stimuli per day. The spec's 24-cell profile
    // demanded ≈4.1/day (≈29/week); four rotating routines cannot deliver that.
    const perDay = FOCUS_AREAS.reduce((sum, a) => sum + 1 / DEFAULT_AREA_TARGET_DAYS[a], 0);
    expect(perDay * 7).toBeLessThan(12);
  });
});

describe("computeAreaCoverage", () => {
  const ev = (area: CoverageEvent["area"], date: string, loaded = true): CoverageEvent => ({
    area,
    date,
    loaded,
  });

  it("returns all six areas regardless of history", () => {
    const coverage = computeAreaCoverage([], [], TODAY);
    expect(coverage).toHaveLength(6);
    expect(coverage.every((c) => c.status === "never")).toBe(true);
  });

  it("measures from the most recent event", () => {
    const coverage = computeAreaCoverage(
      [ev("thoracic", "2026-08-01"), ev("thoracic", "2026-08-07")],
      [],
      TODAY,
    );
    const thoracic = coverage.find((c) => c.area === "thoracic")!;
    expect(thoracic.lastCoveredDate).toBe("2026-08-07");
    expect(thoracic.daysSince).toBe(2);
  });

  it("computes the ratio against the target", () => {
    const coverage = computeAreaCoverage([ev("thoracic", "2026-08-01")], [], TODAY);
    const thoracic = coverage.find((c) => c.area === "thoracic")!;
    // 8 days since, default target 4 → 2.0×
    expect(thoracic.ratio).toBe(2);
    expect(thoracic.status).toBe("overdue");
  });

  it("marks an area stretched but never loaded", () => {
    const coverage = computeAreaCoverage(
      [ev("thoracic", "2026-08-07", false), ev("thoracic", "2026-08-08", false)],
      [],
      TODAY,
    );
    expect(coverage.find((c) => c.area === "thoracic")!.stretchOnly).toBe(true);
  });

  it("clears the stretch-only mark once anything loaded lands", () => {
    const coverage = computeAreaCoverage(
      [ev("thoracic", "2026-08-01", true), ev("thoracic", "2026-08-08", false)],
      [],
      TODAY,
    );
    // The most recent event was a stretch, but the area HAS been loaded.
    expect(coverage.find((c) => c.area === "thoracic")!.stretchOnly).toBe(false);
  });

  it("ignores events in the future so planned work cannot mark an area fresh", () => {
    const coverage = computeAreaCoverage([ev("thoracic", "2026-08-20")], [], TODAY);
    expect(coverage.find((c) => c.area === "thoracic")!.status).toBe("never");
  });

  it("respects a user override of the target", () => {
    const coverage = computeAreaCoverage(
      [ev("thoracic", "2026-08-07")],
      [{ area: "thoracic", target_days: 14, is_default: false }],
      TODAY,
    );
    const thoracic = coverage.find((c) => c.area === "thoracic")!;
    expect(thoracic.status).toBe("fresh"); // 2 / 14
    expect(thoracic.isDefault).toBe(false);
  });
});

describe("rankByStaleness", () => {
  it("puts never-covered areas first, then the most overdue", () => {
    const coverage = computeAreaCoverage(
      [
        ev2("hips_glutes", "2026-08-08"), // 1 day, target 4 → 0.25
        ev2("thoracic", "2026-08-01"), // 8 days, target 4 → 2.0
      ],
      [],
      TODAY,
    );
    const ranked = rankByStaleness(coverage);
    expect(ranked[0].ratio).toBeNull(); // an untouched area is most actionable
    const withHistory = ranked.filter((c) => c.ratio !== null);
    expect(withHistory[0].area).toBe("thoracic");
    expect(withHistory[withHistory.length - 1].area).toBe("hips_glutes");
  });

  function ev2(area: CoverageEvent["area"], date: string): CoverageEvent {
    return { area, date, loaded: true };
  }
});
