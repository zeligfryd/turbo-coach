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
  width = 400,
  height = 30,
}: MiniIntensityChartProps) {
  // Use a fixed internal width for calculations, but scale responsively
  const internalWidth = 400;
  
  const chartData = useMemo(() => {
    const dimensions = {
      width: internalWidth,
      height,
      plotArea: {
        left: 0,
        top: 0,
        width: internalWidth,
        height,
      },
    };

    return calculateChartElements(intervals, dimensions, {
      useAbsolutePower: false, // Use relative scaling for mini chart
    });
  }, [intervals, height]);

  if (chartData.length === 0) {
    return <div className="bg-muted rounded w-full" style={{ height }} />;
  }

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${internalWidth} ${height}`}
      className="rounded overflow-hidden"
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      {chartData.map((element, index) => {
        if (element.type === "path") {
          return (
            <path
              key={index}
              d={element.path}
              fill={element.color}
              fillOpacity={0.8}
            />
          );
        } else if (element.type === "polygon") {
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
