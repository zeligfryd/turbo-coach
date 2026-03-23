import { generateText } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModels } from "@/lib/ai/models";
import { computeReadinessScore, daysUntilRace } from "@/lib/race/readiness";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { raceId } = (await request.json()) as { raceId: string };
    if (!raceId) {
      return NextResponse.json({ error: "Missing raceId" }, { status: 400 });
    }

    // Fetch race event
    const { data: race } = await supabase
      .from("race_events")
      .select("id, name, race_date, event_type, distance_km, elevation_m")
      .eq("id", raceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!race) {
      return NextResponse.json({ error: "Race not found" }, { status: 404 });
    }

    // Fetch latest wellness data
    const today = new Date().toISOString().slice(0, 10);
    const { data: wellness } = await supabase
      .from("wellness")
      .select("ctl, atl, tsb, resting_hr, hrv")
      .eq("user_id", user.id)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("users")
      .select("ftp, weight")
      .eq("id", user.id)
      .maybeSingle();

    const days = daysUntilRace(race.race_date);
    const score = computeReadinessScore({
      ctl: wellness?.ctl ?? null,
      atl: wellness?.atl ?? null,
      tsb: wellness?.tsb ?? null,
      daysToRace: days,
    });

    // Generate AI interpretation
    const { models } = resolveModels();
    const prompt = [
      "You are a cycling coach. Write a single concise sentence (max 30 words) interpreting the athlete's race readiness.",
      "",
      `Race: ${race.name} (${race.event_type})`,
      `Date: ${race.race_date} (${days} days away)`,
      `Distance: ${race.distance_km ?? "unknown"} km, Elevation: ${race.elevation_m ?? "unknown"} m`,
      `FTP: ${profile?.ftp ?? "unknown"} W, Weight: ${profile?.weight ?? "unknown"} kg`,
      `CTL: ${wellness?.ctl ?? "unknown"}, ATL: ${wellness?.atl ?? "unknown"}, TSB: ${wellness?.tsb ?? "unknown"}`,
      `Resting HR: ${wellness?.resting_hr ?? "unknown"}, HRV: ${wellness?.hrv ?? "unknown"}`,
      `Readiness score: ${score}/100`,
      "",
      "Focus on actionable insight. Do NOT repeat the score number. Reference specific metrics only if they tell a story.",
    ].join("\n");

    const result = await generateText({
      model: models.coaching,
      prompt,
    });

    const interpretation = result.text.trim();

    // Cache score and interpretation on the race event
    await supabase
      .from("race_events")
      .update({
        readiness_score: score,
        readiness_interpretation: interpretation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", raceId)
      .eq("user_id", user.id);

    return NextResponse.json({ score, interpretation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
