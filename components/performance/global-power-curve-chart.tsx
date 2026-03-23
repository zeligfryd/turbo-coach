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
  Legend,
} from "recharts";
import type { PowerCurvePoint } from "@/lib/power/types";
import { DURATION_LABELS } from "@/lib/power/types";

interface GlobalPowerCurveChartProps {
  allTime: PowerCurvePoint[];
  last42d: PowerCurvePoint[];
  showWkg: boolean;
  ftp: number | null;
  weight: number | null;
}

const TICK_SECS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 3600, 7200];

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}min`;
  return `${(secs / 3600).toFixed(1)}h`;
}

function isStale(dateStr: string): boolean {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return new Date(dateStr) < oneYearAgo;
}

export function GlobalPowerCurveChart({
  allTime,
  last42d,
  showWkg,
  ftp,
  weight,
}: GlobalPowerCurveChartProps) {
  const chartData = useMemo(() => {
    const map = new Map<number, { logSecs: number; allTime?: number; last42d?: number; allTimeDate?: string; last42dDate?: string }>();

    for (const p of allTime) {
      const val = showWkg ? p.wkg : p.watts;
      if (val == null) continue;
      map.set(p.secs, {
        logSecs: Math.log10(p.secs),
        allTime: val,
        allTimeDate: p.date,
      });
    }

    for (const p of last42d) {
      const val = showWkg ? p.wkg : p.watts;
      if (val == null) continue;
      const existing = map.get(p.secs) ?? { logSecs: Math.log10(p.secs) };
      existing.last42d = val;
      existing.last42dDate = p.date;
      map.set(p.secs, existing);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([secs, data]) => ({ secs, ...data }));
  }, [allTime, last42d, showWkg]);

  if (chartData.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center text-muted-foreground">
        No power curve data available
      </div>
    );
  }

  const ticks = TICK_SECS
    .filter((v) => v >= chartData[0].secs && v <= chartData[chartData.length - 1].secs)
    .map((v) => Math.log10(v));

  const yLabel = showWkg ? "W/kg" : "Watts";
  const ftpLine = ftp && !showWkg ? ftp : ftp && weight ? Math.round((ftp / weight) * 100) / 100 : null;

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="logSecs"
          type="number"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={(v: number) => formatDuration(Math.round(Math.pow(10, v)))}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          domain={["auto", "auto"]}
          width={55}
          tickFormatter={(v) => showWkg ? `${v}` : `${v}`}
          label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 10, fontSize: 10 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "12px",
          }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const item = payload[0]?.payload;
            if (!item) return null;
            const secs = item.secs as number;
            const label = DURATION_LABELS[secs] ?? formatDuration(secs);
            return (
              <div className="rounded-md bg-card border shadow-md px-3 py-2 text-xs space-y-1">
                <div className="font-semibold">{label}</div>
                {item.allTime != null && (
                  <div className="flex justify-between gap-3">
                    <span className="text-blue-500">All-time:</span>
                    <span className="font-medium">
                      {item.allTime}{showWkg ? " W/kg" : "W"}
                    </span>
                    {item.allTimeDate && (
                      <span className={`text-muted-foreground ${isStale(item.allTimeDate) ? "text-amber-500" : ""}`}>
                        {isStale(item.allTimeDate) ? `Set ${item.allTimeDate} — may be stale` : item.allTimeDate}
                      </span>
                    )}
                  </div>
                )}
                {item.last42d != null && (
                  <div className="flex justify-between gap-3">
                    <span className="text-emerald-500">Last 42d:</span>
                    <span className="font-medium">
                      {item.last42d}{showWkg ? " W/kg" : "W"}
                    </span>
                    {item.last42dDate && (
                      <span className="text-muted-foreground">{item.last42dDate}</span>
                    )}
                  </div>
                )}
              </div>
            );
          }}
        />
        <Legend
          verticalAlign="top"
          height={30}
          formatter={(value) => <span className="text-xs">{value}</span>}
        />

        {/* All-time line (solid) */}
        <Line
          type="monotone"
          dataKey="allTime"
          name="All-time best"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6" }}
          isAnimationActive={false}
          connectNulls
        />

        {/* Last 42 days line (dashed) */}
        <Line
          type="monotone"
          dataKey="last42d"
          name="Last 42 days"
          stroke="#10b981"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={{ r: 3, fill: "#10b981" }}
          isAnimationActive={false}
          connectNulls
        />

        {ftpLine && (
          <ReferenceLine
            y={ftpLine}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `FTP ${ftpLine}${showWkg ? " W/kg" : "W"}`,
              position: "right",
              fill: "#ef4444",
              fontSize: 10,
            }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
