/** Shape of an activity summary from the intervals.icu API. */
export type IcuActivitySummary = {
  id: string;
  type: string;
  name: string;
  description?: string | null;
  start_date_local: string;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
  icu_ftp?: number | null;
  icu_average_watts?: number | null;
  icu_weighted_avg_watts?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  calories?: number | null;
  total_elevation_gain?: number | null;
  icu_atl?: number | null;
  icu_ctl?: number | null;
};

/** Shape of a wellness day from the intervals.icu API. */
export type IcuWellnessDay = {
  id: string;
  ctl: number | null;
  atl: number | null;
  rampRate: number | null;
  restingHR: number | null;
  hrv: number | null;
  [key: string]: unknown;
};

/** Shape of the icu_connections DB row. */
export type IcuConnectionRow = {
  id: string;
  user_id: string;
  api_key: string;
  athlete_id: string;
  last_synced_at: string | null;
  sync_status: "idle" | "syncing" | "error";
  sync_error: string | null;
  created_at: string;
  updated_at: string;
};

/** Lightweight type for calendar display. */
export type CalendarActivity = {
  id: string;
  activity_date: string;
  name: string | null;
  type: string | null;
  moving_time: number | null;
  icu_training_load: number | null;
  avg_power: number | null;
  normalized_power: number | null;
  avg_hr: number | null;
  distance: number | null;
  elevation_gain: number | null;
  source: string;
};
