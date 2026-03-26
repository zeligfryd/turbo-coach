import type { SupabaseClient } from "@supabase/supabase-js";
import { createIcuClient } from "./client";
import type { IcuActivitySummary } from "./types";

type SyncResult = {
  success: boolean;
  activitiesSynced: number;
  error?: string;
};

function toActivityDate(startDateLocal: string): string {
  // Extract the date portion (YYYY-MM-DD) from the ISO-ish timestamp
  return startDateLocal.slice(0, 10);
}

function mapActivityToRow(userId: string, activity: IcuActivitySummary) {
  return {
    user_id: userId,
    external_id: activity.id,
    type: activity.type ?? null,
    name: activity.name ?? null,
    description: activity.description ?? null,
    start_date_local: activity.start_date_local,
    activity_date: toActivityDate(activity.start_date_local),
    distance: activity.distance ?? null,
    moving_time: activity.moving_time ?? null,
    elapsed_time: activity.elapsed_time ?? null,
    icu_training_load: activity.icu_training_load ?? null,
    icu_intensity: activity.icu_intensity ?? null,
    icu_ftp: activity.icu_ftp ?? null,
    avg_power: activity.icu_average_watts ?? null,
    normalized_power: activity.icu_weighted_avg_watts ?? null,
    max_power: null,
    avg_hr: activity.average_heartrate ?? null,
    max_hr: activity.max_heartrate ?? null,
    avg_cadence: activity.average_cadence ?? null,
    calories: activity.calories ?? null,
    elevation_gain: activity.total_elevation_gain ?? null,
    icu_atl: activity.icu_atl ?? null,
    icu_ctl: activity.icu_ctl ?? null,
    raw_data: activity as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };
}

export async function syncActivities(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
  athleteId: string,
  _lastSyncedAt: string | null
): Promise<SyncResult> {
  const client = createIcuClient(apiKey, athleteId);

  // Always fetch full history — upsert handles dedup, and this ensures
  // all activities get the latest field mappings on every sync.
  const oldest = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10);
  })();

  const newest = new Date().toISOString().slice(0, 10);

  try {
    const activities = await client.fetchActivitiesInBatches(oldest, newest);

    if (activities.length > 0) {
      // Upsert in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < activities.length; i += chunkSize) {
        const chunk = activities.slice(i, i + chunkSize);
        const rows = chunk.map((a) => mapActivityToRow(userId, a));

        const { error } = await supabase
          .from("activities")
          .upsert(rows, { onConflict: "user_id,external_id,source" });

        if (error) {
          throw new Error(`Upsert failed: ${error.message}`);
        }
      }
    }

    // Update connection state
    await supabase
      .from("icu_connections")
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
      .from("icu_connections")
      .update({
        sync_status: "error",
        sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return { success: false, activitiesSynced: 0, error: message };
  }
}
