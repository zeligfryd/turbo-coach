import type { WorkoutInterval } from "./types";
import { getZoneForIntensity, isRampInterval, isFreeRideInterval, getIntervalAverageIntensity, POWER_ZONES, DEFAULT_FTP_WATTS } from "./utils";

export type ChartElement = {
  type: "rect" | "polygon" | "path";
  color: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: string;
  path?: string;
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
 * Generate a wavy area path for free ride intervals
 * Creates a filled polygon with sine wave on top
 * Rounds coordinates to 2 decimal places for consistency between SSR and client
 */
function generateWavyPath(
  startX: number,
  y: number,
  width: number,
  yBottom: number,
  amplitude: number = 8,
  frequency: number = 0.05
): string {
  const points: string[] = [];
  const steps = Math.max(50, Math.floor(width / 5)); // At least 50 points

  // Helper to round to 2 decimal places for consistent SSR/client rendering
  const round = (n: number) => Math.round(n * 100) / 100;

  // Draw the wavy top edge from left to right
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const x = round(startX + progress * width);
    const waveY = round(y + Math.sin(progress * width * frequency) * amplitude);

    if (i === 0) {
      points.push(`M ${x},${waveY}`);
    } else {
      points.push(`L ${x},${waveY}`);
    }
  }

  // Close the path by drawing the bottom edge and back to start
  points.push(`L ${round(startX + width)},${round(yBottom)}`);
  points.push(`L ${round(startX)},${round(yBottom)}`);
  points.push(`Z`); // Close path

  return points.join(" ");
}

/**
 * Split a ramp interval into segments at zone boundaries
 * Returns array of segments with their zone colors and time positions
 */
function splitRampIntoZoneSegments(
  startIntensity: number,
  endIntensity: number,
  intervalDuration: number
): Array<{
  startIntensity: number;
  endIntensity: number;
  startTime: number;
  endTime: number;
  zone: keyof typeof POWER_ZONES;
}> {
  // Determine direction (ascending or descending)
  const isAscending = endIntensity > startIntensity;
  const intensityRange = endIntensity - startIntensity;

  // Get all zone boundaries between start and end
  const zoneBoundaries = [55, 75, 90, 105, 120, 150];
  const crossedBoundaries = zoneBoundaries.filter((boundary) => {
    return isAscending
      ? boundary > startIntensity && boundary < endIntensity
      : boundary < startIntensity && boundary > endIntensity;
  });

  // Sort boundaries based on direction
  if (!isAscending) {
    crossedBoundaries.sort((a, b) => b - a);
  }

  // Build segments
  const segments = [];
  let currentIntensity = startIntensity;
  let currentTime = 0;

  for (const boundary of crossedBoundaries) {
    // Calculate time when boundary is crossed using linear interpolation
    const intensityDelta = boundary - startIntensity;
    const timeFraction = intensityDelta / intensityRange;
    const boundaryTime = timeFraction * intervalDuration;

    segments.push({
      startIntensity: currentIntensity,
      endIntensity: boundary,
      startTime: currentTime,
      endTime: boundaryTime,
      zone: getZoneForIntensity((currentIntensity + boundary) / 2),
    });

    currentIntensity = boundary;
    currentTime = boundaryTime;
  }

  // Add final segment
  segments.push({
    startIntensity: currentIntensity,
    endIntensity: endIntensity,
    startTime: currentTime,
    endTime: intervalDuration,
    zone: getZoneForIntensity((currentIntensity + endIntensity) / 2),
  });

  return segments;
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
  const { useAbsolutePower = false, ftpWatts = DEFAULT_FTP_WATTS } = options;

  // Calculate intensity range
  let minIntensity: number;
  let maxIntensity: number;
  let intensityRange: number;

  // Wave amplitude as a percentage (accounts for peaks above/below the 50% line)
  // Use a larger buffer to ensure waves don't get clipped in small charts
  const waveAmplitudePercent = 8; // ~8% above and below for wave peaks

  if (useAbsolutePower) {
    // For full chart: use absolute power scale from 0 to max
    const allPowers = intervals.flatMap((i) => {
      if (isFreeRideInterval(i)) {
        // Account for wave amplitude - free rides oscillate around 50%
        return [
          ((50 - waveAmplitudePercent) / 100) * ftpWatts,
          ((50 + waveAmplitudePercent) / 100) * ftpWatts
        ];
      }
      const start = (i.intensityPercentStart! / 100) * ftpWatts;
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
    // For mini chart: normalize to min-max range, but ensure 0 is included if there are free rides
    const allIntensities = intervals.flatMap((i) => {
      if (isFreeRideInterval(i)) {
        // Account for wave amplitude - free rides oscillate around 50%
        return [50 - waveAmplitudePercent, 50 + waveAmplitudePercent];
      }
      const values = [i.intensityPercentStart!];
      if (i.intensityPercentEnd !== undefined) {
        values.push(i.intensityPercentEnd);
      }
      return values;
    });
    
    // Check if any interval is a free ride
    const hasFreeRide = intervals.some(isFreeRideInterval);
    
    minIntensity = hasFreeRide ? 0 : Math.min(...allIntensities);
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
    const isFreeRide = isFreeRideInterval(interval);
    const isRamp = isRampInterval(interval);

    if (isFreeRide) {
      // Free ride: wavy area at 50% intensity
      const baseHeight = intensityToHeight(50);
      const y = heightToY(baseHeight);
      const yBottom = plotArea.top + plotArea.height;
      
      // Make amplitude proportional to chart height (smaller for mini charts)
      const amplitude = Math.min(8, plotArea.height * 0.10);
      
      const path = generateWavyPath(x, y, intervalWidth, yBottom, amplitude);

      elements.push({
        type: "path",
        color: "#ffc0cb", // Light pink for free ride
        path,
        interval,
        intervalIndex: index,
      });
    } else if (isRamp) {
      const startZone = getZoneForIntensity(interval.intensityPercentStart!);
      const endZone = getZoneForIntensity(interval.intensityPercentEnd!);

      if (startZone === endZone) {
        // Single zone ramp - render as before
        const startHeight = intensityToHeight(interval.intensityPercentStart!);
        const endHeight = intensityToHeight(interval.intensityPercentEnd!);
        const yStart = heightToY(startHeight);
        const yEnd = heightToY(endHeight);
        const yBottom = plotArea.top + plotArea.height;

        const points = [
          `${x},${yBottom}`,
          `${x},${yStart}`,
          `${x + intervalWidth},${yEnd}`,
          `${x + intervalWidth},${yBottom}`,
        ].join(" ");

        elements.push({
          type: "polygon",
          color: POWER_ZONES[startZone].color,
          points,
          interval,
          intervalIndex: index,
        });
      } else {
        // Multi-zone ramp - split at boundaries
        const segments = splitRampIntoZoneSegments(
          interval.intensityPercentStart!,
          interval.intensityPercentEnd!,
          interval.durationSeconds
        );

        segments.forEach((segment) => {
          const segmentStartTime = currentTime + segment.startTime;
          const segmentEndTime = currentTime + segment.endTime;
          const segmentWidth =
            ((segmentEndTime - segmentStartTime) / totalDuration) * plotArea.width;
          const segmentX = timeToX(segmentStartTime);

          const startHeight = intensityToHeight(segment.startIntensity);
          const endHeight = intensityToHeight(segment.endIntensity);
          const yStart = heightToY(startHeight);
          const yEnd = heightToY(endHeight);
          const yBottom = plotArea.top + plotArea.height;

          const points = [
            `${segmentX},${yBottom}`,
            `${segmentX},${yStart}`,
            `${segmentX + segmentWidth},${yEnd}`,
            `${segmentX + segmentWidth},${yBottom}`,
          ].join(" ");

          elements.push({
            type: "polygon",
            color: POWER_ZONES[segment.zone].color,
            points,
            interval,
            intervalIndex: index,
          });
        });
      }
    } else {
      // For constant intervals, draw a rectangle
      const barHeight = intensityToHeight(interval.intensityPercentStart!);
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
