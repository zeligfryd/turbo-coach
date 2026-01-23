"use client";

import { useMemo } from "react";
import { getZoneForIntensity, POWER_ZONES } from "@/lib/workouts/utils";
import type { WorkoutInterval } from "@/lib/workouts/types";

interface MiniIntensityChartProps {
  intervals: WorkoutInterval[];
  width?: number;
  height?: number;
}

export function MiniIntensityChart({
  intervals,
  width = 120,
  height = 30,
}: MiniIntensityChartProps) {
  const chartData = useMemo(() => {
    if (intervals.length === 0) return [];

    const totalDuration = intervals.reduce((sum, i) => sum + i.durationSeconds, 0);
    if (totalDuration === 0) return [];

    const maxIntensity = Math.max(...intervals.map((i) => i.intensityPercent));
    const minIntensity = Math.min(...intervals.map((i) => i.intensityPercent));
    const intensityRange = maxIntensity - minIntensity || 1;

    let currentTime = 0;
    const bars: Array<{
      x: number;
      width: number;
      height: number;
      color: string;
    }> = [];

    intervals.forEach((interval) => {
      const zone = getZoneForIntensity(interval.intensityPercent);
      const zoneColor = POWER_ZONES[zone].color;

      const barWidth = (interval.durationSeconds / totalDuration) * width;
      const normalizedIntensity = (interval.intensityPercent - minIntensity) / intensityRange;
      const barHeight = Math.max(2, normalizedIntensity * height * 0.8 + height * 0.2);

      bars.push({
        x: (currentTime / totalDuration) * width,
        width: barWidth,
        height: barHeight,
        color: zoneColor,
      });

      currentTime += interval.durationSeconds;
    });

    return bars;
  }, [intervals, width, height]);

  if (chartData.length === 0) {
    return <div className="bg-muted rounded" style={{ width, height }} />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="rounded overflow-hidden"
      style={{ display: "block" }}
    >
      {chartData.map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={height - bar.height}
          width={bar.width}
          height={bar.height}
          fill={bar.color}
          fillOpacity={0.8}
        />
      ))}
    </svg>
  );
}
