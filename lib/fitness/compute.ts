import type { SupabaseClient } from "@supabase/supabase-js";
import { computePmc, type DailyLoad } from "./pmc";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Recompute the fitness curve (CTL/ATL/TSB) for dates BEYOND existing ICU wellness data.
 *
 * Strategy:
 * 1. Find the last date with ICU-sourced wellness data (ground truth)
 * 2. Use its CTL/ATL as seed values for continuation
 * 3. Fetch activities AFTER that date
 * 4. Compute the PMC from the seed forward
 * 5. Insert new wellness rows only (never overwrite ICU data)
 *
 * If no ICU wellness exists, computes from the first activity with seedCtl=0, seedAtl=0.
 */
export async function recomputeFitness(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ success: boolean; daysComputed: number; error?: string }> {
  try {
    // Find the latest ICU wellness date to use as seed
    const { data: latestIcu } = await supabase
      .from("wellness")
      .select("date, ctl, atl")
      .eq("user_id", userId)
      .eq("source", "intervals.icu")
      .not("ctl", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const seedCtl = Number(latestIcu?.ctl) || 0;
    const seedAtl = Number(latestIcu?.atl) || 0;
    const icuEndDate = latestIcu?.date as string | undefined;

    // Fetch activities — only after the ICU range if ICU data exists
    let query = supabase
      .from("activities")
      .select("activity_date, icu_training_load, source")
      .eq("user_id", userId)
      .not("icu_training_load", "is", null)
      .gt("icu_training_load", 0)
      .order("activity_date", { ascending: true });

    if (icuEndDate) {
      query = query.gt("activity_date", icuEndDate);
    }

    const { data: activities, error: fetchErr } = await query;

    if (fetchErr) {
      return { success: false, daysComputed: 0, error: fetchErr.message };
    }

    // Determine if there are any days to compute
    const today = new Date().toISOString().slice(0, 10);

    // If ICU covers today, nothing to compute
    if (icuEndDate && icuEndDate >= today) {
      return { success: true, daysComputed: 0 };
    }

    // Build daily loads, deduplicating across sources (prefer ICU over Strava per day)
    const loadByDateSource = new Map<string, { icu: number; strava: number }>();
    for (const a of (activities ?? []) as { activity_date: string; icu_training_load: number; source: string }[]) {
      const date = a.activity_date;
      const load = Number(a.icu_training_load) || 0;
      const entry = loadByDateSource.get(date) ?? { icu: 0, strava: 0 };
      if (a.source === "intervals.icu") {
        entry.icu += load;
      } else {
        entry.strava += load;
      }
      loadByDateSource.set(date, entry);
    }

    const dailyMap = new Map<string, number>();
    for (const [date, { icu, strava }] of loadByDateSource) {
      dailyMap.set(date, icu > 0 ? icu : strava);
    }

    // Ensure the curve extends to today
    if (!dailyMap.has(today)) {
      dailyMap.set(today, 0);
    }

    // We need at least the day after ICU's last date as the starting point
    const startDate = icuEndDate
      ? addDay(icuEndDate)
      : Array.from(dailyMap.keys()).sort()[0];

    if (!startDate) {
      return { success: true, daysComputed: 0 };
    }

    // Ensure the start date is in the map (even if zero load)
    if (!dailyMap.has(startDate)) {
      dailyMap.set(startDate, 0);
    }

    const dailyLoads: DailyLoad[] = Array.from(dailyMap.entries())
      .filter(([date]) => date >= startDate)
      .map(([date, load]) => ({ date, load }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (dailyLoads.length === 0) {
      return { success: true, daysComputed: 0 };
    }

    // Compute PMC seeded from ICU's last values
    const series = computePmc(dailyLoads, { seedCtl, seedAtl });

    if (series.length === 0) {
      return { success: true, daysComputed: 0 };
    }

    // Persist in batches — only INSERT new rows, never update existing ones
    const BATCH_SIZE = 500;
    let totalPersisted = 0;

    for (let i = 0; i < series.length; i += BATCH_SIZE) {
      const batch = series.slice(i, i + BATCH_SIZE);
      const payload = batch.map((d) => ({
        date: d.date,
        ctl: d.ctl,
        atl: d.atl,
        tsb: d.tsb,
        rampRate: d.rampRate,
      }));

      const { error: rpcErr } = await supabase.rpc("upsert_computed_fitness", {
        p_user_id: userId,
        p_data: payload,
      });

      if (rpcErr) {
        return {
          success: false,
          daysComputed: totalPersisted,
          error: `RPC batch ${i / BATCH_SIZE + 1} failed: ${rpcErr.message}`,
        };
      }

      totalPersisted += batch.length;
    }

    return { success: true, daysComputed: totalPersisted };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fitness computation failed";
    return { success: false, daysComputed: 0, error: message };
  }
}

function addDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
