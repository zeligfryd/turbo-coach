"use client";

/**
 * Total session load, by modality, week by week.
 *
 * A separate panel from the PMC on purpose. CTL/ATL/TSB is bike TSS from power;
 * this is sRPE × minutes across everything. Two measures on two scales means
 * two charts — putting them on one pair of axes would corrupt the number that
 * is meant to be comparable with intervals.icu.
 */

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Hint } from "@/components/training/hint";
import { modalityColor } from "@/lib/training/display";
import { MODALITIES, MODALITY_LABELS, type Modality } from "@/lib/training/taxonomy";
import type { WeekLoad } from "@/lib/training/types";

type Row = { week: string; label: string } & Partial<Record<Modality, number>>;

function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00Z");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function SessionLoadChart({ weeks }: { weeks: WeekLoad[] }) {
  const rows = useMemo<Row[]>(
    () =>
      weeks.map((week) => {
        const row: Row = { week: week.weekStart, label: formatWeekLabel(week.weekStart) };
        for (const modality of week.byModality) {
          if (modality.load > 0) row[modality.modality] = modality.load;
        }
        return row;
      }),
    [weeks],
  );

  const present = useMemo(
    () => MODALITIES.filter((modality) => rows.some((row) => (row[modality] ?? 0) > 0)),
    [rows],
  );

  const latest = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2];
  const total = latest?.totalLoad ?? 0;
  const ramp = previous && previous.totalLoad > 0 ? (total / previous.totalLoad - 1) * 100 : null;
  const nonBike = total > 0
    ? ((total - (latest.byModality.find((m) => m.modality === "bike")?.load ?? 0)) / total) * 100
    : null;
  const estimatedShare = total > 0 ? ((latest?.estimatedLoad ?? 0) / total) * 100 : 0;

  if (present.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No session load yet. Tick a session off the bike and it will appear here.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          <Hint term="session_load" underline={false}>
            Total session load
          </Hint>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every modality, weekly. sRPE × minutes — a different unit from bike TSS above.
        </p>
        {estimatedShare > 0 && (
          <p className="mt-1 text-xs">
            <Hint term="rpe_estimated" className="text-muted-foreground">
              {Math.round(estimatedShare)}% of this week is from an estimated RPE
            </Hint>
          </p>
        )}
      </div>

      <div className="p-2 sm:p-4">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
              formatter={(value, name) => [
                typeof value === "number" ? value.toLocaleString("en-GB") : String(value ?? ""),
                MODALITY_LABELS[name as Modality] ?? String(name),
              ]}
            />
            <Legend
              formatter={(value: string) => (
                <span className="text-xs text-muted-foreground">
                  {MODALITY_LABELS[value as Modality] ?? value}
                </span>
              )}
            />
            {present.map((modality, index) => (
              <Bar
                key={modality}
                dataKey={modality}
                stackId="load"
                fill={modalityColor(modality)}
                // Only the top segment gets the rounded cap.
                radius={index === present.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-3">
        <Stat label="This week" value={total.toLocaleString("en-GB")} note="sRPE × min" />
        <Stat
          label="Ramp"
          value={ramp === null ? "—" : `${ramp >= 0 ? "+" : ""}${ramp.toFixed(0)}%`}
          note="vs last week"
          highlight={ramp !== null && ramp > 10}
        />
        <Stat
          label="Non-bike"
          value={nonBike === null ? "—" : `${nonBike.toFixed(0)}%`}
          note="of total load"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{label}</p>
      <p
        className="text-lg font-semibold tabular-nums"
        style={highlight ? { color: "hsl(var(--coverage-due))" } : undefined}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{note}</p>
    </div>
  );
}
