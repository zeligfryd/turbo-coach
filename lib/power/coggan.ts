/**
 * Coggan & Allen power profile reference tables and classification logic.
 *
 * W/kg thresholds per duration per gender. Each array has 6 elements
 * representing the MINIMUM W/kg to achieve that score level (1–6).
 * Score 1 = anything below threshold[0] is Untrained.
 */

import {
  PROFILE_DURATIONS,
  PROFILE_DIMENSION_LABELS,
  type ProfileType,
  type PowerProfile,
  type PowerCurvePoint,
} from "./types";

// ── Reference tables ────────────────────────────────────────

// Male W/kg thresholds: [Untrained, Fair, Moderate, Good, Very Good, Excellent]
// Minimum W/kg to achieve each level. Below index 0 = Untrained (score 1).
const MALE_THRESHOLDS: Record<number, number[]> = {
  5:    [0,   8.0,  11.0, 14.0, 17.0, 21.0],  // 5s neuromuscular
  60:   [0,   3.5,   5.0,  6.5,  8.0, 10.0],  // 1min anaerobic
  300:  [0,   2.5,   3.5,  4.5,  5.5,  6.5],  // 5min VO2max
  1200: [0,   2.0,   3.0,  3.8,  4.5,  5.5],  // 20min threshold
};

const FEMALE_THRESHOLDS: Record<number, number[]> = {
  5:    [0,   6.5,   8.5, 11.0, 13.5, 16.5],
  60:   [0,   2.8,   4.0,  5.2,  6.5,  8.0],
  300:  [0,   2.0,   2.8,  3.6,  4.5,  5.5],
  1200: [0,   1.6,   2.4,  3.1,  3.7,  4.5],
};

// ── Scoring ─────────────────────────────────────────────────

/**
 * Score a single W/kg value against the reference table.
 * Returns 1–6 (Untrained → Excellent).
 */
function scoreWkg(wkg: number, thresholds: number[]): number {
  // Walk backwards from highest to find the level
  for (let i = thresholds.length - 1; i >= 1; i--) {
    if (wkg >= thresholds[i]) return i + 1; // score is 1-indexed: index 1 → score 2 (Fair)
  }
  return 1; // Untrained
}

/**
 * Score all four profile dimensions from power curve data.
 */
export function scoreProfile(
  curve: PowerCurvePoint[],
  gender: "male" | "female" = "male"
): Record<string, number> {
  const thresholds = gender === "female" ? FEMALE_THRESHOLDS : MALE_THRESHOLDS;
  const scores: Record<string, number> = {};

  for (const secs of PROFILE_DURATIONS) {
    const point = curve.find((p) => p.secs === secs);
    const wkg = point?.wkg ?? 0;
    const label = PROFILE_DIMENSION_LABELS[secs];
    scores[label] = scoreWkg(wkg, thresholds[secs]);
  }

  return scores;
}

// ── Profile type classification ─────────────────────────────

type ScoreSet = { s5: number; s1m: number; s5m: number; s20m: number };

function classifyType(scores: ScoreSet): ProfileType {
  const { s5, s1m, s5m, s20m } = scores;
  const shortAvg = (s5 + s1m) / 2;
  const longAvg = (s5m + s20m) / 2;

  // All-rounder: all within 1 point
  const all = [s5, s1m, s5m, s20m];
  const max = Math.max(...all);
  const min = Math.min(...all);
  if (max - min <= 1) return "All-rounder";

  // Sprinter: 5s and 1min significantly above 5min and 20min
  if (shortAvg - longAvg >= 2) return "Sprinter";

  // Anaerobic: 1min highest, steep drop to 5min and 20min
  if (s1m >= s5 && s1m - s5m >= 2 && s1m - s20m >= 2) return "Anaerobic";

  // Climber: 5min and 20min highest, relatively flat
  if (longAvg - shortAvg >= 1.5 || (s5m >= s5 && s20m >= s1m && longAvg > shortAvg))
    return "Climber";

  // Time Trialist: 20min dominates, flat from 5min to 20min
  if (s20m >= s5m && s20m > s1m && s20m > s5 && Math.abs(s5m - s20m) <= 1)
    return "Time Trialist";

  // Puncheur: 1min and 5min elevated relative to 20min
  if (s1m >= s20m + 1 && s5m >= s20m) return "Puncheur";

  // Fallback: largest delta determines type
  if (shortAvg > longAvg) return s1m > s5 ? "Anaerobic" : "Sprinter";
  if (s20m >= s5m) return "Time Trialist";
  return "Climber";
}

// ── Profile descriptions ────────────────────────────────────

const PROFILE_DESCRIPTIONS: Record<ProfileType, string> = {
  Sprinter:
    "You have exceptional sprint and anaerobic power. You're dangerous in criteriums and bunch sprints. Sustained threshold work would help you stay in contact on longer efforts before unleashing your sprint.",
  Anaerobic:
    "Your anaerobic capacity is your standout quality — you excel in short, sharp efforts and attacks. Building your aerobic base and threshold power would let you use that punch more often in longer races.",
  Puncheur:
    "You combine strong anaerobic punch with solid VO2max power. You thrive on hilly courses with short, steep climbs and aggressive racing. Improving your 20-minute threshold would extend the races you can dominate.",
  Climber:
    "Your power is built for sustained efforts. You excel when the race is decided over long climbs or extended time trials. Your main opportunity is developing short anaerobic punch for attacks and surges.",
  "Time Trialist":
    "You excel at sustained, steady-state power output. You're strongest when the race rewards consistency — flat time trials, long breakaways, and even-paced climbing. Developing your sprint and VO2max would make you more versatile in tactical racing.",
  "All-rounder":
    "You have a balanced power profile across all durations. This versatility means you can compete in any race format. To break through, identify the type of racing you enjoy most and sharpen that specific area.",
};

// ── Build full profile ──────────────────────────────────────

export function buildPowerProfile(
  allTimeCurve: PowerCurvePoint[],
  last42dCurve: PowerCurvePoint[],
  gender: "male" | "female" = "male"
): PowerProfile {
  const scores = scoreProfile(allTimeCurve, gender);
  const scores42d = scoreProfile(last42dCurve, gender);

  const scoreSet: ScoreSet = {
    s5: scores["5s"] ?? 1,
    s1m: scores["1min"] ?? 1,
    s5m: scores["5min"] ?? 1,
    s20m: scores["20min"] ?? 1,
  };

  const type = classifyType(scoreSet);

  // Find weakness (lowest-scoring dimension)
  let weakestLabel = "20min";
  let weakestScore = Infinity;
  for (const [label, score] of Object.entries(scores)) {
    if (score < weakestScore) {
      weakestScore = score;
      weakestLabel = label;
    }
  }

  // Extract peak watts and W/kg
  const allTimePeaks: Record<string, number> = {};
  const peakWkg: Record<string, number | null> = {};
  for (const secs of PROFILE_DURATIONS) {
    const label = PROFILE_DIMENSION_LABELS[secs];
    const point = allTimeCurve.find((p) => p.secs === secs);
    allTimePeaks[label] = point?.watts ?? 0;
    peakWkg[label] = point?.wkg ?? null;
  }

  const peak20min = allTimePeaks["20min"] ?? 0;
  const estimatedFtp = peak20min > 0 ? Math.round(peak20min * 0.95) : null;

  return {
    type,
    scores,
    scores42d,
    weakness: weakestLabel,
    allTimePeaks,
    peakWkg,
    estimatedFtp,
    description: PROFILE_DESCRIPTIONS[type],
  };
}

/**
 * Generate a one-line race tactic note from profile type + event type.
 */
export function getRaceTacticNote(
  profileType: ProfileType,
  eventType: string
): string {
  const tactics: Record<string, Record<string, string>> = {
    Sprinter: {
      crit: "Your sprint is your weapon — sit in, conserve through corners, and unleash in the final 200m.",
      road_race: "Conserve through the climbs and position for the final sprint. Let the climbers work, then strike.",
      time_trial: "TTs aren't your strength — focus on even pacing and limiting losses rather than attacking.",
      gran_fondo: "Use your punch to gain time on short hills, then recover on flats. Don't burn matches early.",
      hill_climb: "Pace conservatively — your sprint power won't help here. Aim for a steady, sustainable effort.",
      default: "Use your sprint power tactically — save it for the moments that matter.",
    },
    Anaerobic: {
      crit: "Your anaerobic capacity gives you an edge in attacks and surges. Go early and go hard.",
      road_race: "Attack on short climbs and punchy sections where your anaerobic power shines.",
      time_trial: "Break the effort into segments and use your anaerobic system on climbs, then recover on descents.",
      default: "Your anaerobic punch is your advantage — use it on short, decisive efforts.",
    },
    Puncheur: {
      crit: "Your combination of punch and VO2max makes you dangerous — attack and hold the gap.",
      road_race: "Target races with repeated short climbs. Attack on the steepest sections where others fade.",
      time_trial: "Pace aggressively on climbs where your VO2max helps, then settle into threshold on flats.",
      default: "Target the hilly sections and short climbs where your punch-and-sustain power dominates.",
    },
    Climber: {
      crit: "Not your ideal terrain — focus on positioning and survive until steep road features favour you.",
      road_race: "Make the race hard on the climbs. Sustained high power is your weapon — use it to shell the field.",
      time_trial: "Your sustained power translates well here. Pace evenly and let your engine do the work.",
      gran_fondo: "You'll gain time on every climb. Pace conservatively on flats and let the mountains work for you.",
      hill_climb: "This is your race. Start controlled, build to a strong tempo, and push the final third.",
      default: "Your best results come from sustained efforts — make the race hard and steady.",
    },
    "Time Trialist": {
      crit: "Crits demand surges that aren't your strength — sit in the group and avoid burning matches.",
      road_race: "Your best result comes from a long breakaway at steady power. Look for opportunities to ride off the front.",
      time_trial: "This is your race. Steady, even power effort — avoid going deep on early climbs.",
      gran_fondo: "Ride your own race at steady power targets. Don't chase surges from others.",
      default: "Your strength is sustained, even power. Control the effort and let consistency win.",
    },
    "All-rounder": {
      crit: "Your versatility is an advantage — you can respond to attacks and sprint. Race tactically.",
      road_race: "Adapt to the race as it unfolds. You can compete on climbs and in sprints — read the race.",
      time_trial: "Pace evenly and leverage your balanced power across all terrain.",
      default: "You're competitive in any format. Play to the race demands as they develop.",
    },
  };

  const profileTactics = tactics[profileType] ?? tactics["All-rounder"];
  return profileTactics[eventType] ?? profileTactics["default"] ?? "";
}
