"use client";

/**
 * The routine rotation — the default path (D8).
 *
 * One recommendation, stated with its reason, and the rest as a secondary
 * list. An equal grid of cards invites comparison, which is the opposite of
 * what this is for: the tool is supposed to answer "what next", not lay out
 * five options and make you rank them yourself.
 *
 * It also removes the ordering problem rather than papering over it. Ranked
 * order moved cards on every click; alphabetical order was stable but
 * arbitrary. Here the ranking decides only what sits in the recommendation
 * slot, and the list below is ordered by length — stable, and useful when the
 * real question is "how long have I got".
 */

import { useTransition } from "react";
import { CalendarPlus, Check, Clock, Undo2 } from "lucide-react";

import { Hint } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import { AREA_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import { coverageColor, formatDaysAgo, formatMinutes } from "@/lib/training/display";
import type { AreaCoverage, RoutineCoverage } from "@/lib/training/types";
import { cn } from "@/lib/utils";

export type RotationRoutine = {
  id: string;
  name: string;
  estDurationMin: number | null;
  exerciseCount: number;
  coverageVector: RoutineCoverage;
  lastDoneDate: string | null;
  daysSinceDone: number | null;
  completedTodayBlockId: string | null;
  fixesAreas: string[];
  urgency: number;
};

/**
 * Why this routine is the one — named areas rather than a score. "Neck and
 * shoulders, 9 days" is checkable; "urgency 2.25" is not.
 */
function reasonFor(routine: RotationRoutine, coverage: AreaCoverage[]): string | null {
  const behind = coverage
    .filter((area) => routine.fixesAreas.includes(area.area))
    .filter((area) => area.status === "overdue" || area.status === "never")
    .sort((a, b) => (b.ratio ?? Infinity) - (a.ratio ?? Infinity));

  if (behind.length === 0) return null;

  const phrase = (area: AreaCoverage) =>
    area.daysSince === null
      ? `${AREA_LABELS[area.area].toLowerCase()} not yet tracked`
      : `${AREA_LABELS[area.area].toLowerCase()} ${area.daysSince} days`;

  const named = behind.slice(0, 2).map(phrase);
  const rest = behind.length - named.length;
  return named.join(", ") + (rest > 0 ? `, and ${rest} more` : "");
}

function AreaChips({
  routine,
  muted = false,
}: {
  routine: RotationRoutine;
  muted?: boolean;
}) {
  const areas = Object.keys(routine.coverageVector) as FocusArea[];
  return (
    <div className="flex flex-wrap gap-1">
      {areas.map((area) => {
        const isFixing = !muted && routine.fixesAreas.includes(area);
        return (
          <span
            key={area}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[9px]",
              isFixing ? "border-current font-medium" : "border-border text-muted-foreground"
            )}
            style={isFixing ? { color: coverageColor("overdue") } : undefined}
          >
            {AREA_LABELS[area]}
            {!routine.coverageVector[area]?.loaded && " ~"}
          </span>
        );
      })}
    </div>
  );
}

export function RoutineRotation({
  routines,
  coverage,
  onLogNow,
  onUndo,
  onSchedule,
}: {
  routines: RotationRoutine[];
  coverage: AreaCoverage[];
  onLogNow: (routineId: string) => Promise<void>;
  onUndo?: (blockId: string) => Promise<void>;
  onSchedule?: (routineId: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  if (routines.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No routines yet.
      </p>
    );
  }

  const suggested =
    routines[0] && routines[0].fixesAreas.length > 0 && !routines[0].completedTodayBlockId
      ? routines[0]
      : null;

  // Length order: stable across clicks, and it answers the question you
  // actually have when the recommendation does not suit — how long have I got.
  const rest = routines
    .filter((routine) => routine.id !== suggested?.id)
    .sort((a, b) => (a.estDurationMin ?? 0) - (b.estDurationMin ?? 0));

  const logNow = (id: string) => startTransition(async () => void (await onLogNow(id)));
  const undo = (blockId: string) =>
    startTransition(async () => void (onUndo && (await onUndo(blockId))));

  return (
    <div className="space-y-4">
      {suggested ? (
        <div
          className="rounded-lg border border-border bg-card p-4"
          style={{ borderLeftColor: coverageColor("overdue"), borderLeftWidth: 3 }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-base font-semibold">{suggested.name}</h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatMinutes(suggested.estDurationMin)} · {suggested.exerciseCount} exercises ·{" "}
              {suggested.daysSinceDone === null
                ? "never done"
                : `done ${formatDaysAgo(suggested.daysSinceDone)}`}
            </span>
          </div>

          {reasonFor(suggested, coverage) && (
            <p className="mt-1 text-sm" style={{ color: coverageColor("overdue") }}>
              {reasonFor(suggested, coverage)}
            </p>
          )}

          <div className="mt-3">
            <AreaChips routine={suggested} />
          </div>

          <div className="mt-3.5 flex gap-2">
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => logNow(suggested.id)}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Did it
            </Button>
            {onSchedule && (
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => startTransition(async () => void (await onSchedule(suggested.id)))}
              >
                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                Schedule
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Everything is inside its interval. Nothing is due.
        </p>
      )}

      {rest.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
            {suggested ? "Other routines" : "Routines"}
          </h4>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rest.map((routine) => {
              const doneToday = routine.completedTodayBlockId !== null;
              return (
                <li key={routine.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium", doneToday && "text-muted-foreground")}>
                        {routine.name}
                      </span>
                      {doneToday && (
                        <span
                          className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide"
                          style={{ color: coverageColor("fresh") }}
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Done today
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
                      {formatMinutes(routine.estDurationMin)} · {routine.exerciseCount} exercises ·{" "}
                      {routine.daysSinceDone === null
                        ? "never done"
                        : `done ${formatDaysAgo(routine.daysSinceDone)}`}
                    </p>
                  </div>

                  {doneToday ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending || !onUndo}
                      onClick={() => routine.completedTodayBlockId && undo(routine.completedTodayBlockId)}
                    >
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                      Undo
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => logNow(routine.id)}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Did it
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One-line summary of the rotation, for the dashboard. */
export function NextRoutineCallout({ routine }: { routine: RotationRoutine | undefined }) {
  if (!routine) return null;
  const isDue = routine.fixesAreas.length > 0 && !routine.completedTodayBlockId;
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {isDue ? (
        <>
          <Hint term="routine" underline={false}>
            <span className="font-medium text-foreground">{routine.name}</span>
          </Hint>{" "}
          is next — {routine.daysSinceDone === null
            ? "never done"
            : `last done ${formatDaysAgo(routine.daysSinceDone)}`}
        </>
      ) : (
        <>Everything is inside its interval. Nothing is due.</>
      )}
    </p>
  );
}
