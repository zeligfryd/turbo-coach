export type StravaConnectionRow = {
  id: string;
  user_id: string;
  strava_athlete_id: number;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  scope: string | null;
  last_synced_at: string | null;
  sync_status: "idle" | "syncing" | "error";
  sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number };
};

export type StravaActivitySummary = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  calories?: number;
  kilojoules?: number;
  suffer_score?: number;
};

/** Detailed activity from Strava's GET /activities/{id} endpoint. */
export type StravaActivityDetail = StravaActivitySummary & {
  description?: string | null;
  average_speed?: number;
  max_speed?: number;
  device_watts?: boolean;
  has_heartrate?: boolean;
  laps?: StravaLap[];
};

/** A lap within a Strava activity. */
export type StravaLap = {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  lap_index: number;
  total_elevation_gain?: number;
};

/** Stream data from Strava's GET /activities/{id}/streams endpoint. */
export type StravaStreams = {
  time?: number[];
  watts?: number[];
  heartrate?: number[];
  cadence?: number[];
  altitude?: number[];
  velocity_smooth?: number[];
  distance?: number[];
  grade_smooth?: number[];
};
