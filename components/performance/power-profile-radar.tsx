"use client";

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";
import type { PowerProfile } from "@/lib/power/types";
import { SCORE_LABELS, PROFILE_DIMENSION_NAMES } from "@/lib/power/types";

interface PowerProfileRadarProps {
  profile: PowerProfile;
}

const DIMENSIONS = [
  { key: "5s", label: "Sprint\n(5s)", fullName: "Neuromuscular / Sprint" },
  { key: "1min", label: "Anaerobic\n(1min)", fullName: "Anaerobic Capacity" },
  { key: "5min", label: "VO2max\n(5min)", fullName: "VO2max" },
  { key: "20min", label: "Threshold\n(20min)", fullName: "Threshold (20min peak)" },
];

export function PowerProfileRadar({ profile }: PowerProfileRadarProps) {
  const data = DIMENSIONS.map((d) => ({
    dimension: d.label,
    fullName: d.fullName,
    allTime: profile.scores[d.key] ?? 0,
    last42d: profile.scores42d[d.key] ?? 0,
    allTimeLabel: SCORE_LABELS[profile.scores[d.key] ?? 0] ?? "",
    last42dLabel: SCORE_LABELS[profile.scores42d[d.key] ?? 0] ?? "",
    watts: profile.allTimePeaks[d.key] ?? 0,
    wkg: profile.peakWkg[d.key] ?? null,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500" />
          All-time ceiling
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border-2 border-emerald-500 border-dashed" />
          Last 42 days
        </span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 6]}
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            tickCount={7}
            tickFormatter={(v) => SCORE_LABELS[v] ? String(v) : ""}
          />

          {/* All-time (filled, low opacity) */}
          <Radar
            name="All-time"
            dataKey="allTime"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.15}
            strokeWidth={2}
          />

          {/* Last 42 days (outline only) */}
          <Radar
            name="Last 42 days"
            dataKey="last42d"
            stroke="#10b981"
            fill="transparent"
            strokeWidth={2}
            strokeDasharray="6 3"
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
              return (
                <div className="rounded-md bg-card border shadow-md px-3 py-2 text-xs space-y-1">
                  <div className="font-semibold">{item.fullName}</div>
                  <div>
                    All-time: <span className="font-medium">{item.allTimeLabel}</span> ({item.allTime}/6)
                    {item.watts > 0 && <span className="text-muted-foreground"> — {item.watts}W{item.wkg != null ? ` / ${item.wkg} W/kg` : ""}</span>}
                  </div>
                  <div>
                    Last 42d: <span className="font-medium">{item.last42dLabel}</span> ({item.last42d}/6)
                  </div>
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Score grid */}
      <div className="grid grid-cols-4 gap-3">
        {data.map((d) => (
          <div key={d.dimension} className="rounded-lg bg-muted/50 p-3 text-center">
            <div className="text-xs text-muted-foreground">{d.fullName}</div>
            <div className="text-lg font-bold mt-1">{d.allTime}/6</div>
            <div className="text-xs text-muted-foreground">{d.allTimeLabel}</div>
            {d.watts > 0 && (
              <div className="text-xs font-medium mt-1">
                {d.watts}W{d.wkg != null ? ` · ${d.wkg} W/kg` : ""}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
