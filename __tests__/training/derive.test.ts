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
  rankRoutines,
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

  it("shows the arithmetic behind each session", () => {
    // The case that prompted this: one 119-minute gravel ride at IF 0.632
    // reads as 488 load beside 79 TSS. Both numbers are right; the breakdown
    // is what makes the gap explicable.
    const srpe = estimateRpeFromIntensity(0.632);
    expect(srpe).toBe(4.1);

    const week = computeWeekLoad(
      [
        {
          item: item({
            modality: "bike",
            name: "Saint-Bauzille-de-Putois Gravel",
            plannedDurationMin: 119,
            plannedTss: 79,
          }),
          actualDurationMin: 119,
          srpe,
          srpeEstimated: true,
        },
      ],
      TODAY,
    );

    expect(week.totalLoad).toBe(488);
    expect(week.sessions).toHaveLength(1);
    const [session] = week.sessions;
    expect(session.minutes * session.srpe!).toBeCloseTo(session.load, 0);
    expect(session.srpeEstimated).toBe(true);
    expect(session.tss).toBe(79);
    // The two units stay separate: TSS never lands in load.
    expect(week.bikeTss).toBe(79);
  });

  it("orders the breakdown Monday first, heaviest first within a day", () => {
    const week = computeWeekLoad(
      [
        { item: item({ id: "b", date: "2026-08-06", plannedDurationMin: 10, plannedRpe: 3 }) },
        { item: item({ id: "c", date: "2026-08-06", plannedDurationMin: 60, plannedRpe: 7 }) },
        { item: item({ id: "a", date: "2026-08-04", plannedDurationMin: 10, plannedRpe: 3 }) },
      ],
      TODAY,
    );
    expect(week.sessions.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("keeps a Sunday session inside the week that started the Monday before", () => {
    // The week of Mon 3 Aug runs to Sun 9 Aug. A Sunday ride belongs to it, and
    // reads last rather than first.
    const week = computeWeekLoad(
      [
        { item: item({ id: "sun", date: "2026-08-09", plannedDurationMin: 60, plannedRpe: 5 }) },
        { item: item({ id: "mon", date: "2026-08-03", plannedDurationMin: 30, plannedRpe: 4 }) },
      ],
      "2026-08-05",
    );
    expect(week.weekStart).toBe("2026-08-03");
    expect(week.sessions.map((s) => s.id)).toEqual(["mon", "sun"]);
  });

  it("leaves the breakdown empty for a week with nothing completed", () => {
    const week = computeWeekLoad([{ item: item({ status: "planned" }) }], TODAY);
    expect(week.sessions).toEqual([]);
    expect(week.totalLoad).toBe(0);
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

  it("separates load resting on an inferred RPE from load that was reported", () => {
    const week = computeWeekLoad(
      [
        // A ride whose RPE we inferred from intensity.
        { item: item({ modality: "bike", plannedDurationMin: 60 }), srpe: 5, srpeEstimated: true },
        // A session the rider actually rated.
        { item: item({ modality: "prehab", plannedDurationMin: 10 }), srpe: 3 },
      ],
      TODAY,
    );
    expect(week.totalLoad).toBe(300 + 30);
    expect(week.estimatedLoad).toBe(300);
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
    sessions: [],
    bikeTss: 0,
    estimatedLoad: 0,
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
    // Derived from the default rather than hard-coded, so tuning the shipped
    // shape does not break a test that is about the arithmetic.
    const target = DEFAULT_AREA_TARGET_DAYS.thoracic;
    const coverage = computeAreaCoverage([ev("thoracic", "2026-08-01")], [], TODAY);
    const thoracic = coverage.find((c) => c.area === "thoracic")!;
    const daysSince = 8;
    expect(thoracic.daysSince).toBe(daysSince);
    expect(thoracic.ratio).toBeCloseTo(daysSince / target, 2);
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

describe("rankRoutines", () => {
  const routine = (name: string, areas: Record<string, boolean>) => ({
    name,
    coverageVector: Object.fromEntries(
      Object.entries(areas).map(([area, loaded]) => [area, { loaded }]),
    ),
  });

  const coverage = (overrides: Record<string, string>) =>
    computeAreaCoverage(
      Object.entries(overrides).map(([area, date]) => ({
        area: area as CoverageEvent["area"],
        date,
        loaded: true,
      })),
      [],
      TODAY,
    );

  it("puts the routine covering the most overdue area first", () => {
    const cov = coverage({
      hips_glutes: "2026-08-08", // 1 day / 4 → fresh
      neck_shoulders: "2026-07-25", // 15 days / 6 → overdue
      thoracic: "2026-08-08",
      posterior_chain: "2026-08-08",
      trunk: "2026-08-08",
      extremities: "2026-08-08",
    });
    const ranked = rankRoutines(
      [
        routine("Hips & glutes 12", { hips_glutes: true }),
        routine("Upper 8", { neck_shoulders: true, thoracic: true }),
      ],
      cov,
    );
    expect(ranked[0].name).toBe("Upper 8");
    expect(ranked[0].fixesAreas).toContain("neck_shoulders");
  });

  it("treats a never-covered area as the most urgent thing available", () => {
    const cov = coverage({
      hips_glutes: "2026-08-01", // 8 days / 4 → 2.0, overdue
      // trunk has no history at all
    });
    const ranked = rankRoutines(
      [
        routine("Hips & glutes 12", { hips_glutes: true }),
        routine("Tendon & trunk 10", { trunk: true }),
      ],
      cov,
    );
    expect(ranked[0].name).toBe("Tendon & trunk 10");
  });

  it("does not list fresh areas as things it fixes", () => {
    const cov = coverage({
      hips_glutes: "2026-08-08",
      thoracic: "2026-08-08",
      posterior_chain: "2026-08-08",
      trunk: "2026-08-08",
      neck_shoulders: "2026-08-08",
      extremities: "2026-08-08",
    });
    const ranked = rankRoutines([routine("Post-ride 10", { hips_glutes: true })], cov);
    expect(ranked[0].fixesAreas).toEqual([]);
  });

  it("ignores areas the routine does not cover when scoring", () => {
    const cov = coverage({
      hips_glutes: "2026-08-08",
      neck_shoulders: "2026-06-01", // wildly overdue, but untouched by this routine
    });
    const ranked = rankRoutines([routine("Hips & glutes 12", { hips_glutes: true })], cov);
    expect(ranked[0].urgency).toBeLessThan(1);
  });
});

describe("rankRoutines — tie-breaking and stretch-only", () => {
  const routine = (name: string, areas: Record<string, boolean>) => ({
    name,
    coverageVector: Object.fromEntries(
      Object.entries(areas).map(([area, loaded]) => [area, { loaded }]),
    ),
  });

  it("on a fresh account, suggests the routine covering the most ground", () => {
    // Every area is equally "never covered", so urgency ties across the board.
    const cov = computeAreaCoverage([], [], TODAY);
    const ranked = rankRoutines(
      [
        routine("Hips & glutes 12", { hips_glutes: true }),
        routine("Post-ride 10", {
          hips_glutes: false,
          thoracic: false,
          posterior_chain: false,
          extremities: false,
        }),
      ],
      cov,
    );
    expect(ranked[0].name).toBe("Post-ride 10");
    expect(ranked[0].fixesAreas).toHaveLength(4);
  });

  it("counts an area that has only been stretched as something a loading routine fixes", () => {
    const cov = computeAreaCoverage(
      [{ area: "thoracic", date: "2026-08-08", loaded: false }],
      [],
      TODAY,
    );
    expect(cov.find((c) => c.area === "thoracic")!.status).toBe("fresh");

    const [loading, stretching] = rankRoutines(
      [routine("Loads it", { thoracic: true }), routine("Stretches it", { thoracic: false })],
      cov,
    );
    expect(loading.fixesAreas).toContain("thoracic");
    expect(stretching.fixesAreas).not.toContain("thoracic");
  });

  it("does not let stretch-only inflate urgency", () => {
    const cov = computeAreaCoverage(
      [{ area: "thoracic", date: "2026-08-08", loaded: false }],
      [],
      TODAY,
    );
    const [ranked] = rankRoutines([routine("Loads it", { thoracic: true })], cov);
    expect(ranked.urgency).toBeLessThan(1); // fresh: 1 day against a 4-day target
  });
});
