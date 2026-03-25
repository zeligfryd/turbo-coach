/**
 * Helpers and pre-built GPX XML strings for parser tests.
 */

/** Build a minimal valid GPX XML string from an array of lat/lon/ele points. */
export function buildGpxString(
  points: Array<{ lat: number; lon: number; ele: number }>
): string {
  const trkpts = points
    .map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`)
    .join("\n");
  return `<?xml version="1.0"?>\n<gpx><trk><trkseg>\n${trkpts}\n</trkseg></trk></gpx>`;
}

/** Build GPX using <rtept> instead of <trkpt> (route points). */
export function buildRteptGpxString(
  points: Array<{ lat: number; lon: number; ele: number }>
): string {
  const rtepts = points
    .map((p) => `<rtept lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></rtept>`)
    .join("\n");
  return `<?xml version="1.0"?>\n<gpx><rte>\n${rtepts}\n</rte></gpx>`;
}

/**
 * Generate evenly spaced points along a north-south line.
 * Each point is ~111m apart (0.001 degrees latitude ≈ 111m).
 */
function generateLine(
  count: number,
  options: {
    startLat?: number;
    startLon?: number;
    startEle?: number;
    elePerStep?: number;
    latStepDeg?: number;
  } = {}
): Array<{ lat: number; lon: number; ele: number }> {
  const {
    startLat = 45.0,
    startLon = 7.0,
    startEle = 200,
    elePerStep = 0,
    latStepDeg = 0.001, // ~111m per step
  } = options;

  return Array.from({ length: count }, (_, i) => ({
    lat: startLat + i * latStepDeg,
    lon: startLon,
    ele: startEle + i * elePerStep,
  }));
}

// ── Flat route: 100 points at constant elevation ─────────────
// ~11.1km, 0m elevation gain, all flat segments
export const FLAT_ROUTE_GPX = buildGpxString(
  generateLine(100, { startEle: 200, elePerStep: 0 })
);

// ── Single climb: 60 points going from 200m to 500m ─────────
// ~6.6km, ~300m elevation, one climb segment
export const SINGLE_CLIMB_GPX = buildGpxString(
  generateLine(60, { startEle: 200, elePerStep: 5 })
);

// ── Climb + descent: 80 points, first half up, second half down
// ~8.9km total, climb then descent
export const CLIMB_DESCENT_GPX = buildGpxString([
  ...generateLine(40, { startEle: 200, elePerStep: 8 }),
  ...generateLine(40, {
    startLat: 45.0 + 40 * 0.001,
    startEle: 200 + 39 * 8,
    elePerStep: -8,
  }),
]);

// ── Minimum valid GPX: exactly 2 points ──────────────────────
export const MINIMUM_GPX = buildGpxString([
  { lat: 45.0, lon: 7.0, ele: 200 },
  { lat: 45.001, lon: 7.0, ele: 210 },
]);

// ── Single point (should throw) ─────────────────────────────
export const SINGLE_POINT_GPX = buildGpxString([
  { lat: 45.0, lon: 7.0, ele: 200 },
]);

// ── Empty GPX (no trackpoints, should throw) ─────────────────
export const EMPTY_GPX = `<?xml version="1.0"?>\n<gpx><trk><trkseg></trkseg></trk></gpx>`;

// ── Route points (rtept) instead of track points ─────────────
export const RTEPT_GPX = buildRteptGpxString(
  generateLine(50, { startEle: 100, elePerStep: 3 })
);

// ── GPS spike: one point with elevation 9999 surrounded by 100
// The moving-average smoother should reduce the spike
export const GPS_SPIKE_GPX = buildGpxString(
  generateLine(50, { startEle: 100, elePerStep: 0 }).map((p, i) =>
    i === 25 ? { ...p, ele: 9999 } : p
  )
);
