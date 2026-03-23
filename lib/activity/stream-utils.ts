/** Rolling average smoothing. */
export function smoothStream(data: number[], windowSize: number): number[] {
  if (windowSize <= 1 || data.length === 0) return data;
  const half = Math.floor(windowSize / 2);
  const result = new Array<number>(data.length);
  let sum = 0;
  let count = 0;

  // Initialize window
  for (let i = 0; i < Math.min(half + 1, data.length); i++) {
    if (data[i] != null && !isNaN(data[i])) {
      sum += data[i];
      count++;
    }
  }

  for (let i = 0; i < data.length; i++) {
    // Add right edge
    const addIdx = i + half;
    if (addIdx < data.length && addIdx > half) {
      const v = data[addIdx];
      if (v != null && !isNaN(v)) {
        sum += v;
        count++;
      }
    }
    // Remove left edge
    const removeIdx = i - half - 1;
    if (removeIdx >= 0) {
      const v = data[removeIdx];
      if (v != null && !isNaN(v)) {
        sum -= v;
        count--;
      }
    }
    result[i] = count > 0 ? sum / count : 0;
  }

  return result;
}

/**
 * Downsample stream data using nth-point sampling.
 * Keeps first and last points. Targets maxPoints output size.
 */
export function downsampleStream(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;
  const step = (data.length - 1) / (maxPoints - 1);
  const result: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(data[idx]);
  }
  return result;
}

/**
 * Downsample an array of objects by selecting evenly spaced entries.
 */
export function downsamplePoints<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = (data.length - 1) / (maxPoints - 1);
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(data[idx]);
  }
  return result;
}

/** Format seconds as "Xh Ym" or "Ym Zs". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Format seconds as "H:MM:SS". */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Power zone boundaries as % of FTP. */
const ZONE_THRESHOLDS = [
  { zone: 1, name: "Z1 Recovery", max: 55, color: "#9ca3af" },
  { zone: 2, name: "Z2 Endurance", max: 75, color: "#3b82f6" },
  { zone: 3, name: "Z3 Tempo", max: 90, color: "#22c55e" },
  { zone: 4, name: "Z4 Threshold", max: 105, color: "#eab308" },
  { zone: 5, name: "Z5 VO2max", max: 120, color: "#f97316" },
  { zone: 6, name: "Z6 Anaerobic", max: 150, color: "#ef4444" },
  { zone: 7, name: "Z7 Neuromuscular", max: Infinity, color: "#a855f7" },
];

export function getZoneForPower(watts: number, ftp: number) {
  const pct = (watts / ftp) * 100;
  return ZONE_THRESHOLDS.find((z) => pct <= z.max) ?? ZONE_THRESHOLDS[6];
}

export function getZoneColor(zone: number): string {
  return ZONE_THRESHOLDS[Math.min(zone - 1, 6)]?.color ?? "#9ca3af";
}

export { ZONE_THRESHOLDS };
