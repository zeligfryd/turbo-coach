import type { GpxPoint, GpxData, GpxSegment, PacingPlan } from "@/lib/race/types";

// ── Constants ────────────────────────────────────────────────────

const G = 9.81;
const DEFAULT_BIKE_MASS_KG = 9;
const DEFAULT_RHO = 1.225; // kg/m^3, sea level
const MAX_DESCENT_SPEED_MS = 22.2; // ~80 km/h
const MIN_POWER_W = 50; // soft pedalling floor on descents
const CHUNK_SIZE_KM = 0.5; // fallback chunk size when no terrain segments

type PhysicsDefaults = { CdA: number; Crr: number };

const EVENT_DEFAULTS: Record<string, PhysicsDefaults> = {
  time_trial:  { CdA: 0.27, Crr: 0.005 },
  road_race:   { CdA: 0.35, Crr: 0.005 },
  crit:        { CdA: 0.35, Crr: 0.005 },
  hill_climb:  { CdA: 0.35, Crr: 0.005 },
  gran_fondo:  { CdA: 0.37, Crr: 0.005 },
  sportive:    { CdA: 0.37, Crr: 0.005 },
  gravel:      { CdA: 0.40, Crr: 0.007 },
  cyclocross:  { CdA: 0.40, Crr: 0.008 },
  other:       { CdA: 0.37, Crr: 0.005 },
};

export type PhysicsOptions = {
  bikeMassKg?: number;
  CdA?: number;
  Crr?: number;
  rho?: number;
};

// ── Core solver ──────────────────────────────────────────────────

/**
 * Solve for velocity (m/s) given power, gradient, and rider parameters.
 *
 * Power = Crr·m·g·v + 0.5·CdA·ρ·v³ + m·g·grade·v
 *
 * Uses Newton's method. For descents, caps at MAX_DESCENT_SPEED_MS.
 */
export function solveSpeed(
  powerW: number,
  grade: number,
  totalMassKg: number,
  CdA: number,
  Crr: number,
  rho: number = DEFAULT_RHO,
): number {
  const P = Math.max(powerW, 0);
  const a = 0.5 * CdA * rho;
  const b = (Crr + grade) * totalMassKg * G;

  if (b < 0 && P === 0) {
    const termV = Math.sqrt((-b) / a);
    return Math.min(termV, MAX_DESCENT_SPEED_MS);
  }

  let v = 8;
  if (grade > 0.05) v = 3;
  if (grade < -0.03) v = 15;

  for (let i = 0; i < 30; i++) {
    const fv = a * v * v * v + b * v - P;
    const fpv = 3 * a * v * v + b;
    if (Math.abs(fpv) < 1e-10) break;
    v = Math.max(v - fv / fpv, 0.01);
    if (Math.abs(fv) < 1e-6) break;
  }

  return Math.min(v, MAX_DESCENT_SPEED_MS);
}

// ── Elevation interpolation ─────────────────────────────────────

/**
 * Linearly interpolate elevation at a given km from stored GPX points.
 * Uses binary search to find the bracketing points.
 */
function interpolateElevation(points: GpxPoint[], km: number): number {
  if (points.length === 0) return 0;
  if (km <= points[0].distanceKm) return points[0].ele;
  if (km >= points[points.length - 1].distanceKm) return points[points.length - 1].ele;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distanceKm <= km) lo = mid;
    else hi = mid;
  }

  const p1 = points[lo];
  const p2 = points[hi];
  const span = p2.distanceKm - p1.distanceKm;
  if (span < 1e-6) return p1.ele;
  const t = (km - p1.distanceKm) / span;
  return p1.ele + t * (p2.ele - p1.ele);
}

// ── Terrain-segment-based integration ───────────────────────────

/**
 * Compute time by iterating over the GPX terrain segments that overlap
 * with the pacing segment. Terrain segments are detected by the parser
 * from the FULL (pre-downsampling) point set at 500m resolution, so
 * they capture real terrain features without GPS noise.
 *
 * Gradient per terrain segment is computed from stored point elevations
 * interpolated at the overlap boundaries — reliable because the distance
 * is 0.5-5km, long enough for noise to average out.
 */
function computeFromTerrainSegments(
  startKm: number,
  endKm: number,
  points: GpxPoint[],
  terrainSegments: GpxSegment[],
  power: number,
  totalMass: number,
  CdA: number,
  Crr: number,
  rho: number,
): number {
  let totalTimeSec = 0;
  let coveredUpTo = startKm;

  for (const seg of terrainSegments) {
    const overlapStart = Math.max(seg.startKm, startKm);
    const overlapEnd = Math.min(seg.endKm, endKm);
    if (overlapEnd - overlapStart < 0.01) continue;

    // Fill any gap before this terrain segment with flat speed
    if (overlapStart > coveredUpTo + 0.01) {
      const gapM = (overlapStart - coveredUpTo) * 1000;
      totalTimeSec += gapM / solveSpeed(power, 0, totalMass, CdA, Crr, rho);
    }

    const overlapDistM = (overlapEnd - overlapStart) * 1000;

    // Compute gradient from stored point elevations at the overlap boundaries
    const startEle = interpolateElevation(points, overlapStart);
    const endEle = interpolateElevation(points, overlapEnd);
    const grade = overlapDistM > 0 ? (endEle - startEle) / overlapDistM : 0;

    const speed = solveSpeed(power, grade, totalMass, CdA, Crr, rho);
    totalTimeSec += overlapDistM / speed;
    coveredUpTo = overlapEnd;
  }

  // Fill any remaining distance after the last terrain segment
  if (endKm > coveredUpTo + 0.01) {
    const remainM = (endKm - coveredUpTo) * 1000;
    totalTimeSec += remainM / solveSpeed(power, 0, totalMass, CdA, Crr, rho);
  }

  return totalTimeSec / 60;
}

// ── Chunk-based fallback ────────────────────────────────────────

/**
 * Fallback when no terrain segments are available (e.g. synthetic test data).
 * Breaks the range into 500m chunks and computes gradient per chunk from
 * stored point elevations. Over 500m, GPS noise averages out while real
 * terrain features are captured.
 */
function computeFromChunks(
  startKm: number,
  endKm: number,
  points: GpxPoint[],
  power: number,
  totalMass: number,
  CdA: number,
  Crr: number,
  rho: number,
): number {
  let totalTimeSec = 0;
  let currentKm = startKm;

  while (currentKm < endKm - 0.001) {
    const chunkEnd = Math.min(currentKm + CHUNK_SIZE_KM, endKm);
    const chunkDistM = (chunkEnd - currentKm) * 1000;

    const startEle = interpolateElevation(points, currentKm);
    const endEle = interpolateElevation(points, chunkEnd);
    const grade = chunkDistM > 0 ? (endEle - startEle) / chunkDistM : 0;

    const speed = solveSpeed(power, grade, totalMass, CdA, Crr, rho);
    totalTimeSec += chunkDistM / speed;
    currentKm = chunkEnd;
  }

  return totalTimeSec / 60;
}

// ── Segment time computation ─────────────────────────────────────

/**
 * Compute time (minutes) for a pacing segment.
 *
 * Primary: uses terrain segments (detected by the parser from full-resolution
 * data at 500m granularity) for integration. This avoids both GPS noise
 * inflation (point-by-point on noisy data) and over-smoothing (which
 * flattens real gradients).
 *
 * Fallback: 500m chunk-based integration from stored points when no
 * terrain segments are available.
 */
export function computeSegmentTime(
  startKm: number,
  endKm: number,
  powerW: number,
  riderWeightKg: number,
  gpxData: GpxData,
  eventType: string,
  options?: PhysicsOptions,
): number {
  const defaults = EVENT_DEFAULTS[eventType] ?? EVENT_DEFAULTS.other;
  const CdA = options?.CdA ?? defaults.CdA;
  const Crr = options?.Crr ?? defaults.Crr;
  const rho = options?.rho ?? DEFAULT_RHO;
  const bikeMass = options?.bikeMassKg ?? DEFAULT_BIKE_MASS_KG;
  const totalMass = riderWeightKg + bikeMass;
  const effectivePower = Math.max(powerW, MIN_POWER_W);

  const distanceKm = endKm - startKm;
  if (distanceKm <= 0) return 0;

  const points = gpxData.points ?? [];
  const terrainSegments = gpxData.segments ?? [];

  // Primary: terrain-segment-based integration
  if (terrainSegments.length > 0 && points.length >= 2) {
    return computeFromTerrainSegments(
      startKm, endKm, points, terrainSegments,
      effectivePower, totalMass, CdA, Crr, rho,
    );
  }

  // Fallback: chunk-based integration from stored points
  if (points.length >= 2) {
    return computeFromChunks(
      startKm, endKm, points,
      effectivePower, totalMass, CdA, Crr, rho,
    );
  }

  // Last resort: flat gradient
  const dM = distanceKm * 1000;
  const speed = solveSpeed(effectivePower, 0, totalMass, CdA, Crr, rho);
  return (dM / speed) / 60;
}

// ── Plan recomputation ───────────────────────────────────────────

/**
 * Replace all time estimates in a PacingPlan with physics-based calculations.
 * Does not mutate the input — returns a new plan.
 */
export function recomputePlanTimes(
  plan: PacingPlan,
  gpxData: GpxData,
  riderWeightKg: number,
  eventType: string,
  options?: PhysicsOptions,
): PacingPlan {
  const segments = plan.segments.map((seg) => {
    const time = computeSegmentTime(
      seg.startKm,
      seg.endKm,
      seg.targetPowerW,
      riderWeightKg,
      gpxData,
      eventType,
      options,
    );

    return {
      ...seg,
      estimatedTimeMin: Math.round(time),
    };
  });

  const totalTime = segments.reduce((sum, s) => sum + s.estimatedTimeMin, 0);

  return {
    ...plan,
    segments,
    estimatedFinishTimeMin: totalTime,
  };
}
