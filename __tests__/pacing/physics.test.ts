import { describe, it, expect } from "vitest";
import { solveSpeed, computeSegmentTime, recomputePlanTimes } from "@/lib/pacing/physics";
import type { GpxPoint, GpxData, GpxSegment, PacingPlan } from "@/lib/race/types";

// ── Helpers ──────────────────────────────────────────────────────

const toKmh = (ms: number) => ms * 3.6;

/** Generate GPX points along a segment with constant gradient. */
function makePoints(
  startKm: number,
  endKm: number,
  startEle: number,
  endEle: number,
  numPoints: number = 20,
): GpxPoint[] {
  const points: GpxPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    points.push({
      lat: 0,
      lon: 0,
      distanceKm: startKm + t * (endKm - startKm),
      ele: startEle + t * (endEle - startEle),
    });
  }
  return points;
}

/** Build a minimal GpxData from points. */
function gpx(points: GpxPoint[]): GpxData {
  const totalDist = points.length > 0 ? points[points.length - 1].distanceKm : 0;
  return { points, segments: [], totalDistanceKm: totalDist, totalElevationM: 0 };
}

const EMPTY_GPX: GpxData = { points: [], segments: [], totalDistanceKm: 0, totalElevationM: 0 };

// ── solveSpeed ───────────────────────────────────────────────────

describe("solveSpeed", () => {
  const CdA = 0.35;
  const Crr = 0.005;
  const rho = 1.225;

  it("flat road at 250W / 95kg total → ~35 km/h", () => {
    const kmh = toKmh(solveSpeed(250, 0, 95, CdA, Crr, rho));
    expect(kmh).toBeGreaterThan(33);
    expect(kmh).toBeLessThan(37);
  });

  it("flat road at 300W / 84kg total → ~37 km/h", () => {
    const kmh = toKmh(solveSpeed(300, 0, 84, CdA, Crr, rho));
    expect(kmh).toBeGreaterThan(35);
    expect(kmh).toBeLessThan(39);
  });

  it("5% climb at 250W / 95kg → ~16 km/h", () => {
    const kmh = toKmh(solveSpeed(250, 0.05, 95, CdA, Crr, rho));
    expect(kmh).toBeGreaterThan(14);
    expect(kmh).toBeLessThan(18);
  });

  it("10% climb at 250W / 95kg → very slow (~7-8 km/h)", () => {
    const kmh = toKmh(solveSpeed(250, 0.10, 95, CdA, Crr, rho));
    expect(kmh).toBeGreaterThan(5);
    expect(kmh).toBeLessThan(10);
  });

  it("steep descent at 50W / -8% → fast, capped at 80 km/h", () => {
    const kmh = toKmh(solveSpeed(50, -0.08, 95, CdA, Crr, rho));
    expect(kmh).toBeGreaterThan(40);
    expect(kmh).toBeLessThanOrEqual(80);
  });

  it("zero power on flat → near-zero velocity", () => {
    expect(solveSpeed(0, 0, 95, CdA, Crr, rho)).toBeLessThan(0.1);
  });

  it("zero power on descent → terminal velocity from gravity", () => {
    const kmh = toKmh(solveSpeed(0, -0.05, 95, CdA, Crr, rho));
    expect(kmh).toBeGreaterThan(30);
    expect(kmh).toBeLessThanOrEqual(80);
  });

  it("TT position (low CdA) is faster than road position", () => {
    expect(solveSpeed(300, 0, 84, 0.27, Crr, rho)).toBeGreaterThan(
      solveSpeed(300, 0, 84, 0.35, Crr, rho),
    );
  });

  it("heavier rider is slower on climbs but similar on flat", () => {
    const vLight = solveSpeed(250, 0.06, 75, CdA, Crr, rho);
    const vHeavy = solveSpeed(250, 0.06, 95, CdA, Crr, rho);
    expect(vLight).toBeGreaterThan(vHeavy * 1.1);

    const vLightFlat = solveSpeed(250, 0, 75, CdA, Crr, rho);
    const vHeavyFlat = solveSpeed(250, 0, 95, CdA, Crr, rho);
    expect(vHeavyFlat / vLightFlat).toBeGreaterThan(0.95);
  });
});

// ── computeSegmentTime ───────────────────────────────────────────

describe("computeSegmentTime", () => {
  it("10km flat at 250W / 86kg → ~17-20 min", () => {
    const g = gpx(makePoints(0, 10, 100, 100));
    const time = computeSegmentTime(0, 10, 250, 86, g, "road_race");
    expect(time).toBeGreaterThan(15);
    expect(time).toBeLessThan(22);
  });

  it("5km climb at 6% at 250W / 86kg → ~14-22 min", () => {
    const g = gpx(makePoints(0, 5, 100, 400));
    const time = computeSegmentTime(0, 5, 250, 86, g, "road_race");
    expect(time).toBeGreaterThan(13);
    expect(time).toBeLessThan(23);
  });

  it("5km descent at -6% at 50W → ~3-7 min", () => {
    const g = gpx(makePoints(0, 5, 400, 100));
    const time = computeSegmentTime(0, 5, 50, 86, g, "road_race");
    expect(time).toBeGreaterThan(2);
    expect(time).toBeLessThan(8);
  });

  it("zero-length segment returns 0", () => {
    expect(computeSegmentTime(5, 5, 250, 86, EMPTY_GPX, "road_race")).toBe(0);
  });

  it("fallback with no points uses flat gradient", () => {
    const time = computeSegmentTime(0, 10, 250, 86, EMPTY_GPX, "road_race");
    expect(time).toBeGreaterThan(15);
    expect(time).toBeLessThan(25);
  });

  it("gravel is slower than road (higher CdA and Crr)", () => {
    const g = gpx(makePoints(0, 10, 100, 100));
    expect(computeSegmentTime(0, 10, 250, 86, g, "gravel")).toBeGreaterThan(
      computeSegmentTime(0, 10, 250, 86, g, "road_race"),
    );
  });

  it("uses terrain segments when available for accurate gradient", () => {
    const pts = makePoints(0, 10, 100, 100); // flat stored points
    const terrainSegs: GpxSegment[] = [
      { label: "Climb 1", startKm: 0, endKm: 5, distanceKm: 5, elevationGainM: 300, avgGradientPercent: 6, type: "climb" },
      { label: "Descent 1", startKm: 5, endKm: 10, distanceKm: 5, elevationGainM: 0, avgGradientPercent: 0, type: "descent" },
    ];
    // Override stored point elevations to match terrain segments
    const ptsWithEle = makePoints(0, 5, 100, 400, 10).concat(makePoints(5, 10, 400, 100, 10));
    const g: GpxData = { points: ptsWithEle, segments: terrainSegs, totalDistanceKm: 10, totalElevationM: 300 };

    // With terrain segments: climb then descent — should be slower than flat
    const timeWithTerrain = computeSegmentTime(0, 10, 250, 86, g, "road_race");
    const timeFlat = computeSegmentTime(0, 10, 250, 86, gpx(makePoints(0, 10, 100, 100)), "road_race");
    expect(timeWithTerrain).toBeGreaterThan(timeFlat);
  });

  it("terrain segments produce correct descent speed (not flat)", () => {
    const pts = makePoints(0, 5, 400, 100, 20);
    const terrainSegs: GpxSegment[] = [
      { label: "Descent 1", startKm: 0, endKm: 5, distanceKm: 5, elevationGainM: 0, avgGradientPercent: 0, type: "descent" },
    ];
    const g: GpxData = { points: pts, segments: terrainSegs, totalDistanceKm: 5, totalElevationM: 0 };

    // Descent at -6% should be very fast
    const time = computeSegmentTime(0, 5, 50, 86, g, "road_race");
    expect(time).toBeGreaterThan(2);
    expect(time).toBeLessThan(7);
  });
});

// ── recomputePlanTimes ───────────────────────────────────────────

describe("recomputePlanTimes", () => {
  const gpxData: GpxData = {
    points: [
      ...makePoints(0, 50, 100, 100, 50),
      ...makePoints(50, 60, 100, 600, 20),
      ...makePoints(60, 65, 600, 350, 10),
      ...makePoints(65, 100, 350, 350, 35),
    ],
    segments: [],
    totalDistanceKm: 100,
    totalElevationM: 500,
  };

  const basePlan: PacingPlan = {
    overallTargetNpW: 240,
    estimatedFinishTimeMin: 180,
    strategy: "Even-paced effort with controlled climbing.",
    segments: [
      { label: "Flat 1", startKm: 0, endKm: 50, targetPowerW: 240, targetPowerPercent: 85, estimatedTimeMin: 80, advice: "Hold steady", targetHrZone: "Z3", targetHrBpm: "145-155" },
      { label: "Main Climb", startKm: 50, endKm: 60, targetPowerW: 270, targetPowerPercent: 96, estimatedTimeMin: 30, advice: "Pace by W/kg", targetHrZone: "Z4", targetHrBpm: "160-170" },
      { label: "Descent", startKm: 60, endKm: 65, targetPowerW: 80, targetPowerPercent: 28, estimatedTimeMin: 5, advice: "Recover and eat", targetHrZone: "Z1", targetHrBpm: "100-120" },
      { label: "Flat 2", startKm: 65, endKm: 100, targetPowerW: 240, targetPowerPercent: 85, estimatedTimeMin: 55, advice: "Maintain tempo", targetHrZone: "Z3", targetHrBpm: "145-155" },
    ],
  };

  it("finish time equals sum of segment times", () => {
    const result = recomputePlanTimes(basePlan, gpxData, 86, "road_race");
    const segSum = result.segments.reduce((s, seg) => s + seg.estimatedTimeMin, 0);
    expect(result.estimatedFinishTimeMin).toBe(segSum);
  });

  it("climb segment takes longer per km than flat", () => {
    const result = recomputePlanTimes(basePlan, gpxData, 86, "road_race");
    const flatPerKm = result.segments[0].estimatedTimeMin / 50;
    const climbPerKm = result.segments[1].estimatedTimeMin / 10;
    expect(climbPerKm).toBeGreaterThan(flatPerKm * 1.5);
  });

  it("descent segment is fast", () => {
    const result = recomputePlanTimes(basePlan, gpxData, 86, "road_race");
    expect(result.segments[2].estimatedTimeMin).toBeLessThan(7);
  });

  it("preserves non-time fields", () => {
    const result = recomputePlanTimes(basePlan, gpxData, 86, "road_race");
    expect(result.overallTargetNpW).toBe(240);
    expect(result.strategy).toBe("Even-paced effort with controlled climbing.");
    for (let i = 0; i < basePlan.segments.length; i++) {
      expect(result.segments[i].label).toBe(basePlan.segments[i].label);
      expect(result.segments[i].targetPowerW).toBe(basePlan.segments[i].targetPowerW);
      expect(result.segments[i].advice).toBe(basePlan.segments[i].advice);
      expect(result.segments[i].targetHrZone).toBe(basePlan.segments[i].targetHrZone);
    }
  });

  it("does not mutate the input plan", () => {
    const original = JSON.parse(JSON.stringify(basePlan));
    recomputePlanTimes(basePlan, gpxData, 86, "road_race");
    expect(basePlan).toEqual(original);
  });

  it("86kg rider at 252W on hilly 145km course produces realistic time", () => {
    const hillyGpx: GpxData = {
      points: [
        ...makePoints(0, 40, 100, 100, 80),
        ...makePoints(40, 55, 100, 650, 60),
        ...makePoints(55, 62, 650, 300, 28),
        ...makePoints(62, 90, 300, 300, 56),
        ...makePoints(90, 108, 300, 1100, 72),
        ...makePoints(108, 115, 1100, 700, 28),
        ...makePoints(115, 145, 700, 700, 60),
      ],
      segments: [
        { label: "Flat 1", startKm: 0, endKm: 40, distanceKm: 40, elevationGainM: 0, avgGradientPercent: 0, type: "flat" },
        { label: "Climb 1", startKm: 40, endKm: 55, distanceKm: 15, elevationGainM: 550, avgGradientPercent: 3.7, type: "climb" },
        { label: "Descent 1", startKm: 55, endKm: 62, distanceKm: 7, elevationGainM: 0, avgGradientPercent: 0, type: "descent" },
        { label: "Flat 2", startKm: 62, endKm: 90, distanceKm: 28, elevationGainM: 0, avgGradientPercent: 0, type: "flat" },
        { label: "Climb 2", startKm: 90, endKm: 108, distanceKm: 18, elevationGainM: 800, avgGradientPercent: 4.4, type: "climb" },
        { label: "Descent 2", startKm: 108, endKm: 115, distanceKm: 7, elevationGainM: 0, avgGradientPercent: 0, type: "descent" },
        { label: "Flat 3", startKm: 115, endKm: 145, distanceKm: 30, elevationGainM: 0, avgGradientPercent: 0, type: "flat" },
      ],
      totalDistanceKm: 145,
      totalElevationM: 1400,
    };

    const hillyPlan: PacingPlan = {
      overallTargetNpW: 252,
      estimatedFinishTimeMin: 248,
      strategy: "Test",
      segments: [
        { label: "Flat 1", startKm: 0, endKm: 40, targetPowerW: 240, targetPowerPercent: 85, estimatedTimeMin: 60, advice: "", targetHrZone: null, targetHrBpm: null },
        { label: "Climb 1", startKm: 40, endKm: 55, targetPowerW: 270, targetPowerPercent: 96, estimatedTimeMin: 35, advice: "", targetHrZone: null, targetHrBpm: null },
        { label: "Descent 1", startKm: 55, endKm: 62, targetPowerW: 80, targetPowerPercent: 28, estimatedTimeMin: 8, advice: "", targetHrZone: null, targetHrBpm: null },
        { label: "Flat 2", startKm: 62, endKm: 90, targetPowerW: 240, targetPowerPercent: 85, estimatedTimeMin: 50, advice: "", targetHrZone: null, targetHrBpm: null },
        { label: "Climb 2", startKm: 90, endKm: 108, targetPowerW: 270, targetPowerPercent: 96, estimatedTimeMin: 40, advice: "", targetHrZone: null, targetHrBpm: null },
        { label: "Descent 2", startKm: 108, endKm: 115, targetPowerW: 80, targetPowerPercent: 28, estimatedTimeMin: 7, advice: "", targetHrZone: null, targetHrBpm: null },
        { label: "Flat 3", startKm: 115, endKm: 145, targetPowerW: 240, targetPowerPercent: 85, estimatedTimeMin: 48, advice: "", targetHrZone: null, targetHrBpm: null },
      ],
    };

    const result = recomputePlanTimes(hillyPlan, hillyGpx, 86, "gran_fondo");
    // Expected ~270-330min (4h30-5h30) for 145km/1400m at these power targets
    expect(result.estimatedFinishTimeMin).toBeGreaterThan(260);
    expect(result.estimatedFinishTimeMin).toBeLessThan(360);
  });
});
