import type { Workout } from "./types";

export interface ArchetypePrescription {
  archetype: string;
  targetDurationMin: number;
  targetTizMin?: number;
}

export interface RankedCandidate {
  workout: Workout;
  score: number;
  durationDeltaMin: number;
  tizDeltaMin: number | null;
}

const DURATION_WEIGHT = 1;
const TIZ_WEIGHT = 0.5;

function deltaMin(seconds: number | undefined, targetMin: number): number {
  const min = (seconds ?? 0) / 60;
  return Math.abs(min - targetMin);
}

export function rankCandidates(
  prescription: ArchetypePrescription,
  candidates: Workout[],
): RankedCandidate[] {
  const matching = candidates.filter(
    (w) => w.archetype === prescription.archetype,
  );

  const ranked: RankedCandidate[] = matching.map((workout) => {
    const durationDeltaMin = deltaMin(
      workout.duration_seconds,
      prescription.targetDurationMin,
    );
    const tizDeltaMin =
      prescription.targetTizMin !== undefined
        ? deltaMin(
            workout.time_in_zone_seconds ?? undefined,
            prescription.targetTizMin,
          )
        : null;

    const score =
      DURATION_WEIGHT * durationDeltaMin +
      (tizDeltaMin !== null ? TIZ_WEIGHT * tizDeltaMin : 0);

    return { workout, score, durationDeltaMin, tizDeltaMin };
  });

  return ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.durationDeltaMin - b.durationDeltaMin;
  });
}

export function findBestWorkout(
  prescription: ArchetypePrescription,
  candidates: Workout[],
): Workout | null {
  const ranked = rankCandidates(prescription, candidates);
  return ranked[0]?.workout ?? null;
}
