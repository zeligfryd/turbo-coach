/**
 * Computes a race readiness score (0–100) from fitness/fatigue metrics
 * and days until the race.
 *
 * Inputs:
 * - CTL (Chronic Training Load, ~fitness)
 * - ATL (Acute Training Load, ~fatigue)
 * - TSB (Training Stress Balance, CTL - ATL, ~freshness)
 * - daysToRace (0 = race day)
 *
 * Ideal race-day state: high CTL, positive TSB (5–15), moderate ATL.
 */
export function computeReadinessScore(params: {
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  daysToRace: number;
}): number {
  const { ctl, atl, tsb, daysToRace } = params;

  // If we have no fitness data at all, return a neutral score
  if (ctl == null && atl == null && tsb == null) return 50;

  const ctlVal = ctl ?? 0;
  const tsbVal = tsb ?? 0;

  // 1. Fitness component (0–40): higher CTL = better prepared
  //    CTL 80+ is very fit for most amateurs; scale linearly to cap at 120
  const fitnessScore = Math.min(40, (ctlVal / 120) * 40);

  // 2. Freshness component (0–40): ideal TSB is 5–15 on race day
  //    On race day or close to it, TSB matters most.
  //    Farther from race, TSB is less important (you still have time to taper).
  let freshnessScore: number;
  if (daysToRace <= 3) {
    // Close to race: TSB is critical
    if (tsbVal >= 5 && tsbVal <= 15) {
      freshnessScore = 40; // perfect
    } else if (tsbVal >= 0 && tsbVal <= 25) {
      freshnessScore = 30; // good
    } else if (tsbVal >= -10 && tsbVal < 0) {
      freshnessScore = 20; // slightly fatigued
    } else if (tsbVal < -10) {
      freshnessScore = Math.max(5, 20 + tsbVal); // very fatigued
    } else {
      freshnessScore = 25; // too rested (TSB > 25)
    }
  } else if (daysToRace <= 14) {
    // 4–14 days: fatigue is manageable, slightly penalise deep fatigue
    if (tsbVal >= -5) {
      freshnessScore = 35;
    } else if (tsbVal >= -15) {
      freshnessScore = 25;
    } else {
      freshnessScore = 15;
    }
  } else {
    // > 14 days: plenty of time to recover, freshness is less important
    freshnessScore = 30;
  }

  // 3. Taper readiness (0–20): is there enough time to taper?
  let taperScore: number;
  if (daysToRace >= 7 && daysToRace <= 21) {
    taperScore = 20; // ideal taper window
  } else if (daysToRace >= 3 && daysToRace < 7) {
    taperScore = 15; // short taper possible
  } else if (daysToRace < 3) {
    taperScore = 10; // it is what it is
  } else {
    // > 21 days: good planning window
    taperScore = 18;
  }

  const raw = fitnessScore + freshnessScore + taperScore;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/** Returns the number of days until the race from today (0 = race day). */
export function daysUntilRace(raceDateStr: string): number {
  const raceDate = new Date(raceDateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = raceDate.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
