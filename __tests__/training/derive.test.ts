import { describe, it, expect } from "vitest";
import {
  rankRoutines,
  acuteChronicRatio,
  addDays,
  computeWeekLoad,
  daysBetween,
  estimateRpeFromIntensity,
  sessionLoad,
  startOfWeek,
} from "@/lib/training/derive";
import { FOCUS_AREAS } from "@/lib/training/taxonomy";
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







describe("rankRoutines", () => {
  const r = (name: string, daysSinceDone: number | null) => ({ name, daysSinceDone });

  it("puts the least recently done first", () => {
    const ranked = rankRoutines([r("fresh", 1), r("stale", 9), r("middling", 4)]);
    expect(ranked.map((x) => x.name)).toEqual(["stale", "middling", "fresh"]);
  });

  it("puts one you have never done above everything", () => {
    // A routine you have just added is the most likely thing you meant to do.
    const ranked = rankRoutines([r("done today", 0), r("never", null), r("old", 30)]);
    expect(ranked[0].name).toBe("never");
  });

  it("keeps every routine — this ranks, it does not filter", () => {
    const ranked = rankRoutines([r("a", 1), r("b", null), r("c", 12)]);
    expect(ranked).toHaveLength(3);
  });

  it("carries the rest of the routine through untouched", () => {
    const ranked = rankRoutines([{ name: "x", daysSinceDone: 3, exerciseCount: 5 }]);
    expect(ranked[0].exerciseCount).toBe(5);
  });

  it("handles an empty library", () => {
    expect(rankRoutines([])).toEqual([]);
  });
});
