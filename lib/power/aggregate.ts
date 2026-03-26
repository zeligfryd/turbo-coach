import type { SupabaseClient } from "@supabase/supabase-js";
import { createIcuClient } from "@/lib/intervals/client";
import { buildPowerProfile } from "./coggan";
import { CURVE_DURATIONS, type PowerCurvePoint, type PowerProfile } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Recompute the user's aggregated power curve and profile.
 * Uses the intervals.icu athlete-level power curve endpoint (2 fast API calls)
 * instead of per-activity fetching.
 */
export async function recomputePowerCurve(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    // Get ICU connection
    const { data: conn } = await supabase
      .from("icu_connections")
      .select("api_key, athlete_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!conn || !(conn as any).api_key) {
      console.log("[PowerCurve] No ICU connection for user", userId);
      return;
    }

    const client = createIcuClient((conn as any).api_key, (conn as any).athlete_id);

    // Get user weight + gender
    const { data: profile } = await supabase
      .from("users")
      .select("weight, gender")
      .eq("id", userId)
      .maybeSingle();

    const weight = (profile as any)?.weight ? Number((profile as any).weight) : null;
    const gender: "male" | "female" = (profile as any)?.gender === "female" ? "female" : "male";

    // Single API call fetching both all-time and 42-day curves
    const curveMap = await client.fetchAthletePowerCurves(["all", "42d"]).catch((err) => {
      console.error("[PowerCurve] Failed to fetch athlete power curves:", err);
      return new Map<string, { secs: number; watts: number; watts_per_kg?: number | null }[]>();
    });

    const allTimeCurve = curveMap.get("all") ?? [];
    const last42dCurve = curveMap.get("42d") ?? [];

    if (allTimeCurve.length === 0) {
      console.log("[PowerCurve] No power curve data returned from ICU. Curve map size:", curveMap.size);
      return;
    }

    // Extract standard durations from the full curve
    const extractPoints = (curve: { secs: number; watts: number; watts_per_kg?: number | null }[]): PowerCurvePoint[] => {
      const points: PowerCurvePoint[] = [];
      for (const secs of CURVE_DURATIONS) {
        const point = curve.find((p) => p.secs === secs);
        if (!point || point.watts <= 0) continue;
        points.push({
          secs,
          watts: Math.round(point.watts),
          wkg: weight ? Math.round((point.watts / weight) * 100) / 100 : null,
          date: "",
        });
      }
      return points;
    };

    const allTime = extractPoints(allTimeCurve);
    const last42d = extractPoints(last42dCurve);

    // Try to find approximate dates by matching peaks to activities
    await enrichWithDates(supabase, userId, allTime);
    await enrichWithDates(supabase, userId, last42d);

    // Compute power profile
    let powerProfile: PowerProfile | null = null;
    if (allTime.length >= 4) {
      powerProfile = buildPowerProfile(allTime, last42d, gender);
    }

    // Upsert cache
    const { error: upsertError } = await supabase
      .from("power_curve_cache")
      .upsert(
        {
          user_id: userId,
          all_time: allTime,
          last_42d: last42d,
          profile: powerProfile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[PowerCurve] Failed to upsert cache:", upsertError);
      return;
    }

    console.log(
      `[PowerCurve] Updated cache for ${userId}: ${allTime.length} all-time, ${last42d.length} 42d points, profile: ${powerProfile?.type ?? "none"}`
    );
  } catch (err) {
    console.error("[PowerCurve] Recomputation failed:", err);
  }
}

/**
 * Best-effort date enrichment: find the activity whose max/avg power is closest
 * to the peak at each duration. This gives approximate "when was this set" info.
 */
async function enrichWithDates(
  supabase: SupabaseClient,
  userId: string,
  points: PowerCurvePoint[]
): Promise<void> {
  if (points.length === 0) return;

  try {
    // Fetch activities with power data, ordered by date
    const { data: activities } = await supabase
      .from("activities")
      .select("activity_date, max_power, normalized_power")
      .eq("user_id", userId)
      .not("avg_power", "is", null)
      .gt("avg_power", 0)
      .order("activity_date", { ascending: false })
      .limit(500);

    if (!activities || activities.length === 0) return;

    for (const point of points) {
      // For short durations (<=30s), match against max_power
      // For longer durations, match against normalized_power
      const useMax = point.secs <= 30;
      let bestMatch = "";
      let bestDelta = Infinity;

      for (const a of activities as any[]) {
        const refPower = useMax ? (a.max_power as number | null) : (a.normalized_power as number | null);
        if (refPower == null) continue;
        const delta = Math.abs(refPower - point.watts);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestMatch = a.activity_date as string;
        }
      }

      if (bestMatch) {
        point.date = bestMatch;
      }
    }
  } catch {
    // Date enrichment is best-effort, don't fail the whole computation
  }
}
