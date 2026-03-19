import type { SupabaseClient } from "@supabase/supabase-js";
import { createStravaClient } from "./client";
import { getValidStravaToken } from "./token";
import type { StravaActivitySummary } from "./types";

type SyncResult = {
  success: boolean;
  activitiesSynced: number;
  error?: string;
};

function mapStravaActivityToRow(userId: string, activity: StravaActivitySummary) {
  const startDate = activity.start_date_local;
  const activityDate = startDate.slice(0, 10);

  return {
    user_id: userId,
    external_id: String(activity.id),
    source: "strava",
    type: activity.sport_type ?? activity.type ?? null,
    name: activity.name ?? null,
    description: null,
    start_date_local: startDate,
    activity_date: activityDate,
    distance: activity.distance ?? null,
    moving_time: activity.moving_time ?? null,
    elapsed_time: activity.elapsed_time ?? null,
    icu_training_load: activity.suffer_score ?? null,
    icu_intensity: null,
    icu_ftp: null,
    avg_power: activity.average_watts != null ? Math.round(activity.average_watts) : null,
    normalized_power: activity.weighted_average_watts != null ? Math.round(activity.weighted_average_watts) : null,
    max_power: activity.max_watts != null ? Math.round(activity.max_watts) : null,
    avg_hr: activity.average_heartrate != null ? Math.round(activity.average_heartrate) : null,
    max_hr: activity.max_heartrate != null ? Math.round(activity.max_heartrate) : null,
    avg_cadence: activity.average_cadence != null ? Math.round(activity.average_cadence) : null,
    calories: activity.calories != null ? Math.round(activity.calories) : null,
    elevation_gain: activity.total_elevation_gain ?? null,
    icu_atl: null,
    icu_ctl: null,
    raw_data: activity as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };
}

export async function syncStravaActivities(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncResult> {
  try {
    const { accessToken } = await getValidStravaToken(supabase, userId);
    const client = createStravaClient(accessToken);

    // Always fetch full 2-year history — upsert handles dedup
    const oldest = new Date();
    oldest.setFullYear(oldest.getFullYear() - 2);
    const newest = new Date();

    const activities = await client.fetchAllActivities(oldest, newest);

    if (activities.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < activities.length; i += chunkSize) {
        const chunk = activities.slice(i, i + chunkSize);
        const rows = chunk.map((a) => mapStravaActivityToRow(userId, a));

        const { error } = await supabase
          .from("icu_activities")
          .upsert(rows, { onConflict: "user_id,external_id,source" });

        if (error) {
          throw new Error(`Upsert failed: ${error.message}`);
        }
      }
    }

    await supabase
      .from("strava_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: "idle",
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return { success: true, activitiesSynced: activities.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";

    await supabase
      .from("strava_connections")
      .update({
        sync_status: "error",
        sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return { success: false, activitiesSynced: 0, error: message };
  }
}
