/**
 * The week's shape: how often each area should come round, said in weeks.
 *
 * The rotation engine has always stored a target interval in days, and the
 * editor exposed it as a number you nudged between 1 and 60. Nobody plans in
 * "every 4 days", and a number line has no state in which you are finished —
 * so the whole thing read as a permanent deficit.
 *
 * Same stored data, four choices: twice a week, weekly, fortnightly, rarely.
 * Everything else here is derived from those, never entered, so two settings
 * can never contradict each other.
 */

import { FOCUS_AREAS, type FocusArea } from "./taxonomy";

export const CADENCES = [
  // `days` is the interval stored and used for staleness; `perWeek` is what the
  // label promises. They are listed separately because 7/days does not equal
  // the label: twice a week is a 4-day interval (Mon and Thursday leaves gaps
  // of 3 and 4), and 7/4 is 1.75, not 2. Deriving demand from the interval
  // would quietly overstate or understate what you actually chose.
  { key: "twice", label: "2×", full: "Twice a week", days: 4, perWeek: 2 },
  { key: "weekly", label: "1×", full: "Weekly", days: 7, perWeek: 1 },
  { key: "fortnightly", label: "2 wk", full: "Every 2 weeks", days: 14, perWeek: 0.5 },
  // The column is `not null` and capped at 60, so there is no way to store
  // "never". "Rarely" is what the data can actually express, and saying so is
  // better than a dash that implies the area is switched off.
  { key: "rarely", label: "rarely", full: "Rarely", days: 60, perWeek: 7 / 60 },
] as const;

export type CadenceKey = (typeof CADENCES)[number]["key"];

/**
 * The bucket a stored interval falls into.
 *
 * Existing intervals were free-form (4, 5, 6, 7 days), so this maps to the
 * nearest bucket rather than requiring an exact match — no stored goal becomes
 * unreadable, and the editor never shows a blank.
 */
export function cadenceForDays(days: number): CadenceKey {
  let best: (typeof CADENCES)[number] = CADENCES[0];
  for (const cadence of CADENCES) {
    if (Math.abs(cadence.days - days) < Math.abs(best.days - days)) best = cadence;
  }
  return best.key;
}

export function daysForCadence(key: CadenceKey): number {
  return CADENCES.find((c) => c.key === key)?.days ?? 7;
}

/**
 * How many times a week the shape asks for an area to be covered, summed.
 *
 * Counted from the bucket each interval falls into, so the total is exactly
 * what the labels say — twice-weekly is 2, not 1.75. This is demand on *areas*,
 * not sessions: one routine covers several areas at once, which is why
 * sessions have to be derived from it rather than set alongside it.
 */
export function weeklyAreaDemand(targetDaysByArea: Partial<Record<FocusArea, number>>): number {
  let demand = 0;
  for (const area of FOCUS_AREAS) {
    const days = targetDaysByArea[area];
    if (!days || days <= 0) continue;
    const bucket = CADENCES.find((c) => c.key === cadenceForDays(days));
    demand += bucket?.perWeek ?? 0;
  }
  return demand;
}

export type RoutineShape = { areaCount: number; durationMin: number | null };

export type WeeklyEstimate = {
  /** Sessions a week the shape works out at. Never below 1 when anything is asked for. */
  sessions: number;
  minutes: number;
  /** sRPE × minutes, at the assumed effort below. */
  load: number;
};

/**
 * Off-bike work is light and rarely rated, so its load has to be assumed to be
 * shown at all. 3 is "steady" on the CR-10 scale — mobility and prehab sit
 * around there. Stated here rather than buried so the number can be argued
 * with.
 */
const ASSUMED_RPE = 3;

/** Fallback when there are no routines yet to measure. */
const TYPICAL_AREAS_PER_ROUTINE = 3;
const TYPICAL_DURATION_MIN = 10;

/**
 * What the shape works out at per week, in sessions, minutes and load.
 *
 * Derived from the routines you actually have: a library of broad routines
 * covers the same demand in fewer sessions than a library of narrow ones, and
 * quoting a number that ignored that would be quoting a number for somebody
 * else's library.
 */
export function weeklyEstimate(
  targetDaysByArea: Partial<Record<FocusArea, number>>,
  routines: RoutineShape[],
): WeeklyEstimate {
  const demand = weeklyAreaDemand(targetDaysByArea);
  if (demand <= 0) return { sessions: 0, minutes: 0, load: 0 };

  const withAreas = routines.filter((r) => r.areaCount > 0);
  const avgAreas = withAreas.length
    ? withAreas.reduce((sum, r) => sum + r.areaCount, 0) / withAreas.length
    : TYPICAL_AREAS_PER_ROUTINE;

  const withDuration = routines.filter((r) => r.durationMin != null && r.durationMin > 0);
  const avgDuration = withDuration.length
    ? withDuration.reduce((sum, r) => sum + (r.durationMin ?? 0), 0) / withDuration.length
    : TYPICAL_DURATION_MIN;

  const sessions = Math.max(1, Math.round(demand / avgAreas));
  const minutes = Math.round(sessions * avgDuration);

  return { sessions, minutes, load: Math.round(minutes * ASSUMED_RPE) };
}

export type WeekProgress = {
  /** Off-bike sessions completed since Monday. */
  done: number;
  /** What the shape works out at. */
  expected: number;
  /** Areas past their interval, in the order they should be addressed. */
  owed: FocusArea[];
  /**
   * True when no area is behind.
   *
   * Deliberately measured on areas rather than on the session count: sessions
   * are the means, areas are the thing actually being asked for. A week where
   * you did four sessions that all hit the same area is not a met week.
   */
  isMet: boolean;
};

export function weekProgress(
  done: number,
  expected: number,
  behindAreas: FocusArea[],
): WeekProgress {
  return { done, expected, owed: behindAreas, isMet: behindAreas.length === 0 };
}
