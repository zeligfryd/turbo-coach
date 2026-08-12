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
import { dayBars, ridingPeak } from "@/lib/training/week-bars";

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
  const { week, weekMinutes, weekRides, form, offBike30d, missed, offBikeWeek } = snapshot;
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

      {/* Only shown when you have actually scheduled something. Reporting
          progress against a target nobody set is what made the old line noise. */}
      {offBikeWeek && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs">
          {/* A pip per session while they still fit. Beyond that they were
              being capped at seven while the text said nine, which is a chart
              that disagrees with its own label — a bar scales instead. */}
          {offBikeWeek.scheduled <= 7 ? (
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: offBikeWeek.scheduled }, (_, index) => (
                <span
                  key={index}
                  className={
                    index < offBikeWeek.done
                      ? "h-2 w-2 rounded-full bg-primary"
                      : "h-2 w-2 rounded-full border border-border"
                  }
                />
              ))}
            </span>
          ) : (
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (offBikeWeek.done / offBikeWeek.scheduled) * 100)}%` }}
              />
            </span>
          )}
          <span className="text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {offBikeWeek.done} of {offBikeWeek.scheduled}
            </span>{" "}
            off the bike
          </span>
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
