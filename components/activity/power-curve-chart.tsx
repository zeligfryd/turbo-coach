"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { IcuPowerCurvePoint } from "@/lib/intervals/types";
import { downsamplePoints } from "@/lib/activity/stream-utils";

interface PowerCurveChartProps {
  data: IcuPowerCurvePoint[];
  ftp?: number | null;
  height?: number;
}

function formatDurationLabel(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

const TICK_VALUES = [1, 5, 15, 30, 60, 120, 300, 600, 1200, 3600, 7200];

export function PowerCurveChart({ data, ftp, height = 250 }: PowerCurveChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const filtered = data.filter((p) => p.watts > 0 && p.secs > 0);
    const downsampled = downsamplePoints(filtered, 300);
    return downsampled.map((p) => ({
      secs: p.secs,
      logSecs: Math.log10(p.secs),
      watts: p.watts,
      wpkg: p.watts_per_kg ? Number(p.watts_per_kg.toFixed(2)) : null,
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg bg-card p-4 shadow-sm" style={{ height }}>
        <div className="text-sm text-muted-foreground">Power Curve: No data</div>
      </div>
    );
  }

  const ticks = TICK_VALUES
    .filter((v) => v >= chartData[0].secs && v <= chartData[chartData.length - 1].secs)
    .map((v) => Math.log10(v));

  return (
    <div className="rounded-lg bg-card p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground mb-2">Power Duration Curve</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="logSecs"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={(v: number) => formatDurationLabel(Math.round(Math.pow(10, v)))}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            domain={["auto", "auto"]}
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            labelFormatter={(v) => formatDurationLabel(Math.round(Math.pow(10, Number(v))))}
            formatter={(value, name) => {
              if (name === "watts") return [`${value}W`, "Power"];
              if (name === "wpkg") return [`${value} W/kg`, "W/kg"];
              return [`${value}`, String(name)];
            }}
          />
          <Line
            type="monotone"
            dataKey="watts"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {ftp && (
            <ReferenceLine
              y={ftp}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `FTP ${ftp}W`,
                position: "right",
                fill: "#ef4444",
                fontSize: 10,
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
