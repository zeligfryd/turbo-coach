"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { smoothStream, downsampleStream, formatTime } from "@/lib/activity/stream-utils";

interface StreamChartProps {
  data: number[];
  label: string;
  color: string;
  unit?: string;
  height?: number;
  smoothingWindow?: number;
  maxPoints?: number;
  showOverlay?: { data: number[]; color: string; label: string };
  referenceLine?: { y: number; label: string; color?: string };
  yDomain?: [number, number];
  fillOpacity?: number;
}

const MAX_POINTS = 2000;

export function StreamChart({
  data,
  label,
  color,
  unit = "",
  height = 200,
  smoothingWindow = 0,
  maxPoints = MAX_POINTS,
  showOverlay,
  referenceLine,
  yDomain,
  fillOpacity = 0.3,
}: StreamChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const primary = smoothingWindow > 0 ? smoothStream(data, smoothingWindow) : data;
    const downsampled = downsampleStream(primary, maxPoints);

    // Calculate time step based on downsampling ratio
    const timeStep = data.length / downsampled.length;

    let overlayDownsampled: number[] | null = null;
    if (showOverlay?.data) {
      const overlaySmoothed = smoothStream(showOverlay.data, 1);
      overlayDownsampled = downsampleStream(overlaySmoothed, maxPoints);
    }

    return downsampled.map((v, i) => ({
      time: Math.round(i * timeStep),
      value: Math.round(v),
      ...(overlayDownsampled ? { overlay: Math.round(overlayDownsampled[i] ?? 0) } : {}),
    }));
  }, [data, smoothingWindow, maxPoints, showOverlay?.data]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg bg-card p-4 shadow-sm" style={{ height }}>
        <div className="text-sm text-muted-foreground">{label}: No data</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground mb-2">{label}</div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => formatTime(v)}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            domain={yDomain ?? ["auto", "auto"]}
            width={45}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            labelFormatter={(v) => formatTime(Number(v))}
            formatter={(value, name) => [
              `${value} ${unit}`,
              name === "overlay" ? showOverlay?.label ?? "" : label,
            ]}
          />
          {showOverlay && (
            <Area
              type="monotone"
              dataKey="overlay"
              stroke={showOverlay.color}
              fill={showOverlay.color}
              fillOpacity={0.1}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={fillOpacity}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {referenceLine && (
            <ReferenceLine
              y={referenceLine.y}
              stroke={referenceLine.color ?? "#ef4444"}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: referenceLine.label,
                position: "right",
                fill: referenceLine.color ?? "#ef4444",
                fontSize: 10,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
