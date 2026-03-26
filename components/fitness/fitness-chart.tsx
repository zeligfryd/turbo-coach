"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type { FitnessDay } from "@/lib/fitness/pmc";
import type { DailyActivityLoad } from "@/app/fitness/actions";

const TSB_ZONES = [
  { min: -Infinity, max: -30, label: "High Risk", color: "#ef4444" },
  { min: -30, max: -10, label: "Optimal", color: "#22c55e" },
  { min: -10, max: 5, label: "Grey Zone", color: "#9ca3af" },
  { min: 5, max: 25, label: "Fresh", color: "#3b82f6" },
  { min: 25, max: Infinity, label: "Transition", color: "#f59e0b" },
] as const;

const RANGES = [
  { label: "6W", days: 42 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
] as const;

type ChartDay = {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
};

function getTsbZone(tsb: number) {
  return TSB_ZONES.find((z) => tsb >= z.min && tsb < z.max) ?? TSB_ZONES[2];
}

// Darker zone colors for the TSB line (one step darker than the background fills)
const TSB_LINE_ZONE_COLORS = [
  { from: 25, color: "#b45309" },   // Transition — amber-700
  { from: 5, color: "#1d4ed8" },    // Fresh — blue-700
  { from: -10, color: "#4b5563" },  // Grey Zone — gray-600
  { from: -30, color: "#15803d" },  // Optimal — green-700
  { from: -Infinity, color: "#b91c1c" }, // High Risk — red-700
];

function tsbColorAt(tsb: number) {
  for (const z of TSB_LINE_ZONE_COLORS) {
    if (tsb >= z.from) return z.color;
  }
  return TSB_LINE_ZONE_COLORS[TSB_LINE_ZONE_COLORS.length - 1].color;
}

/** Build SVG gradient stops that color the TSB line by zone. */
function buildTsbGradientStops(dataMin: number, dataMax: number) {
  const range = dataMax - dataMin;
  if (range === 0) return [{ offset: "0%", color: tsbColorAt(dataMax) }];

  const stops: { offset: string; color: string }[] = [];
  stops.push({ offset: "0%", color: tsbColorAt(dataMax) });

  const boundaries = [25, 5, -10, -30];
  for (const b of boundaries) {
    if (b < dataMax && b > dataMin) {
      const pct = (((dataMax - b) / range) * 100).toFixed(2) + "%";
      stops.push({ offset: pct, color: tsbColorAt(b + 0.01) });
      stops.push({ offset: pct, color: tsbColorAt(b - 0.01) });
    }
  }

  stops.push({ offset: "100%", color: tsbColorAt(dataMin) });
  return stops;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function SharedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload as ChartDay | undefined;
  if (!item) return null;
  const zone = getTsbZone(item.tsb);
  return (
    <div className="rounded-md bg-card border shadow-md px-3 py-2 text-xs space-y-1">
      <div className="font-semibold">{formatDate(label as string)}</div>
      <div className="flex justify-between gap-4">
        <span style={{ color: "#3b82f6" }}>Fitness (CTL)</span>
        <span className="font-medium">{Math.round(item.ctl)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span style={{ color: "#a855f7" }}>Fatigue (ATL)</span>
        <span className="font-medium">{Math.round(item.atl)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span>Form (TSB)</span>
        <span className="font-medium" style={{ color: zone.color }}>
          {Math.round(item.tsb)} <span className="font-normal">{zone.label}</span>
        </span>
      </div>
    </div>
  );
}

interface FitnessChartProps {
  fitness: FitnessDay[];
  dailyLoads: DailyActivityLoad[];
}

export function FitnessChart({ fitness, dailyLoads }: FitnessChartProps) {
  const [range, setRange] = useState("3M");

  const chartData = useMemo(() => {
    const data: ChartDay[] = fitness.map((f) => ({
      date: f.date,
      ctl: f.ctl,
      atl: f.atl,
      tsb: f.tsb,
    }));

    const selected = RANGES.find((r) => r.label === range);
    if (selected && selected.days > 0 && data.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - selected.days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      return data.filter((d) => d.date >= cutoffStr);
    }

    return data;
  }, [fitness, range]);

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground space-y-2">
        <p>No fitness data available yet.</p>
        <p className="text-sm">
          Sync your activities to see your fitness curve.
        </p>
      </div>
    );
  }

  const current = chartData[chartData.length - 1];
  const currentZone = getTsbZone(current.tsb);

  // TSB Y-axis domain
  const tsbValues = chartData.map((d) => d.tsb);
  const tsbMin = Math.min(...tsbValues, -35);
  const tsbMax = Math.max(...tsbValues, 30);
  const tsbDomain: [number, number] = [
    Math.floor(tsbMin / 10) * 10 - 5,
    Math.ceil(tsbMax / 10) * 10 + 5,
  ];

  // X-axis tick spacing based on data density
  const tickInterval =
    chartData.length > 180 ? 13 : chartData.length > 90 ? 6 : 3;

  // TSB line gradient stops (colored by zone)
  const tsbDataMin = Math.min(...tsbValues);
  const tsbDataMax = Math.max(...tsbValues);
  const tsbGradientStops = buildTsbGradientStops(tsbDataMin, tsbDataMax);

  // Compute zone label Y positions (midpoint of each visible zone band)
  const visibleZones = TSB_ZONES.filter(
    (z) =>
      (z.max === Infinity ? tsbDomain[1] : z.max) > tsbDomain[0] &&
      (z.min === -Infinity ? tsbDomain[0] : z.min) < tsbDomain[1],
  ).map((z) => {
    const lo = Math.max(z.min === -Infinity ? tsbDomain[0] : z.min, tsbDomain[0]);
    const hi = Math.min(z.max === Infinity ? tsbDomain[1] : z.max, tsbDomain[1]);
    return { ...z, midY: (lo + hi) / 2 };
  });

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRange(r.label)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              range === r.label
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Top chart: CTL/ATL */}
      <div className="flex">
        <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">
          Fitness & Fatigue
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            syncId="fitness"
            margin={{ top: 5, right: 0, bottom: 0, left: 10 }}
          >
            <defs>
              <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.5}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={false}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="ctl"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              width={30}
              domain={[0, "auto"]}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} content={SharedTooltip} />
            <Area
              yAxisId="ctl"
              type="monotone"
              dataKey="ctl"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#ctlFill)"
              dot={false}
              isAnimationActive={false}
              name="Fitness (CTL)"
            />
            <Line
              yAxisId="ctl"
              type="monotone"
              dataKey="atl"
              stroke="#a855f7"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="Fatigue (ATL)"
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
        <div className="w-20 shrink-0 flex flex-col justify-center gap-1 pl-2">
          <div>
            <div className="text-[10px] text-muted-foreground">Fitness</div>
            <div className="text-sm font-semibold" style={{ color: "#3b82f6" }}>{Math.round(current.ctl)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Fatigue</div>
            <div className="text-sm font-semibold" style={{ color: "#a855f7" }}>{Math.round(current.atl)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Form</div>
            <div className="text-sm font-semibold" style={{ color: currentZone.color }}>{Math.round(current.tsb)}</div>
          </div>
        </div>
      </div>

      {/* Bottom chart: Form (TSB) with zone backgrounds + right-side zone labels */}
      <div className="-mt-2 flex">
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart
              data={chartData}
              syncId="fitness"
              margin={{ top: 0, right: 0, bottom: 0, left: 10 }}
            >
              <defs>
                <linearGradient id="tsbLine" x1="0" y1="0" x2="0" y2="1">
                  {tsbGradientStops.map((s, i) => (
                    <stop key={i} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.5}
              />
              {/* Zone backgrounds */}
              <ReferenceArea yAxisId="tsb" y1={tsbDomain[0]} y2={-30} fill="#ef4444" fillOpacity={0.08} />
              <ReferenceArea yAxisId="tsb" y1={-30} y2={-10} fill="#22c55e" fillOpacity={0.1} />
              <ReferenceArea yAxisId="tsb" y1={-10} y2={5} fill="#9ca3af" fillOpacity={0.08} />
              <ReferenceArea yAxisId="tsb" y1={5} y2={25} fill="#3b82f6" fillOpacity={0.08} />
              <ReferenceArea yAxisId="tsb" y1={25} y2={tsbDomain[1]} fill="#f59e0b" fillOpacity={0.1} />
              <ReferenceLine
                yAxisId="tsb"
                y={0}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval={tickInterval}
                tickLine={false}
              />
              <YAxis
                yAxisId="tsb"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                width={30}
                domain={tsbDomain}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} content={SharedTooltip} />
              <Line
                yAxisId="tsb"
                type="monotone"
                dataKey="tsb"
                stroke="url(#tsbLine)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Form (TSB)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Zone labels on the right, positioned to align with chart zones */}
        <div className="relative w-20 shrink-0" style={{ height: 180 }}>
          {visibleZones.map((zone) => {
            // Map zone midY to pixel position within the chart area
            // Chart has margin top=0, bottom≈30 (x-axis labels), so plot area is ~150px
            const plotTop = 5;
            const plotBottom = 150;
            const plotHeight = plotBottom - plotTop;
            const pct = 1 - (zone.midY - tsbDomain[0]) / (tsbDomain[1] - tsbDomain[0]);
            const top = plotTop + pct * plotHeight;
            return (
              <div
                key={zone.label}
                className="absolute left-2 text-[10px] leading-none -translate-y-1/2"
                style={{ top, color: zone.color }}
              >
                {zone.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

