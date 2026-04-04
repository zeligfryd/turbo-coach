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

  const isSteadyStateEvent = (eventType: string) =>
    eventType === "time_trial" || eventType === "gran_fondo" || eventType === "gravel";

  return [
    "You are an expert cycling coach creating a race pacing plan.",
    "Return ONLY valid JSON matching this exact structure (no markdown, no explanation):",
    "",
    `{"overallTargetNpW": number, "estimatedFinishTimeMin": number, "strategy": "string (2-3 sentences)", "segments": [{"label": "string", "startKm": number, "endKm": number, "targetPowerW": number, "targetPowerPercent": number, "estimatedTimeMin": number, "advice": "string (1-2 sentences, include watts AND W/kg for climb segments)"${hrZones ? ', "targetHrZone": "string (e.g. Z2, Z3-Z4)", "targetHrBpm": "string (e.g. 145-160)"' : ""}}]}`,
    "",
    "Example output (40km flat TT, FTP 280W, 75kg, ~56min):",
    '{"overallTargetNpW": 266, "estimatedFinishTimeMin": 56, "strategy": "Even-paced 40km TT targeting IF 0.95. Start 5-10% below target for the first 5 minutes while HR stabilises — this is critical to avoid the adrenaline trap. Hold 95-97% FTP throughout, keeping VI under 1.05, and build to 100% in the final 5km.", "segments": [{"label": "Opening 5km", "startKm": 0, "endKm": 5, "targetPowerW": 252, "targetPowerPercent": 90, "estimatedTimeMin": 7, "advice": "Controlled start — resist the adrenaline. RPE will feel deceptively easy; trust the power meter, not your legs. Let HR build for 5 minutes before settling into race pace."}, {"label": "Main effort", "startKm": 5, "endKm": 35, "targetPowerW": 271, "targetPowerPercent": 97, "estimatedTimeMin": 42, "advice": "Hold steady, aero position. VI target <1.05 — any surging costs disproportionately more glycogen than the same NP held steady."}, {"label": "Final push", "startKm": 35, "endKm": 40, "targetPowerW": 280, "targetPowerPercent": 100, "estimatedTimeMin": 7, "advice": "Build to 100% FTP if HR and legs feel good. Empty the tank — this is your only chance to spend freely."}]}',
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
    "CORE PRINCIPLE — INTENSITY FACTOR (IF) AS THE FOUNDATION:",
    "Intensity Factor (IF = NP / FTP) is the single best predictor of sustainable race intensity.",
    "All power targets must be derived from IF for the estimated duration, not from arbitrary %-FTP ranges.",
    "Typical IF values by event duration (from Coggan et al.):",
    "- Under 30min (prologue / short TT): IF 1.05-1.15",
    "- 30min-1h (TT / short race): IF 0.95-1.05",
    "- 1-2h (road race / crit): IF 0.85-0.95",
    "- 2-3h (long road race / short gran fondo): IF 0.80-0.88",
    "- 3-4h (gran fondo / gravel): IF 0.75-0.82",
    "- 4-5h (long gran fondo / Ironman bike): IF 0.70-0.78",
    "- 5h+ (ultra-endurance): IF 0.65-0.75",
    `The target NP in watts = IF × FTP (${ftp}W).`,
    "",
    "A. FTP and W/kg as foundation:",
    `- Use FTP (${ftp}W) as the reference for all calculations.`,
    "- Always reason about climbs in W/kg first, then convert to watts.",
    '  Show both in advice text: e.g. "323W (3.75 W/kg)".',
    "- Math check: all watts = round(FTP × percentage), all W/kg = watts / weightKg. These must be consistent.",
    "",
    "FORM CHECK — do this before setting any targets:",
    "- Inspect the recent rides. If recent NP values (excluding rides shown as '?') average more than 20% below stated FTP across non-recovery rides, treat working FTP as 80-90% of stated FTP for all target calculations.",
    `- In that case, note in the strategy field: "Recent training load suggests you may not currently be at your stated FTP — targets have been calibrated to recent form. Consider an FTP retest before race day."`,
    "",
    "STEP 1 — ESTIMATE FINISH TIME (rough estimate — will be refined by physics model):",
    "- Provide a rough finish time estimate so you can select the correct IF bracket in Step 2.",
    "- This value will be overwritten by a physics-based calculation, so don't overthink it — a ballpark is sufficient.",
    "- Account for elevation: hilly courses are significantly slower than flat courses of the same distance. More climbing = longer finish time.",
    "",
    "STEP 2 — DETERMINE OVERALL TARGET NP FROM IF:",
    "- Using the estimated finish time, select the appropriate IF from the table above.",
    "- Calculate overallTargetNpW = round(IF × FTP).",
    "- This is the NP the athlete should average across the entire race. Individual segments will be above or below this, but NP across the full event must converge to this target.",
    "",
    "STEP 3 — VARIABILITY INDEX (VI) TARGETS BY EVENT TYPE:",
    "The Variability Index (VI = NP / average power) measures how smooth the effort is.",
    "Higher VI means more glycogen burned for the same NP — variable power is metabolically more expensive than steady power at the same NP.",
    "This is because glycogen utilization, lactate production, and stress hormones are curvilinearly (not linearly) related to intensity — surges above threshold cost disproportionately more than the energy saved by coasting.",
    "",
    "Target VI by event type (from Coggan et al.):",
    "- Time trial: flat TT 1.00-1.04, hill-climb TT 1.00-1.06. Isopower is the goal — lower is better.",
    "- Gran fondo: VI 1.04-1.07. Self-governed — advise riding to power, not to feel or to competitors.",
    "- Gravel: VI 1.05-1.10. Terrain forces some variability, but minimize it. Drafting is minimal and terrain punishes over-pacing.",
    "- Road race: flat 1.00-1.06, hilly 1.20-1.35. Use the GPX elevation data to judge where this race falls on the spectrum.",
    "- Criterium: flat 1.06-1.35, hilly 1.13-1.50. Constant surging from corners and attacks.",
    "- Mountain bike: VI 1.13-1.50. Terrain forces extreme variability.",
    "",
    ...(isSteadyStateEvent(eventType)
      ? [
          "SMOOTH POWER TRANSITIONS (critical for this event type):",
          "- When approaching a hill, smoothly transition power from flat target up to climb target — do NOT attack or surge at the base.",
          "- Resist the temptation to accelerate or match faster riders on climbs. Ride YOUR numbers.",
          "- On descents, your muscles are recovering even if you try to push — use descents as active recovery windows.",
          "- Minimize power surges throughout. Every surge above threshold burns disproportionately more muscle glycogen.",
          "- Use gearing to keep cadence consistent across terrain changes rather than mashing a big gear on climbs.",
          "",
        ]
      : []),
    "CLIMB TARGETS (base ranges by climb duration):",
    "- Short climbs (<1 min, very steep): up to 110% of goal NP. Quick burn, quick recovery on descent.",
    "- Short-medium climbs (1-5 min): 105-110% of goal NP. W' expenditure acceptable if descent follows.",
    "- Medium climbs (5-20 min): 100-108% FTP. Settle in quickly, no blowups. For hills that plateau at the top (no descent recovery), stay at or just above FTP — hammering up only to struggle on the flat after the crest gives away time.",
    "- Long climbs (20 min+): 95-103% FTP — treat like a TT within the race.",
    "- For ALL climbs: if the hill has a corresponding downhill, you can push slightly harder because you WILL recover on the descent (you physically cannot produce high watts descending even if you try). If the hill plateaus or flattens, be more conservative — there is no free recovery.",
    ...(isLongEvent(eventType)
      ? [
          `- ${eventType === "gravel" ? "Gravel / " : ""}Gran fondo event (likely 3h+): reduce ALL climb ceilings by 10-12%. Long climbs: 86-93% FTP. Medium climbs: 89-96% FTP. Cumulative fatigue across the day makes early aggression on climbs catastrophically expensive — going too hard on hills risks depleting muscle glycogen with no reserve for later.`,
        ]
      : []),
    ...(eventType === "time_trial"
      ? [
          "- TT climbs: long climb ceiling must not exceed flat power ceiling + 5%. Treat every climb as a TT segment. On even hills (up then down), push up to 105% FTP for hills under 5 min; for longer hills, stay closer to FTP. The recovery on the descent compensates.",
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
          "- CARDIAC DRIFT: In events over 90 minutes, HR naturally rises 5-10 bpm at constant power due to dehydration and heat. For segments in the FINAL THIRD of a race estimated longer than 90 minutes, either (a) relax the HR ceiling by one zone, OR (b) note in the segment advice that a 3-5% power reduction may be needed to keep HR in range as fatigue accumulates.",
          `${hrZones.estimated ? "- NOTE: LTHR is estimated from max HR, so HR targets are approximate. Mention this in the strategy." : ""}`,
          "",
        ]
      : []),
    "THE FIRST 5 MINUTES — THE ADRENALINE TRAP:",
    "- The #1 pacing mistake in cycling: starting too hard. Adrenaline, endorphins, and race excitement mask actual exertion for the first 4-5 minutes. RPE will feel deceptively easy. By the time it catches up, the damage is done — you've dug a hole you cannot recover from.",
    "- In TTs: start at 90-95% of target for the first 5 minutes. Hold back even though it feels like you're leaving time on the table — you are not. Let HR rise to threshold naturally (takes ~5 min), then lock in at target power.",
    "- In mass-start races: use the first 5-10 minutes for positioning at 5-10% below target, then settle into race pace.",
    "- The shorter the event, the less you hold back — but even in a 10-mile TT, hold back for the first 2 minutes.",
    "",
    "FINAL KM / FINISH:",
    "- Budget a push at 105-120% FTP if W' allows, only if estimated finish time suggests meaningful sprint capacity remains.",
    "- In TTs: bring pace up with 3-5 minutes to go. This is the only time to spend freely.",
    "",
    "DESCENTS:",
    "- Recovery windows — you physically cannot produce high watts descending even at max effort. Use this to your advantage.",
    "- Advise soft pedalling, eat and drink here. Descents are prime fuelling windows.",
    "- Do not set descent power targets above ~55% FTP — even hard pedalling on steep descents rarely exceeds Active Recovery levels.",
    "",
    ...(gpxData.totalDistanceKm > 0
      ? [
          "NUTRITION AND ENERGY:",
          "- Muscle glycogen is the limiting fuel source. Variable power burns glycogen faster than steady power at the same NP (curvilinear metabolic response).",
          ...(gpxData.segments.reduce((acc, s) => acc + s.distanceKm, 0) > 80 ||
            isLongEvent(eventType)
            ? [
                "- MANDATORY for this event length: include explicit fuelling notes in the strategy and in at least one segment advice.",
                "- Events >2h require 60-90g carbs/hour to avoid bonking. Descents and easy flat sections are prime eating/drinking windows.",
                "- In events >3h, fuelling is as important as power targets — an athlete who eats well and rides at 80% FTP will outperform one who rides at 85% FTP but bonks.",
              ]
            : eventType !== "time_trial"
              ? ["- If the event is likely longer than 2 hours, mention nutrition timing in the strategy."]
              : []),
          "",
        ]
      : []),
    "GENERAL:",
    "- Do NOT be excessively conservative — give athletes numbers they can actually race on. This is a race, not a training ride.",
    "- Advice should reference specific route geography from the GPX segments and be tactically useful, not generic.",
    "- Connect power targets to the WHY — explain what the athlete gains or risks, don't just state numbers.",
    "",
    "FINAL CHECK before outputting JSON:",
    "- Verify that overallTargetNpW matches IF × FTP for the estimated duration. If it doesn't, adjust.",
    "- Verify that no single segment's targetPowerPercent exceeds the physiological maximum for its estimatedTimeMin: >60min → max 95%, 20-60min → max 105%, 5-20min → max 115%, <5min → max 120%.",
    "- Verify VI is plausible: compute implied average power from segment targets and check that NP/avgPower falls within the VI range for this event type.",
  ].join("\n");
}
