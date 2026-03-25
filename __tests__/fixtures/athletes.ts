import type { PowerCurvePoint } from "@/lib/power/types";

/**
 * Six athlete profiles designed to trigger each classifyType branch in coggan.ts.
 *
 * Male W/kg thresholds (score boundaries):
 *   5s:   [0, 8.0, 11.0, 14.0, 17.0, 21.0]  → scores 1-6
 *   1min: [0, 3.5,  5.0,  6.5,  8.0, 10.0]
 *   5min: [0, 2.5,  3.5,  4.5,  5.5,  6.5]
 *   20min:[0, 2.0,  3.0,  3.8,  4.5,  5.5]
 *
 * Classification priority (checked in order):
 *   1. All-rounder: max - min <= 1
 *   2. Sprinter: shortAvg - longAvg >= 2
 *   3. Anaerobic: s1m >= s5 && s1m - s5m >= 2 && s1m - s20m >= 2
 *   4. Climber: longAvg - shortAvg >= 1.5 OR (s5m >= s5 && s20m >= s1m && longAvg > shortAvg)
 *   5. Time Trialist: s20m >= s5m && s20m > s1m && s20m > s5 && |s5m - s20m| <= 1
 *   6. Puncheur: s1m >= s20m + 1 && s5m >= s20m
 *   7. Fallback: shortAvg > longAvg → Anaerobic/Sprinter; s20m >= s5m → TT; else Climber
 */

export type AthleteFixture = {
  name: string;
  weight: number;
  gender: "male" | "female";
  expectedType: string;
  expectedScores: { "5s": number; "1min": number; "5min": number; "20min": number };
  curve: PowerCurvePoint[];
};

// Scores: [6, 5, 3, 3] → shortAvg=5.5, longAvg=3.0, diff=2.5 >= 2 → Sprinter
export const SPRINTER_ATHLETE: AthleteFixture = {
  name: "Sprinter",
  weight: 86,
  gender: "male",
  expectedType: "Sprinter",
  expectedScores: { "5s": 6, "1min": 5, "5min": 3, "20min": 3 },
  curve: [
    { secs: 5, watts: 1892, wkg: 22.0, date: "" },    // >= 21.0 → 6
    { secs: 60, watts: 731, wkg: 8.5, date: "" },     // >= 8.0  → 5
    { secs: 300, watts: 301, wkg: 3.5, date: "" },    // >= 3.5  → 3
    { secs: 1200, watts: 258, wkg: 3.0, date: "" },   // >= 3.0  → 3
  ],
};

// Scores: [3, 5, 3, 3] → max-min=2, shortAvg=4, longAvg=3, diff=1 (not sprinter)
// s1m(5) >= s5(3) && 5-3=2 >= 2 && 5-3=2 >= 2 → Anaerobic
export const ANAEROBIC_ATHLETE: AthleteFixture = {
  name: "Anaerobic",
  weight: 78,
  gender: "male",
  expectedType: "Anaerobic",
  expectedScores: { "5s": 3, "1min": 5, "5min": 3, "20min": 3 },
  curve: [
    { secs: 5, watts: 858, wkg: 11.0, date: "" },     // >= 11.0 → 3
    { secs: 60, watts: 624, wkg: 8.0, date: "" },     // >= 8.0  → 5
    { secs: 300, watts: 273, wkg: 3.5, date: "" },    // >= 3.5  → 3
    { secs: 1200, watts: 234, wkg: 3.0, date: "" },   // >= 3.0  → 3
  ],
};

// Scores: [3, 5, 4, 3] → max-min=2, shortAvg=4, longAvg=3.5, diff=0.5 (not sprinter)
// s1m(5)>=s5(3) but s1m-s5m=1 < 2 (not anaerobic)
// longAvg-shortAvg=-0.5 < 1.5 (not climber 1st), s5m(4)>=s5(3) but s20m(3)<s1m(5) (not climber 2nd)
// s20m(3)>=s5m(4)? No (not TT)
// s1m(5) >= s20m(3)+1=4 && s5m(4) >= s20m(3) → Puncheur
export const PUNCHEUR_ATHLETE: AthleteFixture = {
  name: "Puncheur",
  weight: 72,
  gender: "male",
  expectedType: "Puncheur",
  expectedScores: { "5s": 3, "1min": 5, "5min": 4, "20min": 3 },
  curve: [
    { secs: 5, watts: 792, wkg: 11.0, date: "" },     // >= 11.0 → 3
    { secs: 60, watts: 576, wkg: 8.0, date: "" },     // >= 8.0  → 5
    { secs: 300, watts: 324, wkg: 4.5, date: "" },    // >= 4.5  → 4
    { secs: 1200, watts: 216, wkg: 3.0, date: "" },   // >= 3.0  → 3
  ],
};

// Scores: [2, 3, 5, 5] → max-min=3, shortAvg=2.5, longAvg=5.0, diff=2.5 >= 1.5 → Climber
export const CLIMBER_ATHLETE: AthleteFixture = {
  name: "Climber",
  weight: 62,
  gender: "male",
  expectedType: "Climber",
  expectedScores: { "5s": 2, "1min": 3, "5min": 5, "20min": 5 },
  curve: [
    { secs: 5, watts: 558, wkg: 9.0, date: "" },      // >= 8.0, < 11.0 → 2
    { secs: 60, watts: 310, wkg: 5.0, date: "" },     // >= 5.0  → 3
    { secs: 300, watts: 341, wkg: 5.5, date: "" },    // >= 5.5  → 5
    { secs: 1200, watts: 279, wkg: 4.5, date: "" },   // >= 4.5  → 5
  ],
};

// Scores: [4, 2, 3, 4] → max-min=2, shortAvg=3, longAvg=3.5
// Not AR, not sprinter (diff=-0.5), not anaerobic (s1m(2)<s5(4))
// Climber 1st: longAvg-shortAvg=0.5 < 1.5 → No
// Climber 2nd: s5m(3) >= s5(4)? No → skip
// TT primary: s20m(4)>s5(4)? No (4>4 false) → skip
// Puncheur: s1m(2) >= s20m(4)+1=5? No → skip
// Fallback: shortAvg(3) <= longAvg(3.5), s20m(4) >= s5m(3) → Time Trialist
export const TIME_TRIALIST_ATHLETE: AthleteFixture = {
  name: "Time Trialist",
  weight: 80,
  gender: "male",
  expectedType: "Time Trialist",
  expectedScores: { "5s": 4, "1min": 2, "5min": 3, "20min": 4 },
  curve: [
    { secs: 5, watts: 1120, wkg: 14.0, date: "" },    // >= 14.0 → 4
    { secs: 60, watts: 320, wkg: 4.0, date: "" },     // >= 3.5, < 5.0 → 2
    { secs: 300, watts: 280, wkg: 3.5, date: "" },    // >= 3.5  → 3
    { secs: 1200, watts: 304, wkg: 3.8, date: "" },   // >= 3.8  → 4
  ],
};

// Scores: [4, 4, 4, 4] → max-min=0 <= 1 → All-rounder
export const ALL_ROUNDER_ATHLETE: AthleteFixture = {
  name: "All-rounder",
  weight: 75,
  gender: "male",
  expectedType: "All-rounder",
  expectedScores: { "5s": 4, "1min": 4, "5min": 4, "20min": 4 },
  curve: [
    { secs: 5, watts: 1050, wkg: 14.0, date: "" },    // >= 14.0 → 4
    { secs: 60, watts: 488, wkg: 6.5, date: "" },     // >= 6.5  → 4
    { secs: 300, watts: 338, wkg: 4.5, date: "" },    // >= 4.5  → 4
    { secs: 1200, watts: 285, wkg: 3.8, date: "" },   // >= 3.8  → 4
  ],
};

export const ALL_ATHLETES: AthleteFixture[] = [
  SPRINTER_ATHLETE,
  ANAEROBIC_ATHLETE,
  PUNCHEUR_ATHLETE,
  CLIMBER_ATHLETE,
  TIME_TRIALIST_ATHLETE,
  ALL_ROUNDER_ATHLETE,
];
