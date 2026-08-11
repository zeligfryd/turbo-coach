"use client";

/**
 * Total session load, by modality, week by week.
 *
 * A separate panel from the PMC on purpose. CTL/ATL/TSB is bike TSS from power;
 * this is sRPE × minutes across everything. Two measures on two scales means
 * two charts — putting them on one pair of axes would corrupt the number that
 * is meant to be comparable with intervals.icu.
 */

import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Hint } from "@/components/training/hint";
import { modalityColor } from "@/lib/training/display";
import { MODALITIES, MODALITY_LABELS, type Modality } from "@/lib/training/taxonomy";
import type { SessionLoadRow, WeekLoad } from "@/lib/training/types";

type Row = { week: string } & Partial<Record<Modality, number>>;

function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00Z");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function SessionLoadChart({ weeks }: { weeks: WeekLoad[] }) {
  // Null means "the latest week" — resolved below, so the panel is never empty
  // and the common case needs no click.
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  // The week under the cursor, kept in a ref so tracking it never re-renders.
  const hoveredWeek = useRef<string | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      weeks.map((week) => {
        const row: Row = { week: week.weekStart };
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
  const detail = weeks.find((w) => w.weekStart === selectedWeek) ?? latest;
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
          <BarChart
            data={rows}
            margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
            /*
             * Selection is handled here rather than on the bars: the whole
             * column becomes the hit target, and a rest week — which draws no
             * rectangle at all — stays reachable.
             *
             * The hovered week is captured on move and only committed on click,
             * because the state recharts passes to onClick is one interaction
             * stale: clicking a column reported the previously clicked one.
             * onMouseMove is where the value is current, and a mouse move always
             * precedes a click.
             *
             * activeLabel is the x-axis category, which is the ISO week start
             * rather than the formatted label precisely so it is unambiguous.
             */
            onMouseMove={(state) => {
              const week = state?.activeLabel;
              hoveredWeek.current = typeof week === "string" && week ? week : null;
            }}
            onMouseLeave={() => {
              hoveredWeek.current = null;
            }}
            onClick={() => {
              if (hoveredWeek.current) setSelectedWeek(hoveredWeek.current);
            }}
            className="cursor-pointer"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="week"
              tickFormatter={formatWeekLabel}
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
              labelFormatter={(week) => `Week of ${formatWeekLabel(String(week))}`}
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
                className="cursor-pointer"
              >
                {/*
                  One Cell per data point, including weeks this modality did not
                  train. Recharts matches cells to the data array, not to the
                  rectangles it ends up drawing, so skipping the empty weeks
                  shifted every highlight after them one column left.
                */}
                {rows.map((row) => (
                  // The unselected weeks recede rather than the selected one
                  // brightening, so the bar keeps its true modality colour.
                  <Cell key={row.week} fillOpacity={row.week === detail?.weekStart ? 1 : 0.45} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {detail && <WeekBreakdown week={detail} />}

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

function formatSessionDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The arithmetic behind one week's number, session by session.
 *
 * Shows `minutes × sRPE = load` rather than the load alone. A 2h ride at IF
 * 0.63 scores 79 TSS but 488 load, and the gap is only explicable if the
 * multiplication is visible — otherwise the larger number reads as a fault.
 */
function WeekBreakdown({ week }: { week: WeekLoad }) {
  const { sessions } = week;

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-xs font-semibold">
          Week of {formatSessionDate(week.weekStart)}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {sessions.length === 0
            ? "Nothing completed"
            : `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${week.totalLoad.toLocaleString("en-GB")} load`}
        </p>
      </div>

      {sessions.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Load counts completed sessions only, so a planned week reads as zero until it is ticked off.
        </p>
      ) : (
        <div className="-mx-1 mt-2 overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                <th className="px-1 py-1 text-left font-normal">Session</th>
                <th className="px-1 py-1 text-right font-normal">Min</th>
                <th className="px-1 py-1 text-right font-normal">
                  <Hint term="session_load" underline={false}>
                    sRPE
                  </Hint>
                </th>
                <th className="px-1 py-1 text-right font-normal">Load</th>
                <th className="px-1 py-1 text-right font-normal">TSS</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
              <tr className="border-t border-border font-medium">
                <td className="px-1 py-1.5 text-muted-foreground">Total</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{week.totalMinutes}</td>
                <td className="px-1 py-1.5" />
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {week.totalLoad.toLocaleString("en-GB")}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">
                  {week.bikeTss > 0 ? Math.round(week.bikeTss) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: SessionLoadRow }) {
  return (
    <tr className="border-t border-border/50">
      <td className="px-1 py-1.5">
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-sm"
            style={{ backgroundColor: modalityColor(session.modality) }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground tabular-nums">
            {formatSessionDate(session.date)}
          </span>
          <span className="truncate" title={session.name}>
            {session.name}
          </span>
          <span className="sr-only">{MODALITY_LABELS[session.modality]}</span>
        </span>
      </td>
      <td className="px-1 py-1.5 text-right tabular-nums">{session.minutes}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">
        {session.srpe == null ? (
          <span className="text-muted-foreground">—</span>
        ) : session.srpeEstimated ? (
          <Hint term="rpe_estimated" underline={false}>
            <span className="tabular-nums">{session.srpe}</span>
            <span className="text-muted-foreground"> est.</span>
          </Hint>
        ) : (
          session.srpe
        )}
      </td>
      <td className="px-1 py-1.5 text-right font-medium tabular-nums">
        {session.load > 0 ? session.load.toLocaleString("en-GB") : "—"}
      </td>
      <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">
        {session.tss == null ? "—" : Math.round(session.tss)}
      </td>
    </tr>
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
