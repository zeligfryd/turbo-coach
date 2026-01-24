"use client";

import { useMemo } from "react";
import type { WorkoutInterval } from "@/lib/workouts/types";
import { calculateChartElements } from "@/lib/workouts/chart-renderer";

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
    const dimensions = {
      width,
      height,
      plotArea: {
        left: 0,
        top: 0,
        width,
        height,
      },
    };

    return calculateChartElements(intervals, dimensions, {
      useAbsolutePower: false, // Use relative scaling for mini chart
    });
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
      {chartData.map((element, index) => {
        if (element.type === "polygon") {
          return (
            <polygon
              key={index}
              points={element.points}
              fill={element.color}
              fillOpacity={0.8}
            />
          );
        } else {
          return (
            <rect
              key={index}
              x={element.x}
              y={element.y}
              width={element.width}
              height={element.height}
              fill={element.color}
              fillOpacity={0.8}
            />
          );
        }
      })}
    </svg>
  );
}
