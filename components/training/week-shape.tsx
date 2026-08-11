"use client";

/**
 * The week's shape: six areas, four choices each.
 *
 * Replaces a row of +/- steppers over an interval in days. "Every 4 days" is
 * not a unit anyone plans in, and a number line has no state in which you are
 * finished — so the editor could only ever report a deficit.
 *
 * The footer is derived from the choices above it and from the routines you
 * actually own. Nothing in it is enterable: six frequencies already determine
 * the volume, and letting you also set "3 sessions a week" would allow two
 * settings to disagree with each other.
 */

import { useTransition } from "react";

import { Hint } from "@/components/training/hint";
import {
  CADENCES,
  cadenceForDays,
  daysForCadence,
  weeklyEstimate,
  type CadenceKey,
  type RoutineShape,
} from "@/lib/training/cadence";
import { coverageColor } from "@/lib/training/display";
import { AREA_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import type { AreaCoverage } from "@/lib/training/types";
import { cn } from "@/lib/utils";

function sinceLabel(area: AreaCoverage): string {
  if (area.daysSince == null) return "not yet covered";
  if (area.daysSince === 0) return "today";
  if (area.daysSince === 1) return "yesterday";
  return `${area.daysSince} days ago`;
}

export function WeekShape({
  coverage,
  routines,
  onSetTarget,
  onResetAll,
}: {
  coverage: AreaCoverage[];
  /** Used to work out how many sessions the shape comes to. */
  routines: RoutineShape[];
  onSetTarget: (area: FocusArea, targetDays: number) => Promise<void>;
  onResetAll: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const targets = Object.fromEntries(
    coverage.map((area) => [area.area, area.targetDays]),
  ) as Partial<Record<FocusArea, number>>;

  const estimate = weeklyEstimate(targets, routines);
  const anyOverridden = coverage.some((area) => !area.isDefault);

  const choose = (area: FocusArea, key: CadenceKey) => {
    startTransition(async () => {
      await onSetTarget(area, daysForCadence(key));
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Your week off the bike</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How often each area should come round.
          </p>
        </div>
        {anyOverridden && (
          <button
            type="button"
            onClick={() => startTransition(() => onResetAll())}
            disabled={isPending}
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            Reset
          </button>
        )}
      </div>

      <ul>
        {coverage.map((area) => {
          const current = cadenceForDays(area.targetDays);
          return (
            <li
              key={area.area}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {/* The dot is the only colour in the row: it says where this
                      area stands without a separate status column. */}
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: coverageColor(area.status) }}
                    aria-hidden="true"
                  />
                  {AREA_LABELS[area.area]}
                </p>
                <p className="mt-0.5 pl-3.5 text-xs text-muted-foreground">{sinceLabel(area)}</p>
              </div>

              <div
                className="inline-flex shrink-0 overflow-hidden rounded-full border border-border"
                role="group"
                aria-label={`How often for ${AREA_LABELS[area.area]}`}
              >
                {CADENCES.map((cadence) => {
                  const isOn = cadence.key === current;
                  return (
                    <button
                      key={cadence.key}
                      type="button"
                      aria-pressed={isOn}
                      title={cadence.full}
                      disabled={isPending}
                      onClick={() => choose(area.area, cadence.key)}
                      className={cn(
                        "min-h-[36px] border-r border-border px-3 text-xs transition-colors last:border-r-0",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        "disabled:opacity-50",
                        isOn
                          ? "bg-primary font-semibold text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {cadence.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {estimate.sessions === 0 ? (
          "Nothing asked for."
        ) : (
          <>
            Works out at{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {estimate.sessions} session{estimate.sessions === 1 ? "" : "s"}
            </span>{" "}
            a week · about{" "}
            <span className="font-semibold tabular-nums text-foreground">{estimate.minutes} min</span>{" "}
            · roughly{" "}
            <Hint term="session_load" underline={false}>
              <span className="font-semibold tabular-nums text-foreground">{estimate.load}</span> load
            </Hint>
          </>
        )}
      </div>
    </div>
  );
}
