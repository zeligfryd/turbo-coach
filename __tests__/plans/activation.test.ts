import { describe, it, expect } from "vitest";
import {
  buildActivationPreview,
  computeSchedule,
  resolveEntries,
} from "@/lib/plans/activation";
import type {
  PlanBlockWithChildren,
  PlanWeekWithChildren,
  PlanWithTree,
} from "@/lib/plans/types";
import type { Workout } from "@/lib/workouts/types";

// ── Fixture helpers ─────────────────────────────────────────────────

const ts = "2026-01-01T00:00:00Z";

function makeItem(overrides: {
  id: string;
  kind?: "cycling" | "strength" | "other";
  archetype?: string | null;
  target_duration_min?: number | null;
  target_tiz_min?: number | null;
  notes?: string | null;
  order_index?: number;
}) {
  return {
    id: overrides.id,
    day_id: "d",
    order_index: overrides.order_index ?? 0,
    kind: overrides.kind ?? "cycling",
    archetype: overrides.archetype ?? "endurance_tempo",
    target_duration_min: overrides.target_duration_min ?? 90,
    target_tiz_min: overrides.target_tiz_min ?? null,
    notes: overrides.notes ?? null,
    scheduled_workout_id: null,
    created_at: ts,
    updated_at: ts,
  };
}

function makeDay(
  dayOfWeek: number,
  items: ReturnType<typeof makeItem>[],
  notes: string | null = null,
) {
  return {
    id: `day-${dayOfWeek}`,
    week_id: "w",
    day_of_week: dayOfWeek,
    notes,
    created_at: ts,
    updated_at: ts,
    items,
  };
}

function makeWeek(
  orderIndex: number,
  days: ReturnType<typeof makeDay>[],
  theme: string | null = null,
): PlanWeekWithChildren {
  return {
    id: `week-${orderIndex}`,
    block_id: "b",
    order_index: orderIndex,
    theme,
    target_tss: null,
    rationale: null,
    created_at: ts,
    updated_at: ts,
    days,
  };
}

function makeBlock(
  orderIndex: number,
  durationWeeks: number,
  weeks: PlanWeekWithChildren[],
  name = "Base",
): PlanBlockWithChildren {
  return {
    id: `block-${orderIndex}`,
    plan_id: "p",
    order_index: orderIndex,
    name,
    duration_weeks: durationWeeks,
    goal: null,
    rationale: null,
    created_at: ts,
    updated_at: ts,
    weeks,
  };
}

function makePlan(
  durationWeeks: number,
  blocks: PlanBlockWithChildren[],
): PlanWithTree {
  return {
    id: "p",
    user_id: "u",
    name: "Test plan",
    goal: null,
    philosophy: null,
    duration_weeks: durationWeeks,
    target_event_id: null,
    status: "draft",
    start_date: null,
    activated_at: null,
    created_at: ts,
    updated_at: ts,
    blocks,
  };
}

function makeWorkout(overrides: {
  id: string;
  archetype: string;
  durationMin: number;
  tizMin?: number;
}): Workout {
  return {
    id: overrides.id,
    name: `Workout ${overrides.id}`,
    category: "endurance",
    description: null,
    tags: [],
    intervals: [],
    duration_seconds: overrides.durationMin * 60,
    avg_intensity_percent: 70,
    archetype: overrides.archetype,
    time_in_zone_seconds:
      overrides.tizMin != null ? overrides.tizMin * 60 : null,
  };
}

// ── computeSchedule ─────────────────────────────────────────────────

describe("computeSchedule", () => {
  it("maps day_of_week to the start date + offset (Mon start)", () => {
    const plan = makePlan(1, [
      makeBlock(0, 1, [
        makeWeek(0, [
          makeDay(0, [makeItem({ id: "i1" })]),
          makeDay(2, [makeItem({ id: "i2" })]),
        ]),
      ]),
    ]);
    // 2026-01-05 is a Monday.
    const out = computeSchedule(plan, "2026-01-05");
    expect(out).toHaveLength(2);
    expect(out[0].date).toBe("2026-01-05");
    expect(out[0].weekNumber).toBe(1);
    expect(out[0].dayOfWeek).toBe(0);
    expect(out[1].date).toBe("2026-01-07");
    expect(out[1].dayOfWeek).toBe(2);
  });

  it("advances weekNumber across blocks using block.duration_weeks", () => {
    const plan = makePlan(4, [
      makeBlock(0, 2, [
        makeWeek(0, [makeDay(0, [makeItem({ id: "i1" })])]),
        makeWeek(1, [makeDay(0, [makeItem({ id: "i2" })])]),
      ]),
      makeBlock(1, 2, [
        makeWeek(0, [makeDay(0, [makeItem({ id: "i3" })])]),
        makeWeek(1, [makeDay(0, [makeItem({ id: "i4" })])]),
      ]),
    ]);
    const out = computeSchedule(plan, "2026-01-05");
    expect(out.map((e) => [e.itemId, e.weekNumber, e.date])).toEqual([
      ["i1", 1, "2026-01-05"],
      ["i2", 2, "2026-01-12"],
      ["i3", 3, "2026-01-19"],
      ["i4", 4, "2026-01-26"],
    ]);
  });

  it("hard-caps weekNumber at plan.duration_weeks (drops overflow blocks)", () => {
    const plan = makePlan(1, [
      makeBlock(0, 2, [
        makeWeek(0, [makeDay(0, [makeItem({ id: "i1" })])]),
        makeWeek(1, [makeDay(0, [makeItem({ id: "i2" })])]),
      ]),
    ]);
    const out = computeSchedule(plan, "2026-01-05");
    expect(out.map((e) => e.itemId)).toEqual(["i1"]);
  });

  it("skips gaps where no plan_weeks row exists for a given order_index", () => {
    // Block has duration_weeks=3 but only order_index 0 and 2 exist.
    const plan = makePlan(3, [
      makeBlock(0, 3, [
        makeWeek(0, [makeDay(0, [makeItem({ id: "i1" })])]),
        makeWeek(2, [makeDay(0, [makeItem({ id: "i2" })])]),
      ]),
    ]);
    const out = computeSchedule(plan, "2026-01-05");
    expect(out.map((e) => [e.itemId, e.weekNumber, e.date])).toEqual([
      ["i1", 1, "2026-01-05"],
      // week 2 has no row → gap → i2 lands in week 3.
      ["i2", 3, "2026-01-19"],
    ]);
  });

  it("handles DST boundary (local arithmetic, no UTC drift)", () => {
    // US spring-forward 2026: Mar 8. Starting the prior Monday Mar 2 and
    // walking 14 days must still land on Mar 16, not Mar 15.
    const plan = makePlan(3, [
      makeBlock(0, 3, [
        makeWeek(0, [makeDay(0, [makeItem({ id: "i1" })])]),
        makeWeek(1, [makeDay(0, [makeItem({ id: "i2" })])]),
        makeWeek(2, [makeDay(0, [makeItem({ id: "i3" })])]),
      ]),
    ]);
    const out = computeSchedule(plan, "2026-03-02");
    expect(out.map((e) => e.date)).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
    ]);
  });
});

// ── resolveEntries ──────────────────────────────────────────────────

describe("resolveEntries", () => {
  const candidates: Workout[] = [
    makeWorkout({ id: "w-90", archetype: "endurance_tempo", durationMin: 90 }),
    makeWorkout({ id: "w-120", archetype: "endurance_tempo", durationMin: 120 }),
    makeWorkout({
      id: "w-threshold",
      archetype: "threshold_long_reps",
      durationMin: 60,
    }),
  ];

  it("picks the closest workout by duration", () => {
    const entries = [
      {
        itemId: "i1",
        weekNumber: 1,
        dayOfWeek: 0,
        date: "2026-01-05",
        kind: "cycling" as const,
        archetype: "endurance_tempo",
        targetDurationMin: 95,
        targetTizMin: null,
        notes: null,
      },
    ];
    const [r] = resolveEntries(entries, candidates);
    expect(r.workoutId).toBe("w-90");
    expect(r.unresolved).toBe(false);
  });

  it("marks strength items unresolved without touching the matcher", () => {
    const entries = [
      {
        itemId: "i1",
        weekNumber: 1,
        dayOfWeek: 0,
        date: "2026-01-05",
        kind: "strength" as const,
        archetype: null,
        targetDurationMin: 45,
        targetTizMin: null,
        notes: null,
      },
    ];
    const [r] = resolveEntries(entries, candidates);
    expect(r.workoutId).toBeNull();
    expect(r.unresolved).toBe(true);
    expect(r.unresolvedReason).toMatch(/strength items cannot be scheduled/);
  });

  it("flags cycling items missing archetype or duration", () => {
    const entries = [
      {
        itemId: "no-archetype",
        weekNumber: 1,
        dayOfWeek: 0,
        date: "2026-01-05",
        kind: "cycling" as const,
        archetype: null,
        targetDurationMin: 60,
        targetTizMin: null,
        notes: null,
      },
      {
        itemId: "no-duration",
        weekNumber: 1,
        dayOfWeek: 1,
        date: "2026-01-06",
        kind: "cycling" as const,
        archetype: "endurance_tempo",
        targetDurationMin: null,
        targetTizMin: null,
        notes: null,
      },
    ];
    const [a, b] = resolveEntries(entries, candidates);
    expect(a.unresolvedReason).toMatch(/No archetype/);
    expect(b.unresolvedReason).toMatch(/No target duration/);
  });

  it("returns unresolved when no candidate matches the archetype", () => {
    const entries = [
      {
        itemId: "i1",
        weekNumber: 1,
        dayOfWeek: 0,
        date: "2026-01-05",
        kind: "cycling" as const,
        archetype: "vo2_short",
        targetDurationMin: 60,
        targetTizMin: null,
        notes: null,
      },
    ];
    const [r] = resolveEntries(entries, candidates);
    expect(r.unresolved).toBe(true);
    expect(r.unresolvedReason).toMatch(/vo2_short/);
  });
});

// ── buildActivationPreview ──────────────────────────────────────────

describe("buildActivationPreview", () => {
  it("aggregates counts and date window correctly", () => {
    const plan = makePlan(2, [
      makeBlock(0, 2, [
        makeWeek(0, [
          makeDay(0, [
            makeItem({ id: "a", archetype: "endurance_tempo" }),
            makeItem({ id: "b", kind: "strength", archetype: null }),
          ]),
        ]),
        makeWeek(1, [
          makeDay(0, [
            makeItem({ id: "c", archetype: "endurance_tempo" }),
            makeItem({ id: "d", archetype: "nonexistent" }),
          ]),
        ]),
      ]),
    ]);
    const candidates: Workout[] = [
      makeWorkout({ id: "w", archetype: "endurance_tempo", durationMin: 90 }),
    ];
    const preview = buildActivationPreview(plan, "2026-01-05", candidates);

    expect(preview.startDate).toBe("2026-01-05");
    expect(preview.endDate).toBe("2026-01-18"); // 2 weeks * 7 - 1 = 13 days later
    expect(preview.totalItems).toBe(4);
    expect(preview.cyclingItems).toBe(3);
    expect(preview.resolvedCycling).toBe(2);
    expect(preview.unresolvedCycling).toBe(1);
    expect(preview.nonCyclingSkipped).toBe(1);
    expect(preview.perWeek).toEqual([
      { weekNumber: 1, scheduled: 1, unresolved: 0 },
      { weekNumber: 2, scheduled: 1, unresolved: 1 },
    ]);
  });
});
