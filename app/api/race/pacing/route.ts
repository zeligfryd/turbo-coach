import { generateText } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModels } from "@/lib/ai/models";
import type { GpxData, PacingPlan, PacingSegment } from "@/lib/race/types";

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

    // Fetch race event with GPX data
    const { data: race } = await supabase
      .from("race_events")
      .select("*")
      .eq("id", raceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!race) {
      return NextResponse.json({ error: "Race not found" }, { status: 404 });
    }

    const gpxData = race.gpx_data as GpxData | null;
    if (!gpxData || !gpxData.segments?.length) {
      return NextResponse.json({ error: "No GPX data available. Upload a GPX file first." }, { status: 400 });
    }

    // Fetch athlete profile and recent performance
    const [{ data: profile }, { data: recentActivities }] = await Promise.all([
      supabase.from("users").select("ftp, weight").eq("id", user.id).maybeSingle(),
      supabase
        .from("icu_activities")
        .select("avg_power, normalized_power, moving_time, distance, elevation_gain")
        .eq("user_id", user.id)
        .order("activity_date", { ascending: false })
        .limit(10),
    ]);

    const ftp = profile?.ftp ?? null;
    const weight = profile?.weight ?? null;

    if (!ftp) {
      return NextResponse.json({ error: "FTP is required for pacing calculations. Set it in your profile." }, { status: 400 });
    }

    const wkg = weight ? Math.round((ftp / weight) * 100) / 100 : null;

    // Build segment descriptions for the prompt
    const segmentDescriptions = gpxData.segments.map((seg) => {
      return `- ${seg.label} (${seg.type}, ${seg.distanceKm}km, ${seg.elevationGainM}m gain, ${seg.avgGradientPercent}% avg gradient)`;
    }).join("\n");

    // Recent ride context
    const recentContext = (recentActivities ?? []).slice(0, 5).map((a: Record<string, unknown>) => {
      const np = a.normalized_power as number | null;
      const ap = a.avg_power as number | null;
      const dur = a.moving_time as number | null;
      return `NP ${np ?? "?"}W, Avg ${ap ?? "?"}W, ${dur ? Math.round((dur as number) / 60) + "min" : "?"}`;
    }).join("; ");

    const { models } = resolveModels();

    const prompt = [
      "You are an expert cycling coach creating a race pacing plan.",
      "Return ONLY valid JSON matching this exact structure (no markdown, no explanation):",
      "",
      '{"overallTargetNpW": number, "estimatedFinishTimeMin": number, "strategy": "string (2-3 sentences)", "segments": [{"label": "string", "startKm": number, "endKm": number, "targetPowerW": number, "targetPowerPercent": number, "estimatedTimeMin": number, "advice": "string (1-2 sentences)"}]}',
      "",
      "Athlete profile:",
      `- FTP: ${ftp}W`,
      `- Weight: ${weight ?? "unknown"} kg`,
      `- W/kg: ${wkg ?? "unknown"}`,
      `- Recent rides: ${recentContext || "no data"}`,
      "",
      `Race: ${race.name} (${race.event_type})`,
      `Total distance: ${gpxData.totalDistanceKm} km`,
      `Total elevation: ${gpxData.totalElevationM} m`,
      "",
      "Route segments:",
      segmentDescriptions,
      "",
      "Rules:",
      "- Power targets as whole numbers in watts AND as % of FTP",
      "",
      "STEP 1 — ESTIMATE FINISH TIME FIRST:",
      "- Estimate finish time FIRST using the GPX data and athlete W/kg before setting any power targets. All targets flow from this estimate.",
      "- Heuristic: flat speed from athlete W/kg (roughly 35-45 km/h for 3.5-5 W/kg), add ~1 min per km per 100m elevation gain for climbing, descents at 50-60 km/h with minimal pedalling.",
      "",
      "STEP 2 — FLAT POWER CEILING (determined by estimated duration):",
      "- Under 1h: 95-105% FTP — truly maximal effort",
      "- 1-2h: 90-95% FTP",
      "- 2-3h: 85-90% FTP",
      "- 3-4h: 80-86% FTP",
      "- 4h+: 75-82% FTP",
      "",
      "STEP 3 — VARIABILITY STRATEGY (determined by race type, NOT power ceiling):",
      "- TT (solo effort): ride as close to the flat ceiling as possible, as steadily as possible. Minimise surges. Target VI < 1.05.",
      "- Road race / crit: higher variability is unavoidable. NP target matches the duration ceiling but average power will be lower due to surges and recoveries.",
      "- Gran fondo: like a road race but self-governed — advise riding to power targets, not to feel or to competitors.",
      "",
      "CLIMB TARGETS (set on top of flat ceiling, by climb duration):",
      "- Short climbs (<5 min): 110-120% FTP, W' expenditure acceptable",
      "- Medium climbs (5-20 min): 100-108% FTP, settle in quickly, no blowups",
      "- Long climbs (20 min+): 95-103% FTP — treat like a TT within the race",
      "",
      "OTHER:",
      "- Descents: recovery windows — advise soft pedalling, eat and drink here",
      "- First 10 minutes: start 5-10% below flat target to allow warm-up and positioning, then settle into race pace",
      "- Final km: budget a push at 105-120% FTP if W' allows, only if estimated finish time suggests meaningful sprint capacity remains",
      "- Do NOT be excessively conservative — give athletes numbers they can actually race on. This is a race, not a training ride.",
      "- Advice should reference specific route geography from the GPX segments and be tactically useful, not generic",
    ].join("\n");

    const result = await generateText({
      model: models.coaching,
      prompt,
    });

    // Parse JSON from response
    const text = result.text.trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ error: "Failed to generate pacing plan" }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as PacingPlan;

    // Validate basic structure
    if (
      typeof parsed.overallTargetNpW !== "number" ||
      typeof parsed.estimatedFinishTimeMin !== "number" ||
      !Array.isArray(parsed.segments)
    ) {
      return NextResponse.json({ error: "Invalid pacing plan structure" }, { status: 500 });
    }

    // Ensure segments have required fields
    const validSegments: PacingSegment[] = parsed.segments.map((seg) => ({
      label: String(seg.label ?? ""),
      startKm: Number(seg.startKm ?? 0),
      endKm: Number(seg.endKm ?? 0),
      targetPowerW: Math.round(Number(seg.targetPowerW ?? 0)),
      targetPowerPercent: Math.round(Number(seg.targetPowerPercent ?? 0)),
      estimatedTimeMin: Math.round(Number(seg.estimatedTimeMin ?? 0)),
      advice: String(seg.advice ?? ""),
    }));

    const plan: PacingPlan = {
      overallTargetNpW: Math.round(parsed.overallTargetNpW),
      estimatedFinishTimeMin: Math.round(parsed.estimatedFinishTimeMin),
      strategy: String(parsed.strategy ?? ""),
      segments: validSegments,
    };

    // Cache pacing plan on race event
    await supabase
      .from("race_events")
      .update({
        pacing_plan: plan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", raceId)
      .eq("user_id", user.id);

    return NextResponse.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
