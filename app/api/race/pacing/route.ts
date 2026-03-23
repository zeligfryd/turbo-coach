import { generateText } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveModels } from "@/lib/ai/models";
import type { GpxData, PacingPlan, PacingSegment } from "@/lib/race/types";
import type { PowerProfile } from "@/lib/power/types";

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
      supabase.from("users").select("ftp, weight").eq("id", user.id).maybeSingle(),
      supabase
        .from("icu_activities")
        .select("avg_power, normalized_power, moving_time, distance, elevation_gain")
        .eq("user_id", user.id)
        .order("activity_date", { ascending: false })
        .limit(10),
      supabase
        .from("power_curve_cache")
        .select("profile")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const weight = profile?.weight ?? null;
    const powerProfile = (powerCurveCache as any)?.profile as PowerProfile | null ?? null;

    // FTP: prefer manually set value, fall back to estimated from power profile
    const manualFtp = profile?.ftp ?? null;
    const estimatedFtp = powerProfile?.estimatedFtp ?? null;
    const ftp = manualFtp ?? estimatedFtp;

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

    // Build power profile context
    const profileContext: string[] = [];
    if (powerProfile) {
      profileContext.push(
        "",
        "Power profile:",
        `- Type: ${powerProfile.type}`,
        `- Scores (1-6): 5s=${powerProfile.scores["5s"] ?? "?"}, 1min=${powerProfile.scores["1min"] ?? "?"}, 5min=${powerProfile.scores["5min"] ?? "?"}, 20min=${powerProfile.scores["20min"] ?? "?"}`,
        `- Weakness: ${powerProfile.weakness}`,
      );
      if (powerProfile.peakWkg) {
        const peaks = Object.entries(powerProfile.peakWkg)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${k}=${v} W/kg`)
          .join(", ");
        if (peaks) profileContext.push(`- Peak W/kg: ${peaks}`);
      }
      if (powerProfile.allTimePeaks) {
        const peaks = Object.entries(powerProfile.allTimePeaks)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}=${v}W`)
          .join(", ");
        if (peaks) profileContext.push(`- Peak watts: ${peaks}`);
      }
      if (!manualFtp && estimatedFtp) {
        profileContext.push(`- FTP is estimated (95% of 20min peak), not manually tested`);
      }
    }

    // Weight + elevation advisory
    const totalElev = gpxData.totalElevationM ?? 0;
    const weightAdvisory: string[] = [];
    if (weight && weight >= 85 && totalElev >= 2500) {
      weightAdvisory.push(
        "",
        "WEIGHT ADVISORY (STRONG):",
        `At ${weight}kg with ${totalElev}m of climbing, the climbing on this course will be especially demanding.`,
        "Be conservative on anything over 10min — target the lower bound of the climb range and plan to recover time on flats and descents where the power-to-weight disadvantage is smaller.",
      );
    } else if (weight && weight >= 80 && totalElev >= 2000) {
      weightAdvisory.push(
        "",
        "WEIGHT ADVISORY (MODERATE):",
        `At ${weight}kg with ${totalElev}m of climbing, sustained climbs will favour lighter riders.`,
        "Stick to W/kg targets rather than trying to hold wheels above your ceiling.",
      );
    } else if (weight && weight >= 75 && totalElev >= 1500) {
      weightAdvisory.push(
        "",
        "WEIGHT NOTE:",
        "Some climbs on this course will test sustained power — pace by W/kg rather than feel.",
      );
    }

    const prompt = [
      "You are an expert cycling coach creating a race pacing plan.",
      "Return ONLY valid JSON matching this exact structure (no markdown, no explanation):",
      "",
      '{"overallTargetNpW": number, "estimatedFinishTimeMin": number, "strategy": "string (2-3 sentences)", "segments": [{"label": "string", "startKm": number, "endKm": number, "targetPowerW": number, "targetPowerPercent": number, "estimatedTimeMin": number, "advice": "string (1-2 sentences, include watts AND W/kg for climb segments)"}]}',
      "",
      "Athlete profile:",
      `- FTP: ${ftp}W${!manualFtp ? " (estimated)" : ""}`,
      `- Weight: ${weight ?? "unknown"} kg`,
      `- FTP W/kg: ${wkg ?? "unknown"}`,
      `- Recent rides: ${recentContext || "no data"}`,
      ...profileContext,
      "",
      `Race: ${race.name} (${race.event_type})`,
      `Total distance: ${gpxData.totalDistanceKm} km`,
      `Total elevation: ${totalElev} m`,
      "",
      "Route segments:",
      segmentDescriptions,
      ...weightAdvisory,
      "",
      "=== PACING TARGET GENERATION RULES ===",
      "",
      "A. FTP and W/kg as foundation:",
      `- Use ftpWatts (${ftp}W) as the reference for all %-FTP calculations.`,
      "- Always reason about climbs in W/kg first, then convert to watts using weightKg.",
      '  Show both in advice text: e.g. "323W (3.75 W/kg)".',
      "- Math check: all watts = round(FTP × percentage), all W/kg = watts / weightKg. These must be consistent.",
      "",
      "STEP 1 — ESTIMATE FINISH TIME FIRST:",
      "- Estimate finish time FIRST using the GPX data and athlete W/kg before setting any power targets. All targets flow from this estimate.",
      "- Heuristic: flat speed from athlete W/kg (roughly 35-45 km/h for 3.5-5 W/kg), add ~1 min per km per 100m elevation gain for climbing, descents at 50-60 km/h with minimal pedalling.",
      "",
      "STEP 2 — FLAT POWER CEILING (determined by estimated duration):",
      "- Under 1h: 95-105% FTP",
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
      "CLIMB TARGETS (base ranges by climb duration):",
      "- Short climbs (<5 min): 110-120% FTP, W' expenditure acceptable",
      "- Medium climbs (5-20 min): 100-108% FTP, settle in quickly, no blowups",
      "- Long climbs (20 min+): 95-103% FTP — treat like a TT within the race",
      "",
      ...(powerProfile ? [
        "B. Profile-type modifiers (shift within the ranges above):",
        `The athlete is a ${powerProfile.type}. Use these modifiers:`,
        "",
        "Flat sections:",
        "  - Time trialist → upper bound of duration bucket (steady is their strength)",
        "  - Sprinter → lower bound (long sustained efforts are draining; conserve for finish)",
        "  - All-rounder, Climber, Puncheur → midpoint of duration bucket",
        "",
        "Long climbs (20min+):",
        "  - Climber → can push upper bound of climb target range",
        "  - Time trialist → steady at midpoint, treat like a TT segment",
        "  - Puncheur → conservative, lower bound — their 20min W/kg is weaker relative to short power; save matches for punchy sections",
        "  - Sprinter → most at risk — ride strictly to W/kg ceiling, let others go, recover for later",
        "  - All-rounder → midpoint of climb range",
        "",
        "Medium climbs (5-20min):",
        "  - Puncheur → can push toward upper bound (this is their wheelhouse)",
        "  - Climber → comfortable, upper bound",
        "  - Time trialist → midpoint, keep it steady",
        "  - Sprinter → lower bound, this duration is costly",
        "  - All-rounder → midpoint",
        "",
        "Short climbs (<5min):",
        "  - Puncheur and Sprinter → can push freely, this is their strength",
        "  - Time trialist → advise caution — surges are costly for a diesel engine, stay smooth",
        "  - Climber and All-rounder → standard targets apply",
        "",
        "Sprint / final km:",
        "  - Sprinter → always budget W' for a final push, flag this explicitly",
        "  - Time trialist → deprioritise the sprint, extend TT effort to the line",
        "  - Others → standard final km guidance",
        "",
        "C. Use scores to set magnitude within ranges:",
        "- The scores (1-6) determine HOW FAR within a range to push.",
        "- Score 5-6: push toward upper bound confidently.",
        "- Score 3-4: target midpoint.",
        "- Score 1-2: stay at or below lower bound — the athlete lacks capacity at this duration.",
        "- Example: two puncheurs with 1min scores of 5 vs 3 should get different short-climb targets.",
        "",
        "D. Use the weakness field:",
        `- The athlete's weakness is "${powerProfile.weakness}" power.`,
        "- For segments matching this duration, default to the LOWER bound and add a caution note.",
        `- Example note: "This matches your weakest duration — stay at the lower end of the target range rather than pushing to the upper bound. Going into the red here will cost you disproportionately."`,
        "",
        "E. Cross-check targets against peak W/kg:",
        "- After computing a %-FTP target for a segment, cross-check against the athlete's actual peak W/kg for that duration.",
        "- If the target exceeds ~95% of the athlete's all-time best for that duration, flag it:",
        '  "This target is close to your all-time best — achievable only on a very good day. Consider backing off 5%."',
        "- This prevents generic %-FTP formulas from producing unrealistic numbers for uneven profiles.",
        "",
        "F. Always reference the profile type in advice:",
        "- Connect advice to the WHY, not just the WHAT:",
        `  GOOD: "As a ${powerProfile.type.toLowerCase()}, your long climb target is intentionally conservative — save your ${powerProfile.weakness === "20min" ? "limited threshold capacity" : "anaerobic capacity"} for sections where your strengths shine."`,
        '  BAD: "Your long climb target is at the lower bound."',
        "",
      ] : []),
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
