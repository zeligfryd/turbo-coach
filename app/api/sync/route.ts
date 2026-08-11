import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStravaActivities } from "@/lib/strava/sync";
import { syncWellness } from "@/lib/intervals/wellness-sync";
import { syncIcuActivities } from "@/lib/intervals/activity-sync";
import { triggerPostRideAnalysis } from "@/lib/ai/post-ride";
import { recomputeFitness } from "@/lib/fitness/compute";
import type { StravaConnectionRow } from "@/lib/strava/types";
import type { IcuConnectionRow } from "@/lib/intervals/types";

/**
 * Unified incremental sync: syncs both Strava activities and ICU wellness in parallel.
 * Always uses incremental mode for Strava (since last sync + compute metrics).
 */
/**
 * How far back to ask intervals.icu for activities.
 *
 * The first run has to reach back far enough to pick up everything Garmin has
 * ever sent, since none of it has been ingested. After that a rolling window is
 * enough, and still catches a ride that was renamed or had its FTP corrected
 * after the fact.
 */
async function icuActivityWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ oldest: string; newest: string }> {
  const { count } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("metrics_source", "intervals.icu");

  const daysBack = (count ?? 0) > 0 ? 60 : 800;
  const oldest = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
  // Tomorrow, so a ride uploaded today is never cut off by a timezone edge.
  const newest = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return { oldest, newest };
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Fetch both connections in parallel
    const [{ data: stravaConn }, { data: icuConn }] = await Promise.all([
      supabase.from("strava_connections").select("sync_status").eq("user_id", user.id).maybeSingle(),
      supabase.from("icu_connections").select("sync_status, api_key, athlete_id").eq("user_id", user.id).maybeSingle(),
    ]);

    const results: {
      strava?: { activitiesSynced: number };
      icu?: { daysSynced: number };
      icuActivities?: { enriched: number; inserted: number; skippedEmpty: number };
      errors: string[];
    } = {
      errors: [],
    };

    // Build sync tasks
    const tasks: Promise<void>[] = [];

    if (stravaConn) {
      const conn = stravaConn as StravaConnectionRow;
      if (conn.sync_status !== "syncing") {
        tasks.push(
          (async () => {
            const result = await syncStravaActivities(supabase, user.id, "incremental");
            if (result.success) {
              results.strava = { activitiesSynced: result.activitiesSynced };
            } else {
              results.errors.push(`Strava: ${result.error}`);
            }
          })()
        );
      }
    }

    if (icuConn) {
      const conn = icuConn as IcuConnectionRow;
      if (conn.sync_status !== "syncing") {
        tasks.push(
          (async () => {
            await supabase
              .from("icu_connections")
              .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
              .eq("user_id", user.id);

            const result = await syncWellness(supabase, user.id, conn.api_key, conn.athlete_id);

            await supabase
              .from("icu_connections")
              .update({
                last_synced_at: new Date().toISOString(),
                sync_status: result.success ? "idle" : "error",
                sync_error: result.error ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", user.id);

            if (result.success) {
              results.icu = { daysSynced: result.daysSynced };
            } else {
              results.errors.push(`ICU: ${result.error}`);
            }
          })()
        );
      }
    }

    if (tasks.length === 0) {
      return NextResponse.json({ error: "No connections configured or sync already in progress" }, { status: 404 });
    }

    await Promise.all(tasks);

    // intervals.icu activities run *after* Strava, not alongside it. Both write
    // the same rows, and intervals.icu is the better source for anything Garmin
    // recorded — running it last means it wins within a single sync as well as
    // across runs.
    if (icuConn) {
      const conn = icuConn as IcuConnectionRow;
      const icuResult = await syncIcuActivities(supabase, user.id, {
        ...(await icuActivityWindow(supabase, user.id)),
        apiKey: conn.api_key,
        athleteId: conn.athlete_id,
      });
      if (icuResult.success) {
        results.icuActivities = {
          enriched: icuResult.enriched,
          inserted: icuResult.inserted,
          skippedEmpty: icuResult.skippedEmpty,
        };
      } else {
        results.errors.push(`ICU activities: ${icuResult.error}`);
      }
    }

    // Fire-and-forget post-ride analysis and fitness recomputation
    triggerPostRideAnalysis(supabase, user.id).catch(console.warn);
    recomputeFitness(supabase, user.id).catch(console.warn);

    return NextResponse.json({
      success: results.errors.length === 0,
      strava: results.strava ?? null,
      icu: results.icu ?? null,
      icuActivities: results.icuActivities ?? null,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
