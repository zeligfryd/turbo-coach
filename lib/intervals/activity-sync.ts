/**
 * Pull activities from intervals.icu.
 *
 * intervals.icu receives rides from Garmin directly, so those carry a real TSS
 * computed against a known FTP, an intensity factor, and TRIMP — none of which
 * Strava exposes. Where intervals.icu has a ride, its numbers are better than
 * anything we can derive, and this sync makes them authoritative.
 *
 * What it deliberately does NOT do:
 *
 *   • It ignores intervals.icu's Strava-fed activities. They arrive as empty
 *     shells — no duration, distance, heart rate or load — because the same
 *     Strava API restriction applies upstream. Ingesting them would replace
 *     good rows with blank ones.
 *   • It never deletes. Indoor sessions (Zwift, via Strava) exist only on the
 *     Strava side, and account for most rides in a winter month.
 *
 * The result is one row per ride: enriched in place where intervals.icu knows
 * better, inserted where we did not have the ride at all, and left alone
 * otherwise.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createIcuClient } from "./client";
import type { IcuActivitySummary } from "./types";

export type IcuActivitySyncResult = {
  success: boolean;
  /** Existing rows whose metrics were replaced with intervals.icu's. */
  enriched: number;
  /** Rides we did not have at all. */
  inserted: number;
  /** intervals.icu rows skipped for having no usable data. */
  skippedEmpty: number;
  error?: string;
};

/**
 * A ride the same person recorded once can arrive from two systems with
 * different ids, so identity has to come from the ride itself. Start date plus
 * moving time is enough: on this athlete's history every overlapping ride
 * matched on the date, and all but three within five minutes of duration.
 * The window is generous because Garmin and Strava disagree slightly about
 * where a pause begins.
 */
const DURATION_TOLERANCE_SECONDS = 300;

type ExistingRow = {
  id: string;
  activity_date: string;
  moving_time: number | null;
  metrics_source: string | null;
};

/**
 * intervals.icu reports intensity as a percentage (45.9 … 97.0); the intensity
 * factor everywhere else in this codebase is the conventional ratio. Store the
 * ratio so the column means one thing regardless of which system filled it.
 */
function toIntensityRatio(icuIntensity: number | null | undefined): number | null {
  if (icuIntensity == null) return null;
  return Math.round((icuIntensity / 100) * 1000) / 1000;
}

/**
 * Does this intervals.icu row carry real data? Garmin-sourced rides do;
 * Strava-fed ones are placeholders with nothing but an id and a date.
 */
export function hasUsableMetrics(activity: IcuActivitySummary): boolean {
  return activity.icu_training_load != null || activity.moving_time != null;
}

function metricsFrom(activity: IcuActivitySummary) {
  return {
    icu_activity_id: activity.id,
    metrics_source: "intervals.icu" as const,
    icu_training_load: activity.icu_training_load ?? null,
    icu_intensity: toIntensityRatio(activity.icu_intensity),
    icu_ftp: activity.icu_ftp ?? null,
    icu_atl: activity.icu_atl ?? null,
    icu_ctl: activity.icu_ctl ?? null,
    avg_power:
      activity.icu_average_watts != null ? Math.round(activity.icu_average_watts) : null,
    normalized_power:
      activity.icu_weighted_avg_watts != null
        ? Math.round(activity.icu_weighted_avg_watts)
        : null,
    avg_hr: activity.average_heartrate != null ? Math.round(activity.average_heartrate) : null,
    max_hr: activity.max_heartrate != null ? Math.round(activity.max_heartrate) : null,
    avg_cadence:
      activity.average_cadence != null ? Math.round(activity.average_cadence) : null,
    calories: activity.calories != null ? Math.round(activity.calories) : null,
    elevation_gain: activity.total_elevation_gain ?? null,
    trimp: activity.trimp ?? null,
    device_name: activity.device_name ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** Match an intervals.icu ride to one we already hold. */
export function findExistingMatch(
  activity: IcuActivitySummary,
  candidates: ExistingRow[],
): ExistingRow | null {
  const date = activity.start_date_local?.slice(0, 10);
  if (!date) return null;

  const sameDay = candidates.filter((row) => row.activity_date === date);
  if (sameDay.length === 0) return null;

  const movingTime = activity.moving_time;
  if (movingTime != null) {
    const byDuration = sameDay
      .filter((row) => row.moving_time != null)
      .map((row) => ({ row, delta: Math.abs((row.moving_time as number) - movingTime) }))
      .filter((entry) => entry.delta <= DURATION_TOLERANCE_SECONDS)
      .sort((a, b) => a.delta - b.delta);
    if (byDuration.length > 0) return byDuration[0].row;
  }

  // A single ride on that day and no usable duration to compare: take it.
  return sameDay.length === 1 ? sameDay[0] : null;
}

export async function syncIcuActivities(
  supabase: SupabaseClient,
  userId: string,
  options: { oldest: string; newest: string; apiKey: string; athleteId: string },
): Promise<IcuActivitySyncResult> {
  const result: IcuActivitySyncResult = {
    success: false,
    enriched: 0,
    inserted: 0,
    skippedEmpty: 0,
  };

  try {
    const client = createIcuClient(options.apiKey, options.athleteId);
    const activities = await client.fetchActivitiesInBatches(options.oldest, options.newest);

    const { data: existingRows, error: readError } = await supabase
      .from("activities")
      .select("id, activity_date, moving_time, metrics_source")
      .eq("user_id", userId)
      .gte("activity_date", options.oldest)
      .lte("activity_date", options.newest);

    if (readError) return { ...result, error: readError.message };
    const existing = (existingRows ?? []) as ExistingRow[];
    // Rows claimed during this run, so two intervals.icu rides on the same day
    // cannot both match the same local row.
    const claimed = new Set<string>();

    for (const activity of activities) {
      if (!hasUsableMetrics(activity)) {
        result.skippedEmpty += 1;
        continue;
      }

      const match = findExistingMatch(
        activity,
        existing.filter((row) => !claimed.has(row.id)),
      );

      if (match) {
        claimed.add(match.id);
        const { error } = await supabase
          .from("activities")
          .update(metricsFrom(activity))
          .eq("id", match.id)
          .eq("user_id", userId);
        if (error) return { ...result, error: error.message };
        result.enriched += 1;
        continue;
      }

      const startDate = activity.start_date_local;
      const { error } = await supabase.from("activities").upsert(
        {
          user_id: userId,
          external_id: activity.id,
          source: "intervals.icu",
          type: activity.type ?? null,
          name: activity.name ?? null,
          start_date_local: startDate ?? null,
          activity_date: startDate ? startDate.slice(0, 10) : options.newest,
          distance: activity.distance ?? null,
          moving_time: activity.moving_time ?? null,
          elapsed_time: activity.elapsed_time ?? null,
          raw_data: activity as unknown as Record<string, unknown>,
          ...metricsFrom(activity),
        },
        { onConflict: "user_id,external_id,source" },
      );
      if (error) return { ...result, error: error.message };
      result.inserted += 1;
    }

    return { ...result, success: true };
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : "Unknown intervals.icu sync error",
    };
  }
}
