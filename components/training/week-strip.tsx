"use client";

/**
 * The week, as one glance.
 *
 * Replaces the coverage widget that used to open the app: six rows, every one
 * of them reading "never", under the line "6 of 6 areas past target". That is
 * six failures before you have agreed to any of it, and it says nothing about
 * the riding that actually happened.
 *
 * This says what you did, how fresh you are, and — quietly, without alarm —
 * the two counts worth knowing.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

import { modalityColor } from "@/lib/training/display";
import { dayBars, ridingPeak } from "@/lib/training/week-bars";
import { AREA_LABELS } from "@/lib/training/taxonomy";

import type { TodaySnapshot, TrainingOverview } from "@/app/training/actions";
import type { AreaCoverage } from "@/lib/training/types";

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

function hoursLabel(minutes: number): string {
  if (minutes === 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Form is the one PMC number worth a word rather than a chart. */
function formWord(tsb: number): string {
  if (tsb < -30) return "very fatigued";
  if (tsb < -10) return "building";
  if (tsb < 5) return "neutral";
  if (tsb < 25) return "fresh";
  return "very fresh";
}

function sinceLabel(area: AreaCoverage): string {
  if (area.daysSince == null) return "not yet covered";
  if (area.daysSince === 0) return "covered today";
  if (area.daysSince === 1) return "1 day ago";
  return `${area.daysSince} days ago`;
}

export function WeekStrip({
  snapshot,
  coverage = [],
  routines = [],
}: {
  snapshot: TodaySnapshot;
  /** For explaining what is owed, in place. */
  coverage?: AreaCoverage[];
  routines?: TrainingOverview["routines"];
}) {
  const [showOwed, setShowOwed] = useState(false);
  const { week, weekMinutes, weekRides, form, offBike30d, missed, shape } = snapshot;
  const offBikeMinutes = week.reduce((sum, day) => sum + day.offBikeMinutes, 0);
  const peak = ridingPeak(week);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">This week</h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{hoursLabel(weekMinutes + offBikeMinutes)}</span>
          {weekRides > 0 && ` · ${weekRides} ride${weekRides === 1 ? "" : "s"}`}
        </p>
      </div>

      {/*
        Two lanes, not one stack. Riding and off-bike minutes are not the same
        quantity — see lib/training/week-bars.ts for why every single-axis fix
        distorts one end or the other. Each lane carries its own scale, and the
        day letters sit under both so the whole thing reads without a legend.
      */}
      <div className="mt-3">
        <div className="flex h-9 items-end gap-1.5">
          {week.map((day, index) => {
            const bars = dayBars(day, peak);
            return (
              <div
                key={day.date}
                className="flex h-full flex-1 items-end"
                title={day.minutes > 0 ? `${DAY_INITIALS[index]} · ${hoursLabel(day.minutes)} riding` : undefined}
              >
                <div
                  className="w-full rounded-sm"
                  // The bike colour rather than the primary token: primary is
                  // pure white in dark mode, which reads as an alert not data.
                  style={{
                    height: bars.riding > 0 ? `${bars.riding * 100}%` : "3px",
                    backgroundColor: bars.riding > 0 ? modalityColor("bike") : "hsl(var(--muted))",
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-1 flex h-2.5 items-start gap-1.5">
          {week.map((day, index) => {
            const bars = dayBars(day, peak);
            return (
              <div
                key={day.date}
                className="flex h-full flex-1 items-start"
                title={
                  day.offBikeMinutes > 0
                    ? `${DAY_INITIALS[index]} · ${hoursLabel(day.offBikeMinutes)} off the bike`
                    : undefined
                }
              >
                {bars.offBike > 0 && (
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${bars.offBike * 100}%`,
                      backgroundColor: modalityColor("prehab"),
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-1.5 flex gap-1.5">
          {week.map((day, index) => (
            <span
              key={day.date}
              className={
                day.isToday
                  ? "flex-1 text-center text-[10px] font-bold text-foreground"
                  : day.isFuture
                    ? "flex-1 text-center text-[10px] text-muted-foreground/40"
                    : "flex-1 text-center text-[10px] text-muted-foreground"
              }
            >
              {DAY_INITIALS[index]}
            </span>
          ))}
        </div>
      </div>

      {/* The week's shape, as pips rather than a percentage: three things to
          do reads as three things, where "67%" reads as a score. */}
      {shape && shape.expected > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
          <span className="flex items-center gap-2">
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: shape.expected }, (_, index) => (
                <span
                  key={index}
                  className={
                    index < shape.done
                      ? "h-2 w-2 rounded-full bg-primary"
                      : "h-2 w-2 rounded-full border border-border"
                  }
                />
              ))}
            </span>
            {/* Doing more than the shape asks is a good week, not an error —
                but "8 of 2" reads like one. Past the target the count stops
                being a fraction and the extras are named separately. */}
            <span className="text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {Math.min(shape.done, shape.expected)} of {shape.expected}
              </span>{" "}
              off the bike
              {shape.done > shape.expected && (
                <span className="tabular-nums"> · {shape.done - shape.expected} extra</span>
              )}
            </span>
          </span>
          {shape.owed.length > 0 && (
            // "Still owed: posterior chain, trunk +3" was a dead end — it named
            // things without saying why they were owed or what to do about
            // them. Opens in place rather than sending you to another screen.
            <button
              type="button"
              onClick={() => setShowOwed((open) => !open)}
              aria-expanded={showOwed}
              className="flex min-h-[28px] items-center gap-1 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Still owed:{" "}
              <span className="text-foreground">
                {shape.owed.slice(0, 2).map((area) => AREA_LABELS[area].toLowerCase()).join(", ")}
                {shape.owed.length > 2 && ` +${shape.owed.length - 2}`}
              </span>
              <ChevronDown
                className={showOwed ? "h-3.5 w-3.5 rotate-180 transition-transform" : "h-3.5 w-3.5 transition-transform"}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      )}

      {shape && showOwed && shape.owed.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-border pt-2.5">
          {shape.owed.map((area) => {
            const state = coverage.find((c) => c.area === area);
            // The highest-ranked routine that covers this area is the answer to
            // "so what should I do about it".
            const fix = routines.find((routine) => area in routine.coverageVector);
            return (
              // Two lines rather than one. On a 390px screen the area name,
              // its state and the routine could not share a line without
              // breaking mid-phrase ("wanted every / 7d"), which reads as
              // broken rather than as dense.
              <li key={area} className="text-xs">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {AREA_LABELS[area]}
                  </span>
                  {fix && (
                    <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                      {fix.name}
                    </span>
                  )}
                </span>
                {state && (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {sinceLabel(state)} · every {state.targetDays}d
                  </span>
                )}
              </li>
            );
          })}
          <li className="pt-0.5 text-xs">
            <Link href="/training" className="text-muted-foreground underline-offset-4 hover:underline">
              Change how often
            </Link>
          </li>
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        {form != null && (
          <span>
            Form{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {form > 0 ? "+" : ""}
              {Math.round(form)}
            </span>{" "}
            · {formWord(form)}
          </span>
        )}
        {!shape && (
          <span>
            Off the bike{" "}
            <span className="font-semibold tabular-nums text-foreground">{offBike30d}</span> in 30 days
          </span>
        )}
        {/* Stated, not alarmed. A missed session is information, and the only
            action offered is to go and look. */}
        {missed > 0 && (
          <Link href="/calendar" className="underline-offset-2 hover:underline">
            {missed} missed
          </Link>
        )}
      </div>
    </section>
  );
}
