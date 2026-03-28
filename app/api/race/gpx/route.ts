import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseGpx } from "@/lib/gpx/parser";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const raceId = formData.get("raceId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const MAX_GPX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_GPX_SIZE) {
      return NextResponse.json({ error: "GPX file exceeds 5 MB limit" }, { status: 413 });
    }

    if (!raceId) {
      return NextResponse.json({ error: "Missing raceId" }, { status: 400 });
    }

    const gpxText = await file.text();
    const gpxData = parseGpx(gpxText);

    // Update race event with GPX data and auto-fill distance/elevation
    const { error: updateError } = await supabase
      .from("race_events")
      .update({
        gpx_data: gpxData,
        distance_km: gpxData.totalDistanceKm,
        elevation_m: gpxData.totalElevationM,
        updated_at: new Date().toISOString(),
      })
      .eq("id", raceId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      gpxData,
      distance_km: gpxData.totalDistanceKm,
      elevation_m: gpxData.totalElevationM,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process GPX file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
