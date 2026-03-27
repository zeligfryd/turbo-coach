export const EVENT_TYPES = [
  "crit",
  "gran_fondo",
  "time_trial",
  "road_race",
  "gravel",
  "cyclocross",
  "hill_climb",
  "sportive",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  crit: "Criterium",
  gran_fondo: "Gran Fondo",
  time_trial: "Time Trial",
  road_race: "Road Race",
  gravel: "Gravel",
  cyclocross: "Cyclocross",
  hill_climb: "Hill Climb",
  sportive: "Sportive",
  other: "Other",
};

export type GpxPoint = {
  lat: number;
  lon: number;
  ele: number;
  distanceKm: number; // cumulative from start
};

export type GpxSegment = {
  label: string;
  startKm: number;
  endKm: number;
  distanceKm: number;
  elevationGainM: number;
  avgGradientPercent: number;
  type: "climb" | "descent" | "flat";
};

export type GpxData = {
  points: GpxPoint[];
  segments: GpxSegment[];
  totalDistanceKm: number;
  totalElevationM: number;
};

export type PacingSegment = {
  label: string;
  startKm: number;
  endKm: number;
  targetPowerW: number;
  targetPowerPercent: number; // % FTP
  estimatedTimeMin: number;
  advice: string;
  targetHrZone: string | null;  // e.g. "Z2", "Z3-Z4"
  targetHrBpm: string | null;   // e.g. "145-160"
};

export type PacingPlan = {
  overallTargetNpW: number;
  estimatedFinishTimeMin: number;
  strategy: string;
  segments: PacingSegment[];
};

export const AMBITION_LEVELS = ["conservative", "realistic", "aggressive", "all_out"] as const;
export type AmbitionLevel = (typeof AMBITION_LEVELS)[number];

export const AMBITION_LABELS: Record<AmbitionLevel, string> = {
  conservative: "Conservative",
  realistic: "Realistic",
  aggressive: "Aggressive",
  all_out: "All-out",
};

export const AMBITION_SCALING: Record<AmbitionLevel, { power: number; time: number }> = {
  conservative: { power: 0.93, time: 1.07 },
  realistic: { power: 1.0, time: 1.0 },
  aggressive: { power: 1.05, time: 0.97 },
  all_out: { power: 1.10, time: 0.93 },
};

export type RaceEvent = {
  id: string;
  user_id: string;
  name: string;
  race_date: string;
  event_type: EventType;
  distance_km: number | null;
  elevation_m: number | null;
  notes: string | null;
  gpx_data: GpxData | null;
  pacing_plan: PacingPlan | null;
  readiness_score: number | null;
  readiness_interpretation: string | null;
  created_at: string;
  updated_at: string;
};

/** Lightweight version for calendar display */
export type CalendarRaceEvent = {
  id: string;
  race_date: string;
  name: string;
  event_type: EventType;
  distance_km: number | null;
  elevation_m: number | null;
};
