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

import Link from "next/link";

import { modalityColor } from "@/lib/training/display";
import { AREA_LABELS } from "@/lib/training/taxonomy";

import type { TodaySnapshot } from "@/app/training/actions";

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

export function WeekStrip({ snapshot }: { snapshot: TodaySnapshot }) {
  const { week, weekMinutes, weekRides, form, offBike30d, missed, shape } = snapshot;
  const peak = Math.max(60, ...week.map((day) => day.minutes));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">This week</h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{hoursLabel(weekMinutes)}</span>
          {weekRides > 0 && ` · ${weekRides} ride${weekRides === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Bar height carries the week's shape; the day letters sit under it so
          the whole thing reads without a legend or an axis. */}
      <div className="mt-3 flex h-14 items-end gap-1.5">
        {week.map((day, index) => {
          const share = day.minutes / peak;
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-9 w-full items-end">
                <div
                  className="w-full rounded-sm"
                  // The bike colour rather than the primary token: these bars
                  // are riding hours, and primary is pure white in dark mode,
                  // which reads as an alert rather than as data.
                  style={{
                    height: day.minutes > 0 ? `${Math.max(12, share * 100)}%` : "3px",
                    backgroundColor: day.minutes > 0 ? modalityColor("bike") : "hsl(var(--muted))",
                  }}
                  title={day.minutes > 0 ? `${DAY_INITIALS[index]} · ${hoursLabel(day.minutes)}` : undefined}
                />
              </div>
              <span
                className={
                  day.isToday
                    ? "text-[10px] font-bold text-foreground"
                    : day.isFuture
                      ? "text-[10px] text-muted-foreground/40"
                      : "text-[10px] text-muted-foreground"
                }
              >
                {DAY_INITIALS[index]}
              </span>
            </div>
          );
        })}
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
            <span className="text-muted-foreground">
              Still owed:{" "}
              <span className="text-foreground">
                {shape.owed.slice(0, 2).map((area) => AREA_LABELS[area].toLowerCase()).join(", ")}
                {shape.owed.length > 2 && ` +${shape.owed.length - 2}`}
              </span>
            </span>
          )}
        </div>
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
