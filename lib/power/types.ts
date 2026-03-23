/** Standard durations for power curve aggregation (in seconds). */
export const CURVE_DURATIONS = [1, 2, 3, 4, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200] as const;

/** Human-readable labels for curve durations. */
export const DURATION_LABELS: Record<number, string> = {
  1: "1s",
  2: "2s",
  3: "3s",
  4: "4s",
  5: "5s",
  10: "10s",
  30: "30s",
  60: "1min",
  120: "2min",
  300: "5min",
  600: "10min",
  1200: "20min",
  1800: "30min",
  3600: "60min",
  7200: "2h",
};

/** A single best-effort data point on the power curve. */
export type PowerCurvePoint = {
  secs: number;
  watts: number;
  wkg: number | null;
  date: string; // ISO date when this best was set
};

/** Aggregated power curve data (stored in power_curve_cache). */
export type PowerCurveData = {
  allTime: PowerCurvePoint[];
  last42d: PowerCurvePoint[];
};

/** The four Coggan benchmark durations (in seconds). */
export const PROFILE_DURATIONS = [5, 60, 300, 1200] as const;

/** Labels for profile dimensions. */
export const PROFILE_DIMENSION_LABELS: Record<number, string> = {
  5: "5s",
  60: "1min",
  300: "5min",
  1200: "20min",
};

export const PROFILE_DIMENSION_NAMES: Record<number, string> = {
  5: "Neuromuscular / Sprint",
  60: "Anaerobic Capacity",
  300: "VO2max",
  1200: "Threshold (20min peak)",
};

export const SCORE_LABELS = [
  "", // 0 — unused
  "Untrained",
  "Fair",
  "Moderate",
  "Good",
  "Very Good",
  "Excellent",
] as const;

export type ProfileType =
  | "Sprinter"
  | "Anaerobic"
  | "Puncheur"
  | "Climber"
  | "Time Trialist"
  | "All-rounder";

export type PowerProfile = {
  type: ProfileType;
  scores: Record<string, number>; // keyed by PROFILE_DIMENSION_LABELS values: "5s", "1min", "5min", "20min"
  scores42d: Record<string, number>;
  weakness: string; // label of lowest-scoring dimension
  allTimePeaks: Record<string, number>; // watts
  peakWkg: Record<string, number | null>;
  estimatedFtp: number | null; // 95% of 20min peak power
  description: string;
};
