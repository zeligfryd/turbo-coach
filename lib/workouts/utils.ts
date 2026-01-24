import type { WorkoutInterval } from "./types";

/**
 * Power zones based on % FTP
 */
export const POWER_ZONES = {
  Z1: { min: 0, max: 55, color: "#94a3b8", name: "Z1 - Active Recovery" },
  Z2: { min: 56, max: 75, color: "#10b981", name: "Z2 - Endurance" },
  Z3: { min: 76, max: 90, color: "#f59e0b", name: "Z3 - Tempo" },
  Z4: { min: 91, max: 105, color: "#ef4444", name: "Z4 - Threshold" },
  Z5: { min: 106, max: 120, color: "#dc2626", name: "Z5 - VO2 Max" },
  Z6: { min: 121, max: 150, color: "#991b1b", name: "Z6 - Anaerobic" },
  Z7: { min: 151, max: 200, color: "#7f1d1d", name: "Z7 - Neuromuscular" },
};

export function getZoneForIntensity(intensityPercent: number): keyof typeof POWER_ZONES {
  if (intensityPercent <= 55) return "Z1";
  if (intensityPercent <= 75) return "Z2";
  if (intensityPercent <= 90) return "Z3";
  if (intensityPercent <= 105) return "Z4";
  if (intensityPercent <= 120) return "Z5";
  if (intensityPercent <= 150) return "Z6";
  return "Z7";
}

/**
 * Check if an interval is a ramp (has different start and end intensities)
 */
export function isRampInterval(interval: WorkoutInterval): boolean {
  return interval.intensityPercentEnd !== undefined &&
    interval.intensityPercentEnd !== interval.intensityPercentStart;
}

/**
 * Get intensity at a specific time point within an interval
 * @param interval The workout interval
 * @param elapsedSeconds Time elapsed within the interval (0 to durationSeconds)
 * @returns Intensity percent at that time point
 */
export function getIntervalIntensityAtTime(interval: WorkoutInterval, elapsedSeconds: number): number {
  if (!isRampInterval(interval)) {
    return interval.intensityPercentStart;
  }

  // Linear interpolation for ramps
  const progress = Math.min(1, Math.max(0, elapsedSeconds / interval.durationSeconds));
  const intensityEnd = interval.intensityPercentEnd!;
  return interval.intensityPercentStart + (intensityEnd - interval.intensityPercentStart) * progress;
}

/**
 * Get average intensity for an interval (accounts for ramps)
 */
export function getIntervalAverageIntensity(interval: WorkoutInterval): number {
  if (isRampInterval(interval)) {
    return (interval.intensityPercentStart + interval.intensityPercentEnd!) / 2;
  }
  return interval.intensityPercentStart;
}

/**
 * Calculate time spent in each zone
 * Note: For ramp intervals, this uses the average intensity to determine the zone.
 * This is a simplification - a more accurate calculation would split ramps that cross zone boundaries.
 */
export function calculateZoneTime(intervals: WorkoutInterval[]) {
  const zoneTime: Record<string, number> = {};

  intervals.forEach((interval) => {
    const avgIntensity = getIntervalAverageIntensity(interval);
    const zone = getZoneForIntensity(avgIntensity);
    zoneTime[zone] = (zoneTime[zone] || 0) + interval.durationSeconds;
  });

  return zoneTime;
}

/**
 * Calculate total duration in seconds
 */
export function calculateTotalDuration(intervals: WorkoutInterval[]): number {
  return intervals.reduce((sum, interval) => sum + interval.durationSeconds, 0);
}

/**
 * Format duration in minutes to HH:MM format
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
  }
  return `${mins}m`;
}

/**
 * Format duration in seconds to MM:SS format
 */
export function formatDurationSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Calculate average intensity across intervals (handles both constant and ramp intervals)
 */
export function calculateAverageIntensity(intervals: WorkoutInterval[]): number {
  if (intervals.length === 0) return 0;

  let totalWeightedIntensity = 0;
  let totalDuration = 0;

  intervals.forEach((interval) => {
    const avgIntensity = getIntervalAverageIntensity(interval);
    totalWeightedIntensity += avgIntensity * interval.durationSeconds;
    totalDuration += interval.durationSeconds;
  });

  return totalDuration > 0 ? Math.round(totalWeightedIntensity / totalDuration) : 0;
}

// Stub functions for future implementation
export function calculateTSS(_intervals: WorkoutInterval[], _ftpWatts: number): null {
  return null; // Coming soon
}

export function calculateNormalizedPower(_intervals: WorkoutInterval[], _ftpWatts: number): null {
  return null; // Coming soon
}

export function calculateAveragePower(_intervals: WorkoutInterval[], _ftpWatts: number): null {
  return null; // Coming soon
}

export function calculateWork(_intervals: WorkoutInterval[], _ftpWatts: number): null {
  return null; // Coming soon
}
