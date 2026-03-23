/**
 * Compute cycling performance metrics from raw stream data.
 * Replaces the need for intervals.icu API for Strava-sourced activities.
 */

// ── Normalized Power (NP) ────────────────────────────────────

/** 30-second rolling average of power, raised to the 4th power, averaged, then root-4. */
export function computeNormalizedPower(watts: number[]): number {
  if (watts.length < 30) return computeAvgPower(watts);
  const windowSize = 30;
  let windowSum = 0;
  for (let i = 0; i < windowSize; i++) windowSum += watts[i];

  let sum4th = 0;
  let count = 0;

  for (let i = windowSize; i <= watts.length; i++) {
    const avg = windowSum / windowSize;
    sum4th += avg ** 4;
    count++;
    if (i < watts.length) {
      windowSum += watts[i] - watts[i - windowSize];
    }
  }

  return Math.round(Math.pow(sum4th / count, 0.25));
}

// ── Average Power ────────────────────────────────────────────

export function computeAvgPower(watts: number[]): number {
  if (watts.length === 0) return 0;
  const sum = watts.reduce((a, b) => a + Math.max(0, b), 0);
  return Math.round(sum / watts.length);
}

// ── IF, TSS, VI ──────────────────────────────────────────────

export function computeIntensityFactor(np: number, ftp: number): number {
  return ftp > 0 ? np / ftp : 0;
}

export function computeTSS(
  durationSeconds: number,
  np: number,
  ftp: number
): number {
  if (ftp <= 0) return 0;
  const ifactor = np / ftp;
  return Math.round((durationSeconds * ifactor * ifactor * 100) / 3600);
}

export function computeVariabilityIndex(np: number, avgPower: number): number {
  return avgPower > 0 ? np / avgPower : 0;
}

// ── Power Curve ──────────────────────────────────────────────

/** Compute best average power for a set of key durations. */
export function computePowerCurve(
  watts: number[],
  durations?: number[]
): Array<{ secs: number; watts: number }> {
  const targetDurations =
    durations ??
    [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420,
     480, 600, 720, 900, 1200, 1500, 1800, 2400, 3600, 5400, 7200].filter(
      (d) => d <= watts.length
    );

  const result: Array<{ secs: number; watts: number }> = [];

  for (const duration of targetDurations) {
    if (duration > watts.length) break;

    let windowSum = 0;
    for (let i = 0; i < duration; i++) windowSum += watts[i];
    let bestAvg = windowSum / duration;

    for (let i = duration; i < watts.length; i++) {
      windowSum += watts[i] - watts[i - duration];
      const avg = windowSum / duration;
      if (avg > bestAvg) bestAvg = avg;
    }

    result.push({ secs: duration, watts: Math.round(bestAvg) });
  }

  return result;
}

// ── Time in Zones ────────────────────────────────────────────

export type ZoneDistribution = {
  zone: number;
  name: string;
  seconds: number;
  pct: number;
};

const ZONE_BOUNDS = [
  { zone: 1, name: "Z1 Recovery", maxPct: 55 },
  { zone: 2, name: "Z2 Endurance", maxPct: 75 },
  { zone: 3, name: "Z3 Tempo", maxPct: 90 },
  { zone: 4, name: "Z4 Threshold", maxPct: 105 },
  { zone: 5, name: "Z5 VO2max", maxPct: 120 },
  { zone: 6, name: "Z6 Anaerobic", maxPct: 150 },
  { zone: 7, name: "Z7 Neuromuscular", maxPct: Infinity },
];

export function computeTimeInZones(
  watts: number[],
  ftp: number
): ZoneDistribution[] {
  const counts = new Array(7).fill(0);
  let total = 0;

  for (const w of watts) {
    if (w <= 0) continue;
    total++;
    const pct = (w / ftp) * 100;
    const idx = ZONE_BOUNDS.findIndex((z) => pct <= z.maxPct);
    counts[idx >= 0 ? idx : 6]++;
  }

  return ZONE_BOUNDS.map((z, i) => ({
    zone: z.zone,
    name: z.name,
    seconds: counts[i],
    pct: total > 0 ? (counts[i] / total) * 100 : 0,
  }));
}

// ── TRIMP (Training Impulse) ─────────────────────────────────

/** Banister's TRIMP using HR reserve. Assumes male coefficient. */
export function computeTrimp(
  heartrate: number[],
  restingHr = 50,
  maxHr = 190
): number {
  if (heartrate.length === 0 || maxHr <= restingHr) return 0;
  const hrReserve = maxHr - restingHr;

  let trimp = 0;
  for (const hr of heartrate) {
    if (hr <= 0) continue;
    const hrr = (hr - restingHr) / hrReserve;
    // Clamp to [0, 1]
    const hrrClamped = Math.max(0, Math.min(1, hrr));
    // Male coefficient: 1.92
    trimp += hrrClamped * Math.exp(1.92 * hrrClamped);
  }
  // Scale to minutes (1 sample = 1 second)
  return Math.round(trimp / 60);
}

// ── Decoupling ───────────────────────────────────────────────

/** Aerobic decoupling: compare power/HR ratio in 1st half vs 2nd half. */
export function computeDecoupling(
  watts: number[],
  heartrate: number[]
): number | null {
  if (watts.length < 60 || heartrate.length < 60) return null;
  const len = Math.min(watts.length, heartrate.length);
  const half = Math.floor(len / 2);

  const ratio = (pw: number[], hr: number[]) => {
    let sumP = 0, sumH = 0, count = 0;
    for (let i = 0; i < pw.length; i++) {
      if (pw[i] > 0 && hr[i] > 0) {
        sumP += pw[i];
        sumH += hr[i];
        count++;
      }
    }
    if (count === 0 || sumH === 0) return 0;
    return (sumP / count) / (sumH / count);
  };

  const r1 = ratio(watts.slice(0, half), heartrate.slice(0, half));
  const r2 = ratio(watts.slice(half, len), heartrate.slice(half, len));

  if (r1 === 0) return null;
  return ((r1 - r2) / r1) * 100;
}

// ── Efficiency Factor ────────────────────────────────────────

export function computeEfficiencyFactor(
  np: number,
  avgHr: number
): number | null {
  if (avgHr <= 0) return null;
  return np / avgHr;
}

// ── Power/HR Ratio ───────────────────────────────────────────

export function computePowerHr(
  avgPower: number,
  avgHr: number
): number | null {
  if (avgHr <= 0) return null;
  return avgPower / avgHr;
}

// ── Zone-based Interval Detection ────────────────────────────

export type DetectedInterval = {
  type: "WORK" | "REST";
  label: string;
  startIndex: number;
  endIndex: number;
  elapsedTime: number;
  avgWatts: number;
  maxWatts: number;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  zone: number | null;
  intensity: number | null; // ratio to FTP
};

/**
 * Zone-based interval detection:
 * 1. Classify each second into a power zone (10s smoothing)
 * 2. Group consecutive seconds in the same zone
 * 3. Absorb short segments (<30s) into the neighbor with the closest zone
 * 4. Merge adjacent same-zone segments
 */
export function detectIntervals(
  watts: number[],
  heartrate: number[] | null,
  cadence: number[] | null,
  ftp: number | null,
  minIntervalSeconds = 30
): DetectedInterval[] {
  if (watts.length < minIntervalSeconds || !ftp) return [];

  // Smooth with 10s window — enough to filter noise, short enough to catch 30s efforts
  const smoothed = rollingAvg(watts, 10);

  // Classify each second into a zone
  const perSecondZones = smoothed.map((w) => getZone(w, ftp));

  // Group consecutive seconds in the same zone
  type RawSegment = { zone: number; start: number; end: number };
  const segments: RawSegment[] = [];
  let segStart = 0;
  let segZone = perSecondZones[0];

  for (let i = 1; i <= perSecondZones.length; i++) {
    if (i === perSecondZones.length || perSecondZones[i] !== segZone) {
      segments.push({ zone: segZone, start: segStart, end: i });
      if (i < perSecondZones.length) {
        segStart = i;
        segZone = perSecondZones[i];
      }
    }
  }

  // Absorb short segments into the neighbor with the closest zone.
  // Repeat until no short segments remain.
  let merged = segments;
  let changed = true;
  while (changed) {
    changed = false;
    const next: RawSegment[] = [];
    for (let i = 0; i < merged.length; i++) {
      const seg = merged[i];
      const dur = seg.end - seg.start;
      if (dur < minIntervalSeconds && merged.length > 1) {
        const prev = next.length > 0 ? next[next.length - 1] : null;
        const nxt = i + 1 < merged.length ? merged[i + 1] : null;
        const prevDist = prev ? Math.abs(prev.zone - seg.zone) : Infinity;
        const nxtDist = nxt ? Math.abs(nxt.zone - seg.zone) : Infinity;

        if (prev && prevDist <= nxtDist) {
          prev.end = seg.end;
        } else if (nxt) {
          nxt.start = seg.start;
        } else if (prev) {
          prev.end = seg.end;
        } else {
          next.push(seg);
        }
        changed = true;
      } else {
        next.push(seg);
      }
    }
    merged = next;
  }

  // Merge adjacent same-zone segments
  const consolidated: RawSegment[] = [];
  for (const seg of merged) {
    const prev = consolidated.length > 0 ? consolidated[consolidated.length - 1] : null;
    if (prev && prev.zone === seg.zone) {
      prev.end = seg.end;
    } else {
      consolidated.push({ ...seg });
    }
  }

  // Compute the actual zone from raw average power for each segment,
  // then merge adjacent segments that land in the same final zone.
  const withZones = consolidated.map((seg) => {
    const avgW = computeAvgPower(watts.slice(seg.start, seg.end));
    return { ...seg, finalZone: getZone(avgW, ftp) };
  });

  const finalSegments: (RawSegment & { finalZone: number })[] = [];
  for (const seg of withZones) {
    const prev = finalSegments.length > 0 ? finalSegments[finalSegments.length - 1] : null;
    if (prev && prev.finalZone === seg.finalZone) {
      prev.end = seg.end;
    } else {
      finalSegments.push({ ...seg });
    }
  }

  // Build final intervals with computed metrics
  const intervals: DetectedInterval[] = [];
  let workCount = 0;
  let restCount = 0;

  for (const seg of finalSegments) {
    const segWatts = watts.slice(seg.start, seg.end);
    const segHr = heartrate?.slice(seg.start, seg.end) ?? null;
    const segCad = cadence?.slice(seg.start, seg.end) ?? null;

    const avgW = computeAvgPower(segWatts);
    const maxW = Math.max(...segWatts);
    const avgH = segHr ? avg(segHr.filter((h) => h > 0)) : null;
    const maxH = segHr ? Math.max(...segHr.filter((h) => h > 0), 0) : null;
    const avgC = segCad ? avg(segCad.filter((c) => c > 0)) : null;
    const zone = getZone(avgW, ftp);
    const isWork = zone >= 3;
    const intensity = ftp > 0 ? avgW / ftp : null;

    if (isWork) workCount++;
    else restCount++;

    intervals.push({
      type: isWork ? "WORK" : "REST",
      label: isWork ? `Work ${workCount}` : `Recovery ${restCount}`,
      startIndex: seg.start,
      endIndex: seg.end,
      elapsedTime: seg.end - seg.start,
      avgWatts: avgW,
      maxWatts: maxW,
      avgHr: avgH ? Math.round(avgH) : null,
      maxHr: maxH && maxH > 0 ? Math.round(maxH) : null,
      avgCadence: avgC ? Math.round(avgC) : null,
      zone,
      intensity: intensity ? Number(intensity.toFixed(2)) : null,
    });
  }

  return intervals;
}

// ── W'bal (simplified Skiba model) ───────────────────────────

/** Compute W'bal stream using the differential model. */
export function computeWbal(
  watts: number[],
  cp: number, // Critical power (≈ FTP)
  wPrime: number // W' in joules (typically 15000-25000)
): number[] {
  const wbal = new Array<number>(watts.length);
  wbal[0] = wPrime;

  for (let i = 1; i < watts.length; i++) {
    const power = watts[i];
    if (power > cp) {
      // Depletion
      wbal[i] = wbal[i - 1] - (power - cp);
    } else {
      // Recovery (tau model)
      const tau = 546 * Math.exp(-0.01 * (cp - power)) + 316;
      wbal[i] = wPrime - (wPrime - wbal[i - 1]) * Math.exp(-1 / tau);
    }
    // Clamp to 0
    if (wbal[i] < 0) wbal[i] = 0;
  }

  return wbal;
}

// ── Helpers ──────────────────────────────────────────────────

function rollingAvg(data: number[], window: number): number[] {
  const result = new Array<number>(data.length);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= window) sum -= data[i - window];
    const count = Math.min(i + 1, window);
    result[i] = sum / count;
  }
  return result;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getZone(watts: number, ftp: number): number {
  const pct = (watts / ftp) * 100;
  if (pct <= 55) return 1;
  if (pct <= 75) return 2;
  if (pct <= 90) return 3;
  if (pct <= 105) return 4;
  if (pct <= 120) return 5;
  if (pct <= 150) return 6;
  return 7;
}

// ── All-in-one computation ───────────────────────────────────

export type ComputedActivityMetrics = {
  normalizedPower: number;
  avgPower: number;
  maxPower: number;
  intensityFactor: number | null;
  tss: number | null;
  variabilityIndex: number;
  trimp: number | null;
  decoupling: number | null;
  efficiencyFactor: number | null;
  powerHr: number | null;
  powerCurve: Array<{ secs: number; watts: number }>;
  wbal: number[] | null;
  wbalMaxDepletion: number | null;
  intervals: DetectedInterval[];
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
};

export function computeAllMetrics(
  watts: number[],
  heartrate: number[] | null,
  cadence: number[] | null,
  ftp: number | null,
  durationSeconds: number
): ComputedActivityMetrics {
  const np = computeNormalizedPower(watts);
  const ap = computeAvgPower(watts);
  const maxP = watts.length > 0 ? Math.max(...watts) : 0;
  const ifactor = ftp ? computeIntensityFactor(np, ftp) : null;
  const tss = ftp ? computeTSS(durationSeconds, np, ftp) : null;
  const vi = computeVariabilityIndex(np, ap);

  const avgHr = heartrate ? Math.round(avg(heartrate.filter((h) => h > 0))) : null;
  const maxHr = heartrate ? Math.max(...heartrate.filter((h) => h > 0), 0) : null;
  const avgCad = cadence ? Math.round(avg(cadence.filter((c) => c > 0))) : null;

  const trimp = heartrate ? computeTrimp(heartrate) : null;
  const decoupling = heartrate ? computeDecoupling(watts, heartrate) : null;
  const ef = avgHr ? computeEfficiencyFactor(np, avgHr) : null;
  const phr = avgHr && ap > 0 ? computePowerHr(ap, avgHr) : null;

  const powerCurve = computePowerCurve(watts);
  const intervals = detectIntervals(watts, heartrate, cadence, ftp);

  let wbal: number[] | null = null;
  let wbalMaxDepletion: number | null = null;
  if (ftp && ftp > 0) {
    const wPrime = 20000; // Default W' estimate
    wbal = computeWbal(watts, ftp, wPrime);
    wbalMaxDepletion = wPrime - Math.min(...wbal);
  }

  return {
    normalizedPower: np,
    avgPower: ap,
    maxPower: maxP,
    intensityFactor: ifactor ? Number(ifactor.toFixed(2)) : null,
    tss,
    variabilityIndex: Number(vi.toFixed(2)),
    trimp,
    decoupling: decoupling != null ? Number(decoupling.toFixed(1)) : null,
    efficiencyFactor: ef ? Number(ef.toFixed(2)) : null,
    powerHr: phr ? Number(phr.toFixed(2)) : null,
    powerCurve,
    wbal,
    wbalMaxDepletion: wbalMaxDepletion ? Math.round(wbalMaxDepletion) : null,
    intervals,
    avgHr,
    maxHr: maxHr && maxHr > 0 ? maxHr : null,
    avgCadence: avgCad,
  };
}
