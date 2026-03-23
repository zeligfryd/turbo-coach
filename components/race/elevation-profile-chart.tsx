"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { GpxData } from "@/lib/race/types";

interface ElevationProfileChartProps {
  gpxData: GpxData;
  height?: number;
}

export function ElevationProfileChart({ gpxData, height = 200 }: ElevationProfileChartProps) {
  const data = gpxData.points.map((p) => ({
    km: Math.round(p.distanceKm * 10) / 10,
    ele: Math.round(p.ele),
  }));

  // Compute domain with padding
  const elevations = data.map((d) => d.ele);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const padding = Math.max(20, (maxEle - minEle) * 0.1);

  // Climb reference lines
  const climbs = gpxData.segments.filter((s) => s.type === "climb");

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="eleGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="km"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}`}
            fontSize={10}
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            label={{ value: "km", position: "insideBottomRight", offset: -5, fontSize: 10 }}
          />
          <YAxis
            domain={[minEle - padding, maxEle + padding]}
            tickFormatter={(v) => `${v}m`}
            fontSize={10}
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            width={50}
          />
          <Tooltip
            formatter={(value) => [`${value}m`, "Elevation"]}
            labelFormatter={(label) => `${label} km`}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />

          {/* Highlight climb zones */}
          {gpxData.segments.map((seg, i) => (
            seg.type !== "flat" && (
              <ReferenceLine
                key={i}
                x={seg.startKm}
                stroke={seg.type === "climb" ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.2)"}
                strokeDasharray="3 3"
              />
            )
          ))}

          <Area
            type="monotone"
            dataKey="ele"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#eleGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Climb labels */}
      {climbs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {climbs.map((climb, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-700 dark:text-red-400"
            >
              {climb.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
