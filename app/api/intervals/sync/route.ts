import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncWellness } from "@/lib/intervals/wellness-sync";
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

    // Update connection status
    await supabase
      .from("icu_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: result.success ? "idle" : "error",
        sync_error: result.error ?? null,
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
