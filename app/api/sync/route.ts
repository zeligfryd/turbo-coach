import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStravaActivities } from "@/lib/strava/sync";
import { syncWellness } from "@/lib/intervals/wellness-sync";
import { triggerPostRideAnalysis } from "@/lib/ai/post-ride";
import { recomputeFitness } from "@/lib/fitness/compute";
import type { StravaConnectionRow } from "@/lib/strava/types";
import type { IcuConnectionRow } from "@/lib/intervals/types";

/**
 * Unified incremental sync: syncs both Strava activities and ICU wellness in parallel.
 * Always uses incremental mode for Strava (since last sync + compute metrics).
 */
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
      supabase.from("strava_connections").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("icu_connections").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    const results: { strava?: { activitiesSynced: number }; icu?: { daysSynced: number }; errors: string[] } = {
      errors: [],
    };

    // Build sync tasks
    const tasks: Promise<void>[] = [];

    if (stravaConn) {
      const conn = stravaConn as StravaConnectionRow;
      if (conn.sync_status !== "syncing") {
        tasks.push(
          (async () => {
            await supabase
              .from("strava_connections")
              .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
              .eq("user_id", user.id);

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

    // Fire-and-forget post-ride analysis and fitness recomputation
    triggerPostRideAnalysis(supabase, user.id).catch(console.warn);
    recomputeFitness(supabase, user.id).catch(console.warn);

    return NextResponse.json({
      success: results.errors.length === 0,
      strava: results.strava ?? null,
      icu: results.icu ?? null,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
