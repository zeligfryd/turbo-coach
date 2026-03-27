import { generateText } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModels } from "@/lib/ai/models";
import type { GpxData } from "@/lib/race/types";
import type { PowerProfile } from "@/lib/power/types";
import { resolveFtp, buildPacingPrompt } from "@/lib/pacing/prompt";
import { parsePacingResponse } from "@/lib/pacing/parse";
import { buildHrZones } from "@/lib/pacing/hr-zones";

/* eslint-disable @typescript-eslint/no-explicit-any */

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

    // Fetch athlete profile, recent performance, and power profile
    const [{ data: profile }, { data: recentActivities }, { data: powerCurveCache }] = await Promise.all([
      supabase.from("users").select("ftp, weight, max_hr, lthr").eq("id", user.id).maybeSingle(),
      supabase
        .from("activities")
        .select("avg_power, normalized_power, moving_time, distance, elevation_gain")
        .eq("user_id", user.id)
        .order("activity_date", { ascending: false })
        .limit(5),
      supabase
        .from("power_curve_cache")
        .select("profile")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const weight = profile?.weight ?? null;
    const maxHr = profile?.max_hr ?? null;
    const lthr = profile?.lthr ?? null;
    const powerProfile = (powerCurveCache as any)?.profile as PowerProfile | null ?? null;
    const hrZones = buildHrZones(maxHr, lthr);

    const manualFtp = profile?.ftp ?? null;
    const estimatedFtp = powerProfile?.estimatedFtp ?? null;
    const ftp = resolveFtp(manualFtp, estimatedFtp);

    if (!ftp) {
      return NextResponse.json({ error: "FTP is required for pacing calculations. Set it in your profile." }, { status: 400 });
    }

    const wkg = weight ? Math.round((ftp / weight) * 100) / 100 : null;

    // Recent ride context
    const recentContext = (recentActivities ?? []).slice(0, 5).map((a: Record<string, unknown>) => {
      const np = a.normalized_power as number | null;
      const ap = a.avg_power as number | null;
      const dur = a.moving_time as number | null;
      return `NP ${np ?? "?"}W, Avg ${ap ?? "?"}W, ${dur ? Math.round((dur as number) / 60) + "min" : "?"}`;
    }).join("; ");

    const { models } = resolveModels();

    const prompt = buildPacingPrompt({
      ftp,
      manualFtp,
      estimatedFtp,
      weight,
      wkg,
      recentContext,
      powerProfile,
      hrZones,
      raceName: race.name,
      eventType: race.event_type,
      gpxData,
    });

    // Attempt LLM call with one retry on parse failure
    let plan;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await generateText({ model: models.coaching, prompt });
        plan = parsePacingResponse(result.text);
        lastError = null;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error("LLM error");
      }
    }
    if (!plan) throw lastError ?? new Error("Failed to generate pacing plan");

    // Sanity-check overall NP against duration-based ceiling
    const durationH = plan.estimatedFinishTimeMin / 60;
    let maxNpPct: number;
    if (durationH < 0.5)       maxNpPct = 115;
    else if (durationH < 1)    maxNpPct = 105;
    else if (durationH < 2)    maxNpPct = 95;
    else if (durationH < 3)    maxNpPct = 90;
    else if (durationH < 4)    maxNpPct = 86;
    else                       maxNpPct = 82;
    const maxNpW = Math.round(ftp * maxNpPct / 100);
    if (plan.overallTargetNpW > maxNpW * 1.15) {
      // 15% tolerance for rounding and short bursts; reject clearly dangerous plans
      throw new Error(
        `Generated plan NP (${plan.overallTargetNpW}W) exceeds physiological ceiling ` +
        `(${maxNpW}W = ${maxNpPct}% FTP) for ${Math.round(durationH * 60)}min event. ` +
        `Please try regenerating.`
      );
    }

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
