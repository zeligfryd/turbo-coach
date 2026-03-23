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

/** Detailed activity from intervals.icu single-activity endpoint. */
export type IcuActivityDetail = IcuActivitySummary & {
  // Power metrics
  icu_weighted_avg_watts?: number | null;
  max_watts?: number | null;
  icu_variability_index?: number | null;
  icu_efficiency_factor?: number | null;
  icu_power_hr?: number | null;
  icu_power_hr_z2?: number | null;
  decoupling?: number | null;
  // FTP / power model
  icu_pm_ftp?: number | null;
  icu_pm_p_max?: number | null;
  icu_pm_w_prime?: number | null;
  icu_w_prime?: number | null;
  p_max?: number | null;
  // Load & work
  trimp?: number | null;
  icu_joules?: number | null;
  icu_joules_above_ftp?: number | null;
  carbs_used?: number | null;
  // W'bal
  icu_max_wbal_depletion?: number | null;
  // HR recovery
  icu_hrr?: {
    start_bpm?: number | null;
    end_bpm?: number | null;
    hrr?: number | null;
  } | null;
  // Speed
  average_speed?: number | null;
  max_speed?: number | null;
  // Intervals (when fetched with ?intervals=true)
  icu_intervals?: IcuInterval[] | null;
  icu_groups?: IcuIntervalGroup[] | null;
  // Stream types available
  stream_types?: string[] | null;
  // Misc
  icu_weight_kg?: number | null;
  feel?: number | null;
  rpe?: number | null;
};

/** A detected interval within an activity. */
export type IcuInterval = {
  type?: string | null; // WORK, REST, RECOVERY, etc.
  label?: string | null;
  start_index?: number | null;
  end_index?: number | null;
  elapsed_time?: number | null;
  moving_time?: number | null;
  distance?: number | null;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  max_watts?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  intensity?: number | null; // % FTP
  zone?: number | null;
  joules?: number | null;
  joules_above_ftp?: number | null;
  wbal_start?: number | null;
  wbal_end?: number | null;
  total_elevation_gain?: number | null;
  average_speed?: number | null;
  training_load?: number | null;
  decoupling?: number | null;
  [key: string]: unknown;
};

/** Grouped interval summary. */
export type IcuIntervalGroup = {
  label?: string | null;
  count?: number | null;
  average_watts?: number | null;
  average_heartrate?: number | null;
  [key: string]: unknown;
};

/** Streams from the streams.json endpoint. */
export type IcuStreams = {
  watts?: number[] | null;
  heartrate?: number[] | null;
  cadence?: number[] | null;
  altitude?: number[] | null;
  velocity_smooth?: number[] | null;
  w_bal?: number[] | null;
  fixed_watts?: number[] | null;
  [key: string]: number[] | null | undefined;
};

/** Power curve data point. */
export type IcuPowerCurvePoint = {
  secs: number;
  watts: number;
  watts_per_kg?: number | null;
};

/** Combined detail response for the activity detail API. */
export type ActivityDetailResponse = {
  summary: IcuActivityDetail;
  intervals: IcuInterval[];
  streams: IcuStreams;
  powerCurve: IcuPowerCurvePoint[];
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
