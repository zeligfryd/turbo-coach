import { describe, it, expect } from "vitest";
import {
  findBestWorkout,
  rankCandidates,
} from "@/lib/workouts/archetype-matcher";
import type { Workout } from "@/lib/workouts/types";

function mkWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "test",
    category: "threshold",
    description: null,
    tags: [],
    intervals: [],
    ...overrides,
  } as Workout;
}

const TEMPO_30 = mkWorkout({
  id: "11111111-1111-1111-1111-111111111111",
  name: "Tempo — 1×30 min",
  archetype: "tempo_continuous",
  duration_seconds: 3000,
  time_in_zone_seconds: 1800,
});

const TEMPO_70 = mkWorkout({
  id: "22222222-2222-2222-2222-222222222222",
  name: "Tempo — 2×20 min",
  archetype: "tempo_continuous",
  duration_seconds: 4200,
  time_in_zone_seconds: 2400,
});

const TEMPO_80 = mkWorkout({
  id: "33333333-3333-3333-3333-333333333333",
  name: "Tempo — 3×15 min",
  archetype: "tempo_continuous",
  duration_seconds: 4800,
  time_in_zone_seconds: 2700,
});

const THRESHOLD_2x20 = mkWorkout({
  id: "44444444-4444-4444-4444-444444444444",
  name: "Threshold — 2×20 min",
  archetype: "threshold_long_reps",
  duration_seconds: 4560,
  time_in_zone_seconds: 2400,
});

const LEGACY_UNTAGGED = mkWorkout({
  id: "55555555-5555-5555-5555-555555555555",
  name: "Legacy preset",
  archetype: null,
  duration_seconds: 4200,
});

const LIBRARY: Workout[] = [
  TEMPO_30,
  TEMPO_70,
  TEMPO_80,
  THRESHOLD_2x20,
  LEGACY_UNTAGGED,
];

describe("archetype matcher", () => {
  it("filters out workouts with a different archetype", () => {
    const ranked = rankCandidates(
      { archetype: "tempo_continuous", targetDurationMin: 70 },
      LIBRARY,
    );
    expect(ranked.map((r) => r.workout.id)).not.toContain(THRESHOLD_2x20.id);
    expect(ranked.map((r) => r.workout.id)).not.toContain(LEGACY_UNTAGGED.id);
  });

  it("picks the closest duration when no TIZ target is given", () => {
    const best = findBestWorkout(
      { archetype: "tempo_continuous", targetDurationMin: 70 },
      LIBRARY,
    );
    expect(best?.id).toBe(TEMPO_70.id);
  });

  it("breaks ties in favor of the closer duration", () => {
    // 75min target: TEMPO_70 is 5 off, TEMPO_80 is 5 off — both equal.
    // Expect the stable ordering (both score=5) to still produce a match.
    const ranked = rankCandidates(
      { archetype: "tempo_continuous", targetDurationMin: 75 },
      LIBRARY,
    );
    expect(ranked[0].durationDeltaMin).toBe(5);
    expect([TEMPO_70.id, TEMPO_80.id]).toContain(ranked[0].workout.id);
  });

  it("incorporates TIZ when provided (shifts the winner)", () => {
    // At duration target 70 the winner by duration alone is TEMPO_70 (Δ0).
    // But if we prescribe a high TIZ (45 min = 2700s), TEMPO_80's TIZ
    // matches exactly while TEMPO_70 is 5 off. TIZ weight 0.5 adds 2.5
    // to TEMPO_70's score and 0 to TEMPO_80's. TEMPO_70: duration 0,
    // TIZ 5*0.5=2.5; TEMPO_80: duration 10, TIZ 0; TEMPO_70 still wins.
    const bestClose = findBestWorkout(
      {
        archetype: "tempo_continuous",
        targetDurationMin: 70,
        targetTizMin: 45,
      },
      LIBRARY,
    );
    expect(bestClose?.id).toBe(TEMPO_70.id);

    // Now push duration target closer to TEMPO_80 so duration gap to
    // TEMPO_70 rises; TIZ match should tip it to TEMPO_80.
    const bestFar = findBestWorkout(
      {
        archetype: "tempo_continuous",
        targetDurationMin: 78,
        targetTizMin: 45,
      },
      LIBRARY,
    );
    expect(bestFar?.id).toBe(TEMPO_80.id);
  });

  it("returns null when no workout matches the archetype", () => {
    const best = findBestWorkout(
      { archetype: "vo2_long", targetDurationMin: 75 },
      LIBRARY,
    );
    expect(best).toBeNull();
  });

  it("treats missing duration_seconds as 0 (large delta, low rank)", () => {
    const noDuration = mkWorkout({
      id: "66666666-6666-6666-6666-666666666666",
      archetype: "tempo_continuous",
      duration_seconds: undefined,
    });
    const best = findBestWorkout(
      { archetype: "tempo_continuous", targetDurationMin: 70 },
      [noDuration, TEMPO_70],
    );
    expect(best?.id).toBe(TEMPO_70.id);
  });
});
