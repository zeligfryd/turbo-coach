/**
 * Heart rate zone model based on Coggan's 5-zone system using %LTHR.
 *
 * If the athlete only provides max HR, LTHR is estimated as ~93% of max HR
 * (a reasonable default for trained cyclists).
 */

export type HrZone = {
  zone: number;
  name: string;
  minBpm: number;
  maxBpm: number;
};

export type HrZoneModel = {
  lthr: number;
  estimated: boolean; // true if LTHR was estimated from max HR
  zones: HrZone[];
};

// Coggan 5-zone thresholds as fraction of LTHR
const ZONE_THRESHOLDS: { zone: number; name: string; minPct: number; maxPct: number }[] = [
  { zone: 1, name: "Active Recovery", minPct: 0, maxPct: 0.81 },
  { zone: 2, name: "Endurance", minPct: 0.81, maxPct: 0.89 },
  { zone: 3, name: "Tempo", minPct: 0.89, maxPct: 0.93 },
  { zone: 4, name: "Threshold", minPct: 0.93, maxPct: 1.0 },
  { zone: 5, name: "VO2max+", minPct: 1.0, maxPct: 1.15 },
];

// Coggan's recommended estimate is ~84-90% of max HR; 0.87 is the midpoint.
// Using 0.93 overestimates LTHR, pushing all HR zones too high.
const LTHR_FROM_MAX_HR_FACTOR = 0.87;

/**
 * Resolve LTHR from explicit value or estimate from max HR.
 * Returns null if neither is available.
 */
export function resolveLthr(
  maxHr: number | null,
  lthr: number | null,
): { lthr: number; estimated: boolean } | null {
  if (lthr && lthr > 0) return { lthr, estimated: false };
  if (maxHr && maxHr > 0) {
    return { lthr: Math.round(maxHr * LTHR_FROM_MAX_HR_FACTOR), estimated: true };
  }
  return null;
}

/**
 * Build the 5-zone model from LTHR.
 */
export function buildHrZones(
  maxHr: number | null,
  lthr: number | null,
): HrZoneModel | null {
  const resolved = resolveLthr(maxHr, lthr);
  if (!resolved) return null;

  const zones: HrZone[] = ZONE_THRESHOLDS.map((t) => ({
    zone: t.zone,
    name: t.name,
    minBpm: Math.round(resolved.lthr * t.minPct),
    maxBpm: Math.round(resolved.lthr * t.maxPct),
  }));

  return { lthr: resolved.lthr, estimated: resolved.estimated, zones };
}

/**
 * Format HR zones as a string block for inclusion in LLM prompts.
 */
export function formatHrZonesForPrompt(model: HrZoneModel): string {
  const lines = [
    `Heart rate zones (LTHR: ${model.lthr} bpm${model.estimated ? ", estimated from max HR" : ""}):`,
    ...model.zones.map(
      (z) => `- Z${z.zone} ${z.name}: ${z.minBpm}–${z.maxBpm} bpm`,
    ),
  ];
  return lines.join("\n");
}
