import type { GpxData, GpxSegment } from "@/lib/race/types";
import type { PowerProfile } from "@/lib/power/types";
import { type HrZoneModel, formatHrZonesForPrompt } from "@/lib/pacing/hr-zones";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── FTP resolution ───────────────────────────────────────────────

export function resolveFtp(
  manualFtp: number | null,
  estimatedFtp: number | null,
): number | null {
  return manualFtp ?? estimatedFtp;
}

// ── Weight advisory ──────────────────────────────────────────────

export function buildWeightAdvisory(
  weight: number | null,
  totalElevationM: number,
): string[] {
  if (!weight) return [];

  if (weight >= 85 && totalElevationM >= 2500) {
    return [
      "",
      "WEIGHT ADVISORY (STRONG):",
      `At ${weight}kg with ${totalElevationM}m of climbing, the climbing on this course will be especially demanding.`,
      "Be conservative on anything over 10min — target the lower bound of the climb range and plan to recover time on flats and descents where the power-to-weight disadvantage is smaller.",
    ];
  }

  if (weight >= 80 && totalElevationM >= 2000) {
    return [
      "",
      "WEIGHT ADVISORY (MODERATE):",
      `At ${weight}kg with ${totalElevationM}m of climbing, sustained climbs will favour lighter riders.`,
      "Stick to W/kg targets rather than trying to hold wheels above your ceiling.",
    ];
  }

  if (weight >= 75 && totalElevationM >= 1500) {
    return [
      "",
      "WEIGHT NOTE:",
      "Some climbs on this course will test sustained power — pace by W/kg rather than feel.",
    ];
  }

  return [];
}

// ── Prompt construction ──────────────────────────────────────────

export interface PacingPromptParams {
  ftp: number;
  manualFtp: number | null;
  estimatedFtp: number | null;
  weight: number | null;
  wkg: number | null;
  recentContext: string;
  powerProfile: PowerProfile | null;
  hrZones: HrZoneModel | null;
  raceName: string;
  eventType: string;
  gpxData: GpxData;
}

function buildSegmentDescriptions(segments: GpxSegment[]): string {
  return segments
    .map(
      (seg) =>
        `- ${seg.label} (${seg.type}, ${seg.distanceKm}km, ${seg.elevationGainM}m gain, ${seg.avgGradientPercent}% avg gradient)`,
    )
    .join("\n");
}

function buildProfileContext(
  powerProfile: PowerProfile | null,
  manualFtp: number | null,
  estimatedFtp: number | null,
): string[] {
  if (!powerProfile) return [];

  const lines: string[] = [
    "",
    "Power profile:",
    `- Type: ${powerProfile.type}`,
    `- Scores (1-6): 5s=${powerProfile.scores["5s"] ?? "?"}, 1min=${powerProfile.scores["1min"] ?? "?"}, 5min=${powerProfile.scores["5min"] ?? "?"}, 20min=${powerProfile.scores["20min"] ?? "?"}`,
    `- Weakness: ${powerProfile.weakness}`,
  ];

  if (powerProfile.peakWkg) {
    const peaks = Object.entries(powerProfile.peakWkg)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${v} W/kg`)
      .join(", ");
    if (peaks) lines.push(`- Peak W/kg: ${peaks}`);
  }

  if (powerProfile.allTimePeaks) {
    const peaks = Object.entries(powerProfile.allTimePeaks)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}=${v}W`)
      .join(", ");
    if (peaks) lines.push(`- Peak watts: ${peaks}`);
  }

  if (!manualFtp && estimatedFtp) {
    lines.push(`- FTP is estimated (95% of 20min peak), not manually tested`);
  }

  return lines;
}

function buildProfileModifiers(powerProfile: PowerProfile): string[] {
  return [
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
  ];
}

export function buildPacingPrompt(params: PacingPromptParams): string {
  const {
    ftp,
    manualFtp,
    estimatedFtp,
    weight,
    wkg,
    recentContext,
    powerProfile,
    hrZones,
    raceName,
    eventType,
    gpxData,
  } = params;

  const segmentDescriptions = buildSegmentDescriptions(gpxData.segments);
  const profileContext = buildProfileContext(powerProfile, manualFtp, estimatedFtp);
  const totalElev = gpxData.totalElevationM ?? 0;
  const weightAdvisory = buildWeightAdvisory(weight, totalElev);

  const isLongEvent = (eventType: string) =>
    eventType === "gran_fondo" || eventType === "gravel";

  return [
    "You are an expert cycling coach creating a race pacing plan.",
    "Return ONLY valid JSON matching this exact structure (no markdown, no explanation):",
    "",
    `{"overallTargetNpW": number, "estimatedFinishTimeMin": number, "strategy": "string (2-3 sentences)", "segments": [{"label": "string", "startKm": number, "endKm": number, "targetPowerW": number, "targetPowerPercent": number, "estimatedTimeMin": number, "advice": "string (1-2 sentences, include watts AND W/kg for climb segments)"${hrZones ? ', "targetHrZone": "string (e.g. Z2, Z3-Z4)", "targetHrBpm": "string (e.g. 145-160)"' : ""}}]}`,
    "",
    "Example output (40km flat TT, FTP 280W, 75kg, ~56min):",
    '{"overallTargetNpW": 266, "estimatedFinishTimeMin": 56, "strategy": "Even-paced 40km TT targeting 95% FTP. Start slightly below target for the first 5 minutes while HR stabilises, then hold 95-97% throughout and build to 100% in the final 5km.", "segments": [{"label": "Opening 5km", "startKm": 0, "endKm": 5, "targetPowerW": 252, "targetPowerPercent": 90, "estimatedTimeMin": 7, "advice": "Controlled start — resist the adrenaline and let HR build gradually before settling into race pace."}, {"label": "Main effort", "startKm": 5, "endKm": 35, "targetPowerW": 271, "targetPowerPercent": 97, "estimatedTimeMin": 42, "advice": "Hold steady, aero position. VI target <1.05 — any surging costs more than it saves."}, {"label": "Final push", "startKm": 35, "endKm": 40, "targetPowerW": 280, "targetPowerPercent": 100, "estimatedTimeMin": 7, "advice": "Build to 100% FTP if HR and legs feel good. Empty the tank here."}]}',
    "",
    "Athlete profile:",
    `- FTP: ${ftp}W${!manualFtp ? " (estimated)" : ""}`,
    `- Weight: ${weight ?? "unknown"} kg`,
    `- FTP W/kg: ${wkg ?? "unknown"}`,
    `- Recent rides: ${recentContext || "no data"}`,
    "  (If recent ride power values are shown as '?', base all targets on stated FTP alone and note in the strategy that recent form data is unavailable.)",
    ...profileContext,
    "",
    `Race: ${raceName} (${eventType})`,
    `Total distance: ${gpxData.totalDistanceKm} km`,
    `Total elevation: ${totalElev} m`,
    "",
    "Route segments:",
    segmentDescriptions,
    ...weightAdvisory,
    ...(hrZones ? ["", formatHrZonesForPrompt(hrZones)] : []),
    "",
    "=== PACING TARGET GENERATION RULES ===",
    "",
    "A. FTP and W/kg as foundation:",
    `- Use ftpWatts (${ftp}W) as the reference for all %-FTP calculations.`,
    "- Always reason about climbs in W/kg first, then convert to watts using weightKg.",
    '  Show both in advice text: e.g. "323W (3.75 W/kg)".',
    "- Math check: all watts = round(FTP × percentage), all W/kg = watts / weightKg. These must be consistent.",
    "",
    "FORM CHECK — do this before setting any targets:",
    "- Inspect the recent rides. If recent NP values (excluding rides shown as '?') average more than 20% below stated FTP across non-recovery rides, treat working FTP as 80-90% of stated FTP for all target calculations.",
    `- In that case, note in the strategy field: "Recent training load suggests you may not currently be at your stated FTP — targets have been calibrated to recent form. Consider an FTP retest before race day."`,
    "",
    "STEP 1 — ESTIMATE FINISH TIME FIRST:",
    "- Estimate finish time FIRST using the GPX data and athlete W/kg before setting any power targets. All targets flow from this estimate.",
    "- Heuristic: flat speed from athlete W/kg (roughly 35-45 km/h for 3.5-5 W/kg), add ~1 min per km per 100m elevation gain for climbing, descents at 50-60 km/h with minimal pedalling.",
    "",
    "STEP 2 — FLAT POWER CEILING (determined by estimated duration):",
    "- Under 30min (prologue / short TT): 105-115% FTP",
    "- 30min-1h: 95-105% FTP",
    "- 1-2h: 90-95% FTP",
    "- 2-3h: 85-90% FTP",
    "- 3-4h: 80-86% FTP",
    "- 4h+: 75-82% FTP",
    "",
    "STEP 3 — VARIABILITY STRATEGY (determined by race type, NOT power ceiling):",
    "- TT (solo effort): ride as close to the flat ceiling as possible, as steadily as possible. Minimise surges. Target VI < 1.05.",
    "- Road race / crit: higher variability is unavoidable. NP target matches the duration ceiling but average power will be lower due to surges and recoveries.",
    "- Gran fondo: like a road race but self-governed — advise riding to power targets, not to feel or to competitors.",
    "- Gravel race: conservative, like a gran fondo but reduce all targets a further 5-8% for rolling resistance and terrain variation. Ride to power, not to competitors — drafting is minimal and the terrain will punish over-pacing.",
    "",
    "CLIMB TARGETS (base ranges by climb duration):",
    "- Short climbs (<5 min): 110-120% FTP, W' expenditure acceptable",
    "- Medium climbs (5-20 min): 100-108% FTP, settle in quickly, no blowups",
    "- Long climbs (20 min+): 95-103% FTP — treat like a TT within the race",
    ...(isLongEvent(eventType)
      ? [
          `- ${eventType === "gravel" ? "Gravel / " : ""}Gran fondo event (likely 3h+): reduce ALL climb ceilings by 10-12%. Long climbs: 86-93% FTP. Medium climbs: 89-96% FTP. Cumulative fatigue across the day makes early aggression on climbs catastrophically expensive.`,
        ]
      : []),
    ...(eventType === "time_trial"
      ? [
          "- Multi-hour TT: long climb ceiling must not exceed flat power ceiling + 5%. Treat every climb as a TT segment, not an opportunity to push.",
        ]
      : []),
    "",
    ...(powerProfile ? buildProfileModifiers(powerProfile) : []),
    ...(hrZones
      ? [
          "HR ZONE TARGETS:",
          "- Each segment MUST include targetHrZone and targetHrBpm fields.",
          "- Map power targets to corresponding HR zones:",
          "  - Recovery / descent → Z1",
          "  - Endurance / easy flat → Z2",
          "  - Tempo / moderate flat → Z3",
          "  - Threshold / sustained climb → Z4",
          "  - VO2max / short hard effort → Z5",
          "- targetHrZone: use \"Z2\", \"Z3\", \"Z3-Z4\", etc.",
          "- targetHrBpm: the bpm range from the HR zone table above (e.g. \"145-160\").",
          "- For segments spanning multiple intensities (e.g. rolling), use a range like \"Z2-Z3\".",
          "- HR targets are hard ceilings — if HR drifts above the target zone, the athlete should reduce power.",
          "- CARDIAC DRIFT: In events over 90 minutes, HR naturally rises 5-10 bpm at constant power. For segments in the FINAL THIRD of a race estimated longer than 90 minutes, either (a) relax the HR ceiling by one zone, OR (b) note in the segment advice that a 3-5% power reduction may be needed to keep HR in range as fatigue accumulates.",
          `${hrZones.estimated ? "- NOTE: LTHR is estimated from max HR, so HR targets are approximate. Mention this in the strategy." : ""}`,
          "",
        ]
      : []),
    "OTHER:",
    "- Descents: recovery windows — advise soft pedalling, eat and drink here",
    "- First 10 minutes: start 5-10% below flat target to allow warm-up and positioning, then settle into race pace",
    "- Final km: budget a push at 105-120% FTP if W' allows, only if estimated finish time suggests meaningful sprint capacity remains",
    ...(gpxData.totalDistanceKm > 0 && eventType !== "time_trial"
      ? [
          `- ${
            gpxData.segments.reduce((acc, s) => acc + s.distanceKm, 0) > 80 ||
            isLongEvent(eventType)
              ? "NUTRITION (mandatory for this event length): include at least one explicit fuelling note in the strategy or segment advice — descents and flat sections are prime eating/drinking windows. Events >2h require 60-90g carbs/hour to avoid bonking."
              : "Fuelling: if the event is likely longer than 2 hours based on your finish time estimate, mention nutrition timing in the strategy."
          }`,
        ]
      : []),
    "- Do NOT be excessively conservative — give athletes numbers they can actually race on. This is a race, not a training ride.",
    "- Advice should reference specific route geography from the GPX segments and be tactically useful, not generic",
    "",
    "FINAL CHECK before outputting JSON:",
    "- Verify that overallTargetNpW falls within the STEP 2 flat power ceiling for the estimated finish time. If it exceeds it, reduce the highest outlier segment targets.",
    "- Verify that no single segment's targetPowerPercent exceeds the physiological maximum for its estimatedTimeMin: >60min → max 95%, 20-60min → max 105%, 5-20min → max 115%.",
  ].join("\n");
}
