import type { GpxSegment, GpxData } from "@/lib/race/types";

/**
 * Four course fixtures as GpxSegment[] arrays.
 * These bypass GPX parsing and directly define segments for pacing tests.
 */

// ── Flat Time Trial (50km, 200m elevation) ───────────────────
export const FLAT_TT_SEGMENTS: GpxSegment[] = [
  { label: "Flat 1 — km 0.0", startKm: 0, endKm: 25, distanceKm: 25, elevationGainM: 100, avgGradientPercent: 0.4, type: "flat" },
  { label: "Flat 2 — km 25.0", startKm: 25, endKm: 50, distanceKm: 25, elevationGainM: 100, avgGradientPercent: 0.4, type: "flat" },
];

export const FLAT_TT: GpxData = {
  points: [],
  segments: FLAT_TT_SEGMENTS,
  totalDistanceKm: 50,
  totalElevationM: 200,
};

// ── Hilly Road Race (120km, 2500m) ──────────────────────────
export const HILLY_ROAD_RACE_SEGMENTS: GpxSegment[] = [
  { label: "Flat 1 — km 0.0", startKm: 0, endKm: 15, distanceKm: 15, elevationGainM: 50, avgGradientPercent: 0.3, type: "flat" },
  { label: "Climb 1 — km 15.0, 8km at 6%", startKm: 15, endKm: 23, distanceKm: 8, elevationGainM: 480, avgGradientPercent: 6, type: "climb" },
  { label: "Descent 1 — km 23.0", startKm: 23, endKm: 30, distanceKm: 7, elevationGainM: 0, avgGradientPercent: -6.8, type: "descent" },
  { label: "Flat 2 — km 30.0", startKm: 30, endKm: 55, distanceKm: 25, elevationGainM: 100, avgGradientPercent: 0.4, type: "flat" },
  { label: "Climb 2 — km 55.0, 12km at 5%", startKm: 55, endKm: 67, distanceKm: 12, elevationGainM: 600, avgGradientPercent: 5, type: "climb" },
  { label: "Descent 2 — km 67.0", startKm: 67, endKm: 78, distanceKm: 11, elevationGainM: 0, avgGradientPercent: -5.5, type: "descent" },
  { label: "Climb 3 — km 78.0, 15km at 6.3%", startKm: 78, endKm: 93, distanceKm: 15, elevationGainM: 950, avgGradientPercent: 6.3, type: "climb" },
  { label: "Descent 3 — km 93.0", startKm: 93, endKm: 108, distanceKm: 15, elevationGainM: 0, avgGradientPercent: -6.2, type: "descent" },
  { label: "Flat 3 — km 108.0", startKm: 108, endKm: 120, distanceKm: 12, elevationGainM: 40, avgGradientPercent: 0.3, type: "flat" },
];

export const HILLY_ROAD_RACE: GpxData = {
  points: [],
  segments: HILLY_ROAD_RACE_SEGMENTS,
  totalDistanceKm: 120,
  totalElevationM: 2500,
};

// ── Criterium (flat, 1.5km circuit) ─────────────────────────
export const CRIT_SEGMENTS: GpxSegment[] = [
  { label: "Flat 1 — km 0.0", startKm: 0, endKm: 1.5, distanceKm: 1.5, elevationGainM: 5, avgGradientPercent: 0.3, type: "flat" },
];

export const CRIT: GpxData = {
  points: [],
  segments: CRIT_SEGMENTS,
  totalDistanceKm: 1.5,
  totalElevationM: 5,
};

// ── Mountain Gran Fondo (150km, 3500m) ──────────────────────
export const MOUNTAIN_GF_SEGMENTS: GpxSegment[] = [
  { label: "Flat 1 — km 0.0", startKm: 0, endKm: 10, distanceKm: 10, elevationGainM: 30, avgGradientPercent: 0.3, type: "flat" },
  { label: "Climb 1 — km 10.0, 18km at 5.5%", startKm: 10, endKm: 28, distanceKm: 18, elevationGainM: 990, avgGradientPercent: 5.5, type: "climb" },
  { label: "Descent 1 — km 28.0", startKm: 28, endKm: 42, distanceKm: 14, elevationGainM: 0, avgGradientPercent: -6.0, type: "descent" },
  { label: "Flat 2 — km 42.0", startKm: 42, endKm: 60, distanceKm: 18, elevationGainM: 50, avgGradientPercent: 0.3, type: "flat" },
  { label: "Climb 2 — km 60.0, 14km at 6.8%", startKm: 60, endKm: 74, distanceKm: 14, elevationGainM: 952, avgGradientPercent: 6.8, type: "climb" },
  { label: "Descent 2 — km 74.0", startKm: 74, endKm: 85, distanceKm: 11, elevationGainM: 0, avgGradientPercent: -7.0, type: "descent" },
  { label: "Flat 3 — km 85.0", startKm: 85, endKm: 100, distanceKm: 15, elevationGainM: 40, avgGradientPercent: 0.3, type: "flat" },
  { label: "Climb 3 — km 100.0, 10km at 7.2%", startKm: 100, endKm: 110, distanceKm: 10, elevationGainM: 720, avgGradientPercent: 7.2, type: "climb" },
  { label: "Descent 3 — km 110.0", startKm: 110, endKm: 120, distanceKm: 10, elevationGainM: 0, avgGradientPercent: -7.0, type: "descent" },
  { label: "Climb 4 — km 120.0, 12km at 6.5%", startKm: 120, endKm: 132, distanceKm: 12, elevationGainM: 780, avgGradientPercent: 6.5, type: "climb" },
  { label: "Descent 4 — km 132.0", startKm: 132, endKm: 143, distanceKm: 11, elevationGainM: 0, avgGradientPercent: -6.5, type: "descent" },
  { label: "Flat 4 — km 143.0", startKm: 143, endKm: 150, distanceKm: 7, elevationGainM: 20, avgGradientPercent: 0.3, type: "flat" },
];

export const MOUNTAIN_GF: GpxData = {
  points: [],
  segments: MOUNTAIN_GF_SEGMENTS,
  totalDistanceKm: 150,
  totalElevationM: 3500,
};
