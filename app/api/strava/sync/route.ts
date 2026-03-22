import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStravaActivities } from "@/lib/strava/sync";
import { triggerPostRideAnalysis } from "@/lib/ai/post-ride";
import type { StravaConnectionRow } from "@/lib/strava/types";

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
      .from("strava_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "No Strava connection found" },
        { status: 404 }
      );
    }

    const conn = connection as StravaConnectionRow;

    if (conn.sync_status === "syncing") {
      return NextResponse.json(
        { error: "Sync already in progress" },
        { status: 409 }
      );
    }

    await supabase
      .from("strava_connections")
      .update({
        sync_status: "syncing",
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const result = await syncStravaActivities(supabase, user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, activitiesSynced: 0 },
        { status: 500 }
      );
    }

    // Fire-and-forget post-ride analysis for newly synced activities
    triggerPostRideAnalysis(supabase, user.id).catch(console.warn);

    return NextResponse.json({
      success: true,
      activitiesSynced: result.activitiesSynced,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
