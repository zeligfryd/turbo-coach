import type { GpxPoint, GpxSegment, GpxData } from "@/lib/race/types";

// ── Haversine distance (km) ────────────────────────────────────────

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GPX XML parsing ────────────────────────────────────────────────

type RawPoint = { lat: number; lon: number; ele: number };

function extractTrackpoints(gpxText: string): RawPoint[] {
  const points: RawPoint[] = [];

  // Match <trkpt> elements with lat/lon attributes and <ele> children
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let match: RegExpExecArray | null;

  while ((match = trkptRegex.exec(gpxText)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const body = match[3];

    const eleMatch = body.match(/<ele>([^<]+)<\/ele>/i);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;

    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(ele)) {
      points.push({ lat, lon, ele });
    }
  }

  // Also support <rtept> (route points) if no trkpts found
  if (points.length === 0) {
    const rteptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/gi;
    while ((match = rteptRegex.exec(gpxText)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const body = match[3];

      const eleMatch = body.match(/<ele>([^<]+)<\/ele>/i);
      const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;

      if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(ele)) {
        points.push({ lat, lon, ele });
      }
    }
  }

  return points;
}

// ── Smoothing ──────────────────────────────────────────────────────

/** Simple moving-average elevation smoother to reduce GPS noise. */
function smoothElevation(points: RawPoint[], windowSize = 5): RawPoint[] {
  if (points.length <= windowSize) return points;
  const half = Math.floor(windowSize / 2);
  return points.map((p, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length, i + half + 1);
    const slice = points.slice(start, end);
    const avgEle = slice.reduce((s, pt) => s + pt.ele, 0) / slice.length;
    return { ...p, ele: avgEle };
  });
}

// ── Segment detection ──────────────────────────────────────────────

const MIN_CLIMB_DISTANCE_KM = 0.5;
const MIN_CLIMB_GRADIENT = 3; // %
const MIN_DESCENT_GRADIENT = -3; // %

type SegmentClass = "climb" | "descent" | "flat";

function classifyGradient(gradient: number): SegmentClass {
  if (gradient >= MIN_CLIMB_GRADIENT) return "climb";
  if (gradient <= MIN_DESCENT_GRADIENT) return "descent";
  return "flat";
}

function detectSegments(gpxPoints: GpxPoint[]): GpxSegment[] {
  if (gpxPoints.length < 2) return [];

  // Break into ~500m chunks and classify each
  const CHUNK_KM = 0.5;
  type Chunk = {
    startIdx: number;
    endIdx: number;
    startKm: number;
    endKm: number;
    eleGain: number;
    gradient: number;
    type: SegmentClass;
  };

  const chunks: Chunk[] = [];
  let chunkStartIdx = 0;

  for (let i = 1; i < gpxPoints.length; i++) {
    const distFromChunkStart =
      gpxPoints[i].distanceKm - gpxPoints[chunkStartIdx].distanceKm;

    if (distFromChunkStart >= CHUNK_KM || i === gpxPoints.length - 1) {
      const startKm = gpxPoints[chunkStartIdx].distanceKm;
      const endKm = gpxPoints[i].distanceKm;
      const dist = endKm - startKm;
      const eleChange = gpxPoints[i].ele - gpxPoints[chunkStartIdx].ele;
      const gradient = dist > 0.01 ? (eleChange / (dist * 1000)) * 100 : 0;
      const eleGain = eleChange > 0 ? eleChange : 0;

      chunks.push({
        startIdx: chunkStartIdx,
        endIdx: i,
        startKm,
        endKm,
        eleGain,
        gradient,
        type: classifyGradient(gradient),
      });
      chunkStartIdx = i;
    }
  }

  if (chunks.length === 0) return [];

  // Merge consecutive chunks of the same type
  type MergedChunk = {
    startKm: number;
    endKm: number;
    eleGain: number;
    type: SegmentClass;
  };

  const merged: MergedChunk[] = [
    {
      startKm: chunks[0].startKm,
      endKm: chunks[0].endKm,
      eleGain: chunks[0].eleGain,
      type: chunks[0].type,
    },
  ];

  for (let i = 1; i < chunks.length; i++) {
    const last = merged[merged.length - 1];
    if (chunks[i].type === last.type) {
      last.endKm = chunks[i].endKm;
      last.eleGain += chunks[i].eleGain;
    } else {
      merged.push({
        startKm: chunks[i].startKm,
        endKm: chunks[i].endKm,
        eleGain: chunks[i].eleGain,
        type: chunks[i].type,
      });
    }
  }

  // Absorb tiny segments (< 0.3 km) into neighbours
  const filtered = merged.filter((s) => s.endKm - s.startKm >= 0.3);
  if (filtered.length === 0) return [];

  // Build labelled segments
  let climbCount = 0;
  let flatCount = 0;
  let descentCount = 0;

  return filtered.map((seg) => {
    const distanceKm = Math.round((seg.endKm - seg.startKm) * 10) / 10;
    const elevationGainM = Math.round(seg.eleGain);
    const avgGradientPercent =
      distanceKm > 0.01
        ? Math.round((elevationGainM / (distanceKm * 1000)) * 100 * 10) / 10
        : 0;

    let label: string;
    if (seg.type === "climb") {
      climbCount++;
      label = `Climb ${climbCount} — km ${seg.startKm.toFixed(1)}, ${distanceKm}km at ${avgGradientPercent}%`;
    } else if (seg.type === "descent") {
      descentCount++;
      label = `Descent ${descentCount} — km ${seg.startKm.toFixed(1)}`;
    } else {
      flatCount++;
      label = `Flat ${flatCount} — km ${seg.startKm.toFixed(1)}`;
    }

    return {
      label,
      startKm: Math.round(seg.startKm * 10) / 10,
      endKm: Math.round(seg.endKm * 10) / 10,
      distanceKm,
      elevationGainM,
      avgGradientPercent: seg.type === "descent" ? avgGradientPercent : Math.abs(avgGradientPercent),
      type: seg.type,
    };
  });
}

// ── Public API ──────────────────────────────────────────────────────

export function parseGpx(gpxText: string): GpxData {
  const raw = extractTrackpoints(gpxText);

  if (raw.length < 2) {
    throw new Error("GPX file contains fewer than 2 trackpoints.");
  }

  const smoothed = smoothElevation(raw);

  // Build GpxPoint array with cumulative distance
  let cumDist = 0;
  const points: GpxPoint[] = smoothed.map((p, i) => {
    if (i > 0) {
      cumDist += haversineKm(
        smoothed[i - 1].lat,
        smoothed[i - 1].lon,
        p.lat,
        p.lon
      );
    }
    return {
      lat: p.lat,
      lon: p.lon,
      ele: Math.round(p.ele * 10) / 10,
      distanceKm: Math.round(cumDist * 1000) / 1000,
    };
  });

  const totalDistanceKm =
    Math.round(points[points.length - 1].distanceKm * 10) / 10;

  // Compute total elevation gain
  let totalElevationM = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i - 1].ele;
    if (diff > 0) totalElevationM += diff;
  }
  totalElevationM = Math.round(totalElevationM);

  // Downsample points for storage — keep ~500 points max
  const step = Math.max(1, Math.floor(points.length / 500));
  const downsampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const segments = detectSegments(points);

  return {
    points: downsampled,
    segments,
    totalDistanceKm,
    totalElevationM,
  };
}
