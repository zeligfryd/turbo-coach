"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type { WorkoutInterval } from "@/lib/workouts/types";
import { calculateChartElements } from "@/lib/workouts/chart-renderer";
import {
  isRampInterval,
  formatDurationSeconds,
} from "@/lib/workouts/utils";

interface IntensityBarChartProps {
  intervals: WorkoutInterval[];
  ftpWatts?: number;
  height?: number;
}

const CHART_PADDING = {
  top: 20,
  right: 20,
  bottom: 50,
  left: 60,
};

export function IntensityBarChart({
  intervals,
  ftpWatts = 250,
  height = 200,
}: IntensityBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [hoveredInterval, setHoveredInterval] = useState<{
    interval: WorkoutInterval;
    index: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Update container width on mount and resize
  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      const { width } = containerRef.current!.getBoundingClientRect();
      setContainerWidth(width);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  if (intervals.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No intervals to display
      </div>
    );
  }

  const totalDuration = intervals.reduce((sum, i) => sum + i.durationSeconds, 0);

  // Calculate max power
  const maxPower = Math.max(
    ...intervals.map((interval) => {
      const start = (interval.intensityPercentStart / 100) * ftpWatts;
      const end = interval.intensityPercentEnd
        ? (interval.intensityPercentEnd / 100) * ftpWatts
        : start;
      return Math.max(start, end);
    })
  );
  const yAxisMax = Math.ceil(maxPower / 50) * 50;

  // Calculate plot area
  const plotArea = {
    left: CHART_PADDING.left,
    top: CHART_PADDING.top,
    width: containerWidth - CHART_PADDING.left - CHART_PADDING.right,
    height: height - CHART_PADDING.top - CHART_PADDING.bottom,
  };

  // Calculate chart elements
  const chartElements = useMemo(() => {
    const dimensions = {
      width: containerWidth,
      height,
      plotArea,
    };

    return calculateChartElements(intervals, dimensions, {
      useAbsolutePower: true,
      ftpWatts,
    });
  }, [intervals, containerWidth, height, plotArea.width, plotArea.height, ftpWatts]);

  // Format time for axis (MM:SS)
  const formatTimeAxis = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Render X-Axis (Time)
  const renderXAxis = () => {
    const numTicks = 6;
    const ticks = [];

    for (let i = 0; i <= numTicks; i++) {
      const time = (totalDuration / numTicks) * i;
      const x = plotArea.left + (time / totalDuration) * plotArea.width;

      ticks.push(
        <g key={`x-tick-${i}`}>
          {/* Tick line */}
          <line
            x1={x}
            y1={plotArea.top + plotArea.height}
            x2={x}
            y2={plotArea.top + plotArea.height + 6}
            stroke="#475569"
            strokeWidth="1"
          />
          {/* Tick label */}
          <text
            x={x}
            y={plotArea.top + plotArea.height + 20}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="11"
          >
            {formatTimeAxis(time)}
          </text>
          {/* Grid line */}
          <line
            x1={x}
            y1={plotArea.top}
            x2={x}
            y2={plotArea.top + plotArea.height}
            stroke="#475569"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
        </g>
      );
    }

    return ticks;
  };

  // Render Y-Axis (Power)
  const renderYAxis = () => {
    const numTicks = Math.ceil(yAxisMax / 50);
    const ticks = [];

    for (let i = 0; i <= numTicks; i++) {
      const power = (yAxisMax / numTicks) * i;
      const y = plotArea.top + plotArea.height * (1 - power / yAxisMax);

      ticks.push(
        <g key={`y-tick-${i}`}>
          {/* Tick line */}
          <line
            x1={plotArea.left - 6}
            y1={y}
            x2={plotArea.left}
            y2={y}
            stroke="#475569"
            strokeWidth="1"
          />
          {/* Tick label */}
          <text
            x={plotArea.left - 10}
            y={y}
            textAnchor="end"
            dominantBaseline="middle"
            fill="#94a3b8"
            fontSize="11"
          >
            {Math.round(power)}
          </text>
          {/* Grid line */}
          <line
            x1={plotArea.left}
            y1={y}
            x2={plotArea.left + plotArea.width}
            y2={y}
            stroke="#475569"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
        </g>
      );
    }

    // Add Y-axis label
    ticks.push(
      <text
        key="y-label"
        x={15}
        y={plotArea.top + plotArea.height / 2}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize="12"
        transform={`rotate(-90, 15, ${plotArea.top + plotArea.height / 2})`}
      >
        Power (W)
      </text>
    );

    return ticks;
  };

  // Handle mouse movement for tooltips
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Find which interval is hovered
    let currentTime = 0;
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const startX = plotArea.left + (currentTime / totalDuration) * plotArea.width;
      const endX =
        plotArea.left + ((currentTime + interval.durationSeconds) / totalDuration) * plotArea.width;

      if (
        mouseX >= startX &&
        mouseX <= endX &&
        mouseY >= plotArea.top &&
        mouseY <= plotArea.top + plotArea.height
      ) {
        setHoveredInterval({ interval, index: i, mouseX, mouseY });
        return;
      }

      currentTime += interval.durationSeconds;
    }

    setHoveredInterval(null);
  };

  // Render tooltip
  const renderTooltip = () => {
    if (!hoveredInterval) return null;

    const { interval, mouseX, mouseY } = hoveredInterval;
    const isRamp = isRampInterval(interval);

    const powerStart = Math.round((interval.intensityPercentStart / 100) * ftpWatts);
    const powerEnd = interval.intensityPercentEnd
      ? Math.round((interval.intensityPercentEnd / 100) * ftpWatts)
      : powerStart;

    // Build tooltip text
    const line1 = `${formatDurationSeconds(interval.durationSeconds)} @ ${isRamp
      ? `${interval.intensityPercentStart}% → ${interval.intensityPercentEnd}%`
      : `${interval.intensityPercentStart}%`
      }`;
    const line2 = isRamp ? `${powerStart}W → ${powerEnd}W` : `${powerStart}W`;

    // Calculate dynamic width based on content (approximate 7px per character for 12px font)
    const line1Width = line1.length * 7;
    const line2Width = line2.length * 7;
    const textPadding = 20; // 10px on each side
    const tooltipWidth = Math.max(line1Width, line2Width) + textPadding;
    const tooltipHeight = 50;
    const tooltipPadding = 10;

    // Position tooltip, keeping it within the full chart area bounds
    let x = mouseX + tooltipPadding;
    let y = mouseY - tooltipHeight - tooltipPadding;

    // Keep within chart horizontal bounds (entire grey area including axes)
    if (x + tooltipWidth > containerWidth) {
      x = mouseX - tooltipWidth - tooltipPadding;
    }
    if (x < 0) {
      x = 0;
    }

    // Keep within chart vertical bounds (entire grey area including axes)
    if (y < 0) {
      y = mouseY + tooltipPadding;
    }
    if (y + tooltipHeight > height) {
      y = height - tooltipHeight;
    }

    return (
      <g>
        {/* Tooltip background */}
        <rect
          x={x}
          y={y}
          width={tooltipWidth}
          height={tooltipHeight}
          fill="hsl(var(--muted))"
          stroke="hsl(var(--border))"
          strokeWidth="1"
          rx="8"
        />
        {/* Duration and intensity */}
        <text
          x={x + 10}
          y={y + 20}
          fill="hsl(var(--foreground))"
          fontSize="12"
        >
          {line1}
        </text>
        {/* Power */}
        <text
          x={x + 10}
          y={y + 37}
          fill="hsl(var(--muted-foreground))"
          fontSize="12"
        >
          {line2}
        </text>
      </g>
    );
  };

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${containerWidth} ${height}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredInterval(null)}
        style={{ display: "block" }}
      >
        {/* Axes and grid */}
        {renderXAxis()}
        {renderYAxis()}

        {/* Interval shapes */}
        {chartElements.map((element, index) =>
          element.type === "polygon" ? (
            <polygon
              key={index}
              points={element.points}
              fill={element.color}
              fillOpacity={0.8}
            />
          ) : (
            <rect
              key={index}
              x={element.x}
              y={element.y}
              width={element.width}
              height={element.height}
              fill={element.color}
              fillOpacity={0.8}
            />
          )
        )}

        {/* Tooltip */}
        {renderTooltip()}
      </svg>
    </div>
  );
}
