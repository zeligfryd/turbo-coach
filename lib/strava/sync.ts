import type { SupabaseClient } from "@supabase/supabase-js";
import { createStravaClient } from "./client";
import { getValidStravaToken } from "./token";
import { computeAllMetrics } from "@/lib/activity/compute-metrics";
import type { StravaActivitySummary } from "./types";

export type SyncResult = {
  success: boolean;
  activitiesSynced: number;
  error?: string;
};

export type SyncMode = "full" | "incremental";

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

/**
 * Sync Strava activities.
 *
 * - "full": fetches 2 years of history, upserts summaries (no streams).
 * - "incremental": fetches activities since last sync, then fetches streams
 *   for each new activity and computes accurate metrics (NP, avg power, TSS, etc.).
 */
export async function syncStravaActivities(
  supabase: SupabaseClient,
  userId: string,
  mode: SyncMode = "full"
): Promise<SyncResult> {
  try {
    await supabase
      .from("strava_connections")
      .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    const { accessToken } = await getValidStravaToken(supabase, userId);
    const client = createStravaClient(accessToken);

    // Determine date range
    let oldest: Date;
    if (mode === "incremental") {
      const { data: conn } = await supabase
        .from("strava_connections")
        .select("last_synced_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (conn?.last_synced_at) {
        oldest = new Date(conn.last_synced_at);
        // Go back 1 extra day to catch any edge cases
        oldest.setDate(oldest.getDate() - 1);
      } else {
        // No previous sync — fall back to 2 years
        oldest = new Date();
        oldest.setFullYear(oldest.getFullYear() - 2);
      }
    } else {
      oldest = new Date();
      oldest.setFullYear(oldest.getFullYear() - 2);
    }
    const newest = new Date();

    const activities = await client.fetchAllActivities(oldest, newest);

    if (activities.length > 0) {
      // Upsert activity summaries
      const chunkSize = 500;
      for (let i = 0; i < activities.length; i += chunkSize) {
        const chunk = activities.slice(i, i + chunkSize);
        const rows = chunk.map((a) => mapStravaActivityToRow(userId, a));

        const { error } = await supabase
          .from("activities")
          .upsert(rows, { onConflict: "user_id,external_id,source" });

        if (error) {
          throw new Error(`Upsert failed: ${error.message}`);
        }
      }

      // Fetch streams and compute accurate metrics for all synced activities
      await computeMetricsForActivities(supabase, userId, client, activities);
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

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fetch streams from Strava for each activity and compute accurate metrics.
 * Updates the DB rows with computed values.
 */
async function computeMetricsForActivities(
  supabase: SupabaseClient,
  userId: string,
  client: ReturnType<typeof createStravaClient>,
  activities: StravaActivitySummary[]
) {
  // Get user FTP
  const { data: profile } = await supabase
    .from("users")
    .select("ftp")
    .eq("id", userId)
    .maybeSingle();
  const ftp = (profile?.ftp as number | null) ?? null;

  // Process each activity — fetch streams and compute metrics
  for (const activity of activities) {
    try {
      const streams = await client.fetchActivityStreams(activity.id);
      const watts = streams?.watts;
      if (!watts || watts.length === 0) continue;

      const heartrate = streams?.heartrate ?? null;
      const cadence = streams?.cadence ?? null;
      const durationSeconds = activity.moving_time ?? watts.length;

      const computed = computeAllMetrics(watts, heartrate, cadence, ftp, durationSeconds);

      const updates: Record<string, unknown> = {
        avg_power: computed.avgPower,
        normalized_power: computed.normalizedPower,
        max_power: computed.maxPower,
        updated_at: new Date().toISOString(),
      };
      if (computed.tss != null) updates.icu_training_load = computed.tss;
      if (computed.avgHr != null) updates.avg_hr = computed.avgHr;
      if (computed.maxHr != null) updates.max_hr = computed.maxHr;
      if (computed.avgCadence != null) updates.avg_cadence = computed.avgCadence;

      await supabase
        .from("activities")
        .update(updates)
        .eq("user_id", userId)
        .eq("external_id", String(activity.id))
        .eq("source", "strava");
    } catch (err) {
      // Log but don't fail the whole sync for a single activity's streams
      console.warn(`[Sync] Failed to compute metrics for activity ${activity.id}:`, err);
    }
  }
}
