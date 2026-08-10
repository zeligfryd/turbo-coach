"use client";

/**
 * The routine rotation — the default path (D8).
 *
 * The cards are held in a **stable order** and the recommendation is marked in
 * place. Sorting the list by urgency meant the card you just clicked jumped to
 * the end and a different one took its place, which reads as the interface
 * rearranging itself in response to a click. The ranking still decides which
 * card is badged and which one the callout names; it no longer decides where
 * anything sits.
 */

import { useTransition } from "react";
import { CalendarPlus, Check, Clock, Undo2 } from "lucide-react";

import { Hint } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import { AREA_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import { coverageColor, formatDaysAgo, formatMinutes, modalityColor } from "@/lib/training/display";
import type { RoutineCoverage } from "@/lib/training/types";
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

export function RoutineRotation({
  routines,
  onLogNow,
  onUndo,
  onSchedule,
  compact = false,
}: {
  routines: RotationRoutine[];
  onLogNow: (routineId: string) => Promise<void>;
  onUndo?: (blockId: string) => Promise<void>;
  onSchedule?: (routineId: string) => Promise<void>;
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (routines.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No routines yet.
      </p>
    );
  }

  // The suggestion comes from the ranking; the layout does not.
  const suggestedId =
    routines[0] && routines[0].fixesAreas.length > 0 && !routines[0].completedTodayBlockId
      ? routines[0].id
      : null;
  const ordered = [...routines].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {ordered.map((routine) => {
        const isSuggested = routine.id === suggestedId;
        const doneToday = routine.completedTodayBlockId !== null;
        const areas = Object.keys(routine.coverageVector) as FocusArea[];

        return (
          <div
            key={routine.id}
            style={{
              borderLeftColor: doneToday
                ? coverageColor("fresh")
                : isSuggested
                  ? coverageColor("overdue")
                  : modalityColor("prehab"),
            }}
            className={cn(
              "flex flex-col gap-2.5 rounded-lg border border-l-[3px] border-border bg-card p-3.5 transition-colors",
              isSuggested && "ring-1 ring-[hsl(var(--coverage-overdue))]/25",
              doneToday && "bg-muted/40"
            )}
          >
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{routine.name}</h3>
                {doneToday ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-[9px] font-medium uppercase tracking-wide"
                    style={{ color: coverageColor("fresh") }}
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Done today
                  </span>
                ) : (
                  isSuggested && (
                    <span
                      className="shrink-0 text-[9px] font-medium uppercase tracking-wide"
                      style={{ color: coverageColor("overdue") }}
                    >
                      Stalest
                    </span>
                  )
                )}
              </div>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {formatMinutes(routine.estDurationMin)} · {routine.exerciseCount} exercises ·{" "}
                {routine.daysSinceDone === null
                  ? "never done"
                  : `done ${formatDaysAgo(routine.daysSinceDone)}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-1">
              {areas.map((area) => {
                const isFixing = !doneToday && routine.fixesAreas.includes(area);
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

            <div className="mt-auto flex gap-1.5 pt-0.5">
              {doneToday ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={isPending || !onUndo}
                  onClick={() =>
                    startTransition(async () => {
                      if (onUndo && routine.completedTodayBlockId) {
                        await onUndo(routine.completedTodayBlockId);
                      }
                    })
                  }
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" />
                  Undo
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={isSuggested ? "default" : "outline"}
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => startTransition(async () => void (await onLogNow(routine.id)))}
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Did it
                </Button>
              )}
              {onSchedule && !doneToday && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Schedule ${routine.name} for today`}
                  disabled={isPending}
                  onClick={() => startTransition(async () => void (await onSchedule(routine.id)))}
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One-line summary of the rotation, for /today and the dashboard. */
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
