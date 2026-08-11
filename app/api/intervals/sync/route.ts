import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncWellness } from "@/lib/intervals/wellness-sync";
import { syncIcuActivities } from "@/lib/intervals/activity-sync";
import { triggerPostRideAnalysis } from "@/lib/ai/post-ride";
import { recomputePowerCurve } from "@/lib/power/aggregate";
import { recomputeFitness } from "@/lib/fitness/compute";
import type { IcuConnectionRow } from "@/lib/intervals/types";

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

    const { data: connection, error: connError } = await supabase
      .from("icu_connections")
      .select("sync_status, api_key, athlete_id")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "No intervals.icu connection found" },
        { status: 404 }
      );
    }

    const conn = connection as IcuConnectionRow;

    if (conn.sync_status === "syncing") {
      return NextResponse.json(
        { error: "Sync already in progress" },
        { status: 409 }
      );
    }

    await supabase
      .from("icu_connections")
      .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    const result = await syncWellness(
      supabase,
      user.id,
      conn.api_key,
      conn.athlete_id
    );

    // Activities as well as wellness. This route used to pull only wellness,
    // which is why intervals.icu's ride data — real TSS, intensity factor and
    // the FTP each ride was measured against — never reached the app.
    const { count: icuOwned } = await supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("metrics_source", "intervals.icu");
    const daysBack = (icuOwned ?? 0) > 0 ? 60 : 800;

    const activityResult = await syncIcuActivities(supabase, user.id, {
      oldest: new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10),
      newest: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      apiKey: conn.api_key,
      athleteId: conn.athlete_id,
    });

    // Update connection status
    await supabase
      .from("icu_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: result.success && activityResult.success ? "idle" : "error",
        sync_error: result.error ?? activityResult.error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, daysSynced: 0 },
        { status: 500 }
      );
    }

    // Fire-and-forget post-ride analysis, power curve, and fitness recomputation
    triggerPostRideAnalysis(supabase, user.id).catch(console.warn);
    recomputePowerCurve(supabase, user.id).catch(console.warn);
    recomputeFitness(supabase, user.id).catch(console.warn);

    return NextResponse.json({
      success: true,
      daysSynced: result.daysSynced,
      activities: {
        enriched: activityResult.enriched,
        inserted: activityResult.inserted,
        skippedEmpty: activityResult.skippedEmpty,
        error: activityResult.error ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
