"use client";

/**
 * The routine rotation — the default path (D8).
 *
 * The evidence on injury-prevention programmes is about adherence, not
 * targeting: the interventions that work are short fixed sequences, and even
 * those stop working below ~75% compliance. So the question this asks is
 * "which of these four", not "what should I compose".
 */

import { useTransition } from "react";
import { CalendarPlus, Check, Clock } from "lucide-react";

import { Hint } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import { AREA_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import { coverageColor, formatMinutes, modalityColor } from "@/lib/training/display";
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
  fixesAreas: string[];
  urgency: number;
};

export function RoutineRotation({
  routines,
  onLogNow,
  onSchedule,
  compact = false,
}: {
  routines: RotationRoutine[];
  onLogNow: (routineId: string) => Promise<void>;
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

  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {routines.map((routine, index) => {
        // Only the leading card is called out, and only when it actually has
        // something overdue to fix — otherwise nothing is urgent and saying so
        // would be noise.
        const isSuggested = index === 0 && routine.fixesAreas.length > 0;
        const areas = Object.keys(routine.coverageVector) as FocusArea[];

        return (
          <div
            key={routine.id}
            style={{ borderLeftColor: isSuggested ? coverageColor("overdue") : modalityColor("prehab") }}
            className={cn(
              "flex flex-col gap-2.5 rounded-lg border border-l-[3px] border-border bg-card p-3.5",
              isSuggested && "ring-1 ring-[hsl(var(--coverage-overdue))]/25"
            )}
          >
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{routine.name}</h3>
                {isSuggested && (
                  <span
                    className="shrink-0 text-[9px] font-medium uppercase tracking-wide"
                    style={{ color: coverageColor("overdue") }}
                  >
                    Stalest
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {formatMinutes(routine.estDurationMin)} · {routine.exerciseCount} exercises
                {routine.daysSinceDone !== null ? (
                  <> · done {routine.daysSinceDone}d ago</>
                ) : (
                  <> · never done</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-1">
              {areas.map((area) => {
                const isFixing = routine.fixesAreas.includes(area);
                return (
                  <span
                    key={area}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px]",
                      isFixing
                        ? "border-current font-medium"
                        : "border-border text-muted-foreground"
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
              {onSchedule && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Schedule ${routine.name}`}
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
  const overdue = routine.fixesAreas.length > 0;
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {overdue ? (
        <>
          <Hint term="routine" underline={false}>
            <span className="font-medium text-foreground">{routine.name}</span>
          </Hint>{" "}
          is next —{" "}
          {routine.daysSinceDone === null
            ? "never done"
            : `last done ${routine.daysSinceDone} days ago`}
        </>
      ) : (
        <>Everything is inside its interval. Nothing is due.</>
      )}
    </p>
  );
}
