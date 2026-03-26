import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStravaClient } from "@/lib/strava/client";
import { getValidStravaToken } from "@/lib/strava/token";
import { createIcuClient } from "@/lib/intervals/client";
import { computeAllMetrics } from "@/lib/activity/compute-metrics";
import type { IcuStreams, IcuInterval, IcuPowerCurvePoint, IcuActivityDetail, ActivityDetailResponse } from "@/lib/intervals/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Look up the activity
    const { data: activity, error: actError } = await supabase
      .from("activities")
      .select("external_id, source, user_id, activity_date, moving_time, distance, icu_ftp, avg_power, normalized_power, avg_hr, max_hr, avg_cadence, calories, icu_training_load, elevation_gain, max_power, name, type, start_date_local, icu_atl, icu_ctl")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (actError || !activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    if (activity.source === "strava") {
      return handleStravaActivity(supabase, user.id, id, activity);
    }

    // ICU-sourced activity — use ICU API directly
    return handleIcuActivity(supabase, user.id, activity);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[ActivityDetail] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function handleStravaActivity(
  supabase: any,
  userId: string,
  activityDbId: string,
  activity: Record<string, any>
) {
  // Get a valid Strava token
  const { accessToken } = await getValidStravaToken(supabase, userId);
  const client = createStravaClient(accessToken);
  const stravaId = activity.external_id;

  // Fetch detail and streams in parallel
  const [detailResult, streamsResult] = await Promise.allSettled([
    client.fetchActivityDetail(stravaId),
    client.fetchActivityStreams(stravaId),
  ]);

  if (streamsResult.status === "rejected") {
    console.error("[ActivityDetail] Strava streams failed:", streamsResult.reason);
  }

  const stravaDetail = detailResult.status === "fulfilled" ? detailResult.value : null;
  const stravaStreams = streamsResult.status === "fulfilled" ? streamsResult.value : null;

  // Get user's FTP from profile
  const { data: profile } = await supabase
    .from("users")
    .select("ftp, weight")
    .eq("id", userId)
    .maybeSingle();

  const ftp = profile?.ftp ?? activity.icu_ftp ?? null;
  const weight = profile?.weight ?? null;

  // Compute metrics from streams
  const watts = stravaStreams?.watts ?? [];
  const heartrate = stravaStreams?.heartrate ?? null;
  const cadence = stravaStreams?.cadence ?? null;
  const durationSeconds = activity.moving_time ?? watts.length;

  let computed = null;
  if (watts.length > 0) {
    computed = computeAllMetrics(watts, heartrate, cadence, ftp, durationSeconds);
  }

  // Build summary in the same shape as IcuActivityDetail
  const summary: IcuActivityDetail = {
    id: stravaId,
    type: activity.type ?? stravaDetail?.type ?? "Ride",
    name: activity.name ?? stravaDetail?.name ?? "Activity",
    description: stravaDetail?.description ?? null,
    start_date_local: activity.start_date_local,
    distance: activity.distance ?? stravaDetail?.distance ?? null,
    moving_time: activity.moving_time ?? stravaDetail?.moving_time ?? null,
    elapsed_time: stravaDetail?.elapsed_time ?? activity.moving_time ?? null,
    icu_training_load: computed?.tss ?? activity.icu_training_load ?? null,
    icu_intensity: computed?.intensityFactor ?? null,
    icu_ftp: ftp,
    icu_average_watts: computed?.avgPower ?? activity.avg_power ?? null,
    icu_weighted_avg_watts: computed?.normalizedPower ?? activity.normalized_power ?? null,
    max_watts: computed?.maxPower ?? activity.max_power ?? stravaDetail?.max_watts ?? null,
    average_heartrate: computed?.avgHr ?? activity.avg_hr ?? null,
    max_heartrate: computed?.maxHr ?? activity.max_hr ?? null,
    average_cadence: computed?.avgCadence ?? activity.avg_cadence ?? null,
    calories: activity.calories ?? stravaDetail?.calories ?? null,
    total_elevation_gain: activity.elevation_gain ?? stravaDetail?.total_elevation_gain ?? null,
    icu_atl: activity.icu_atl ?? null,
    icu_ctl: activity.icu_ctl ?? null,
    // Computed metrics
    icu_variability_index: computed?.variabilityIndex ?? null,
    icu_efficiency_factor: computed?.efficiencyFactor ?? null,
    icu_power_hr: computed?.powerHr ?? null,
    decoupling: computed?.decoupling ?? null,
    trimp: computed?.trimp ?? null,
    icu_joules: watts.length > 0 ? watts.reduce((a, b) => a + Math.max(0, b), 0) : null,
    icu_joules_above_ftp: ftp && watts.length > 0
      ? watts.reduce((a, w) => a + Math.max(0, w - ftp), 0)
      : null,
    icu_max_wbal_depletion: computed?.wbalMaxDepletion ?? null,
    average_speed: stravaDetail?.average_speed ?? null,
    max_speed: stravaDetail?.max_speed ?? null,
    icu_weight_kg: weight,
    // Not available from Strava
    icu_pm_ftp: null,
    icu_pm_p_max: null,
    icu_pm_w_prime: null,
    icu_w_prime: null,
    p_max: null,
    icu_power_hr_z2: null,
    carbs_used: null,
    icu_hrr: null,
    feel: null,
    rpe: null,
  };

  // Convert streams to ICU format
  const streams: IcuStreams = {};
  if (stravaStreams) {
    if (stravaStreams.watts) streams.watts = stravaStreams.watts;
    if (stravaStreams.heartrate) streams.heartrate = stravaStreams.heartrate;
    if (stravaStreams.cadence) streams.cadence = stravaStreams.cadence;
    if (stravaStreams.altitude) streams.altitude = stravaStreams.altitude;
    if (stravaStreams.velocity_smooth) streams.velocity_smooth = stravaStreams.velocity_smooth;
    if (stravaStreams.distance) streams.distance = stravaStreams.distance;
  }
  if (computed?.wbal) {
    streams.w_bal = computed.wbal;
  }

  // Convert computed power curve
  const powerCurve: IcuPowerCurvePoint[] = (computed?.powerCurve ?? []).map((p) => ({
    secs: p.secs,
    watts: p.watts,
    watts_per_kg: weight ? Number((p.watts / weight).toFixed(2)) : null,
  }));

  // Convert detected intervals to ICU format
  const intervals: IcuInterval[] = (computed?.intervals ?? []).map((iv) => ({
    type: iv.type,
    label: iv.label,
    start_index: iv.startIndex,
    end_index: iv.endIndex,
    elapsed_time: iv.elapsedTime,
    moving_time: iv.elapsedTime,
    average_watts: iv.avgWatts,
    max_watts: iv.maxWatts,
    average_heartrate: iv.avgHr,
    max_heartrate: iv.maxHr,
    average_cadence: iv.avgCadence,
    zone: iv.zone,
    intensity: iv.intensity,
    weighted_average_watts: null,
    distance: null,
    joules: null,
    joules_above_ftp: null,
    wbal_start: null,
    wbal_end: null,
    total_elevation_gain: null,
    average_speed: null,
    training_load: null,
    decoupling: null,
  }));

  // Update DB with computed values so calendar cards and coach stay consistent
  if (computed) {
    const updates: Record<string, unknown> = {
      avg_power: computed.avgPower,
      normalized_power: computed.normalizedPower,
      max_power: computed.maxPower,
    };
    if (computed.tss != null) updates.icu_training_load = computed.tss;
    if (computed.avgHr != null) updates.avg_hr = computed.avgHr;
    if (computed.maxHr != null) updates.max_hr = computed.maxHr;
    if (computed.avgCadence != null) updates.avg_cadence = computed.avgCadence;

    // Fire-and-forget — don't block the response
    supabase
      .from("activities")
      .update(updates)
      .eq("id", activityDbId)
      .eq("user_id", userId)
      .then(() => {});
  }

  const response: ActivityDetailResponse = {
    summary,
    intervals,
    streams,
    powerCurve,
  };

  return NextResponse.json(response);
}

async function handleIcuActivity(
  supabase: any,
  userId: string,
  activity: Record<string, any>
) {
  const { data: connection } = await supabase
    .from("icu_connections")
    .select("api_key, athlete_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json(
      { error: "No intervals.icu connection configured" },
      { status: 404 }
    );
  }

  const client = createIcuClient(connection.api_key, connection.athlete_id);
  const externalId = activity.external_id;

  const [detailResult, streamsResult, powerCurveResult] = await Promise.allSettled([
    client.fetchActivityDetail(externalId),
    client.fetchStreams(externalId),
    client.fetchPowerCurve(externalId),
  ]);

  if (detailResult.status === "rejected") {
    return NextResponse.json(
      { error: `Failed to fetch from intervals.icu: ${detailResult.reason}` },
      { status: 502 }
    );
  }

  const summary = detailResult.value;
  const streams: IcuStreams =
    streamsResult.status === "fulfilled" ? streamsResult.value : {};
  const powerCurve: IcuPowerCurvePoint[] =
    powerCurveResult.status === "fulfilled" ? powerCurveResult.value : [];
  const intervals: IcuInterval[] = summary.icu_intervals ?? [];

  return NextResponse.json({ summary, intervals, streams, powerCurve } satisfies ActivityDetailResponse);
}
