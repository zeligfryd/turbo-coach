import type { RideMetrics, RideSample } from "@/lib/ride/types";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getRollingAveragePower(samples: RideSample[], windowSize: number): number | null {
  const powerValues = samples
    .slice(-windowSize)
    .map((s) => s.powerWatts)
    .filter((v): v is number => typeof v === "number");
  if (powerValues.length === 0) return null;
  return Math.round(average(powerValues));
}

function computeNormalizedPower(samples: RideSample[]): number | null {
  const power = samples.map((s) => s.powerWatts ?? 0);
  if (power.length < 30) {
    return null;
  }

  const rolling30s: number[] = [];
  for (let i = 29; i < power.length; i += 1) {
    rolling30s.push(average(power.slice(i - 29, i + 1)));
  }
  if (rolling30s.length === 0) return null;

  const fourth = rolling30s.map((v) => Math.pow(v, 4));
  const meanFourth = average(fourth);
  return Math.round(Math.pow(meanFourth, 0.25));
}

export function computeRideMetrics(samples: RideSample[], ftpWatts: number): RideMetrics {
  const elapsedSeconds = samples.length > 0 ? samples[samples.length - 1].elapsedSeconds : 0;
  const powerValues = samples
    .map((s) => s.powerWatts)
    .filter((v): v is number => typeof v === "number");
  const cadenceValues = samples
    .map((s) => s.cadenceRpm)
    .filter((v): v is number => typeof v === "number");

  const avgPower = powerValues.length > 0 ? Math.round(average(powerValues)) : 0;
  const normalizedPower = computeNormalizedPower(samples);
  const intensityFactor =
    normalizedPower !== null && ftpWatts > 0 ? normalizedPower / ftpWatts : null;
  const tss =
    intensityFactor !== null
      ? Math.round(((elapsedSeconds * normalizedPower! * intensityFactor) / (ftpWatts * 3600)) * 100)
      : 0;

  return {
    elapsedSeconds,
    intervalElapsedSeconds: 0,
    avgPowerWatts: avgPower,
    normalizedPowerWatts: normalizedPower,
    intensityFactor,
    tss,
    avgCadenceRpm: cadenceValues.length > 0 ? Math.round(average(cadenceValues)) : null,
    maxPowerWatts: powerValues.length > 0 ? Math.max(...powerValues) : 0,
    maxCadenceRpm: cadenceValues.length > 0 ? Math.max(...cadenceValues) : 0,
    distanceMeters: samples[samples.length - 1]?.distanceMeters ?? null,
  };
}
