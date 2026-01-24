import type { WorkoutInterval } from "./types";
import { getZoneForIntensity, isRampInterval, getIntervalAverageIntensity, POWER_ZONES } from "./utils";

export type ChartElement = {
  type: "rect" | "polygon";
  color: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: string;
  interval: WorkoutInterval;
  intervalIndex: number;
};

export interface ChartDimensions {
  width: number;
  height: number;
  plotArea: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface CalculateChartElementsOptions {
  useAbsolutePower?: boolean;
  ftpWatts?: number;
}

/**
 * Calculate chart elements (rectangles and polygons) for workout intervals
 * This shared function is used by both mini and full charts
 */
export function calculateChartElements(
  intervals: WorkoutInterval[],
  dimensions: ChartDimensions,
  options: CalculateChartElementsOptions = {}
): ChartElement[] {
  if (intervals.length === 0) return [];

  const totalDuration = intervals.reduce((sum, i) => sum + i.durationSeconds, 0);
  if (totalDuration === 0) return [];

  const { plotArea } = dimensions;
  const { useAbsolutePower = false, ftpWatts = 250 } = options;

  // Calculate intensity range
  let minIntensity: number;
  let maxIntensity: number;
  let intensityRange: number;

  if (useAbsolutePower) {
    // For full chart: use absolute power scale from 0 to max
    const allPowers = intervals.flatMap((i) => {
      const start = (i.intensityPercentStart / 100) * ftpWatts;
      const values = [start];
      if (i.intensityPercentEnd !== undefined) {
        values.push((i.intensityPercentEnd / 100) * ftpWatts);
      }
      return values;
    });
    minIntensity = 0;
    maxIntensity = Math.max(...allPowers);
    intensityRange = maxIntensity;
  } else {
    // For mini chart: normalize to min-max range for better visualization
    const allIntensities = intervals.flatMap((i) => {
      const values = [i.intensityPercentStart];
      if (i.intensityPercentEnd !== undefined) {
        values.push(i.intensityPercentEnd);
      }
      return values;
    });
    minIntensity = Math.min(...allIntensities);
    maxIntensity = Math.max(...allIntensities);
    intensityRange = maxIntensity - minIntensity || 1;
  }

  /**
   * Convert intensity to height in pixels
   */
  const intensityToHeight = (intensity: number): number => {
    if (useAbsolutePower) {
      const power = (intensity / 100) * ftpWatts;
      return (power / intensityRange) * plotArea.height;
    } else {
      const normalized = (intensity - minIntensity) / intensityRange;
      return Math.max(2, normalized * plotArea.height * 0.8 + plotArea.height * 0.2);
    }
  };

  /**
   * Convert time to x coordinate
   */
  const timeToX = (time: number): number => {
    return plotArea.left + (time / totalDuration) * plotArea.width;
  };

  /**
   * Convert height to y coordinate (inverted for SVG)
   */
  const heightToY = (height: number): number => {
    return plotArea.top + plotArea.height - height;
  };

  // Generate chart elements
  const elements: ChartElement[] = [];
  let currentTime = 0;

  intervals.forEach((interval, index) => {
    const avgIntensity = getIntervalAverageIntensity(interval);
    const zone = getZoneForIntensity(avgIntensity);
    const zoneColor = POWER_ZONES[zone].color;

    const intervalWidth = (interval.durationSeconds / totalDuration) * plotArea.width;
    const x = timeToX(currentTime);
    const isRamp = isRampInterval(interval);

    if (isRamp) {
      // For ramps, draw a polygon with slanted top
      const startHeight = intensityToHeight(interval.intensityPercentStart);
      const endHeight = intensityToHeight(interval.intensityPercentEnd!);
      const yStart = heightToY(startHeight);
      const yEnd = heightToY(endHeight);
      const yBottom = plotArea.top + plotArea.height;

      // Polygon points: bottom-left, top-left, top-right, bottom-right
      const points = [
        `${x},${yBottom}`,
        `${x},${yStart}`,
        `${x + intervalWidth},${yEnd}`,
        `${x + intervalWidth},${yBottom}`,
      ].join(" ");

      elements.push({
        type: "polygon",
        color: zoneColor,
        points,
        interval,
        intervalIndex: index,
      });
    } else {
      // For constant intervals, draw a rectangle
      const barHeight = intensityToHeight(interval.intensityPercentStart);
      const y = heightToY(barHeight);

      elements.push({
        type: "rect",
        x,
        y,
        width: intervalWidth,
        height: barHeight,
        color: zoneColor,
        interval,
        intervalIndex: index,
      });
    }

    currentTime += interval.durationSeconds;
  });

  return elements;
}
