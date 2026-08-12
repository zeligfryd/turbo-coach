"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ChevronDown, Copy, Pencil, Plus } from "lucide-react";

import { ConfirmAction } from "@/components/training/confirm-action";

import { RoutineComposer, type ComposerSeed } from "@/components/training/routine-composer";
import { RoutineDetail } from "@/components/training/routine-detail";
import { InfoPanel } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import {
  archiveRoutineAction,
  createRoutineAction,
  duplicateRoutineAction,
  getExerciseBank,
  getRoutineDetail,
  getTrainingOverview,
  updateRoutineAction,
  type BankExercise,
  type TrainingOverview,
} from "@/app/training/actions";
import { AREA_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import { formatMinutes } from "@/lib/training/display";
import type { AreaCoverage } from "@/lib/training/types";
import { cn } from "@/lib/utils";

export function RoutinesClient() {
  const [exercises, setExercises] = useState<BankExercise[]>([]);
  const [coverage, setCoverage] = useState<AreaCoverage[]>([]);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [composing, setComposing] = useState<{ seed?: ComposerSeed } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [bank, over] = await Promise.all([getExerciseBank(), getTrainingOverview()]);
    if (bank.success) {
      setExercises(bank.data.exercises);
      setCoverage(bank.data.coverage);
    } else {
      setError(bank.error);
    }
    if (over.success) setOverview(over.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Load a routine's exercises so the composer opens pre-filled. */
  async function beginEdit(routine: TrainingOverview["routines"][number]) {
    const detail = await getRoutineDetail(routine.id);
    if (!detail.success) {
      setError(detail.error);
      return;
    }
    const items = detail.data as unknown as {
      position: number;
      exercise: { id: string } | null;
    }[];
    setComposing({
      seed: {
        id: routine.id,
        name: routine.name,
        estDurationMin: routine.estDurationMin,
        exerciseIds: items
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((item) => item.exercise?.id)
          .filter((id): id is string => Boolean(id)),
      },
    });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (composing) {
    return (
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <RoutineComposer
          onBankChanged={refresh}
          exercises={exercises}
          coverage={coverage}
          seed={composing.seed}
          onCancel={() => setComposing(null)}
          onSave={async (input) => {
            const result = composing.seed
              ? await updateRoutineAction(composing.seed.id, input)
              : await createRoutineAction(input);
            if (result.success) {
              setComposing(null);
              setError(null);
              await refresh();
            } else {
              setError(result.error);
            }
          }}
        />
      </div>
    );
  }

  const routines = overview?.routines ?? [];

  return (
    <div className="space-y-4">
      <InfoPanel id="routines" title="How to read this">
        <p>
          Expand a routine to see the exercises it contains and what each one is for. Seeded
          routines are read-only — duplicate one to get an editable copy.
        </p>
      </InfoPanel>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Routines</h2>
        <Button size="sm" onClick={() => setComposing({})}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New routine
        </Button>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {routines.map((routine) => {
          const isOpen = expanded === routine.id;
          return (
            <li key={routine.id}>
              <div className="flex items-center gap-2 px-2 py-2.5 sm:px-4">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${routine.name}`}
                  onClick={() => setExpanded(isOpen ? null : routine.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{routine.name}</span>
                      {routine.isPreset && (
                        <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                          seeded
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {formatMinutes(routine.estDurationMin)} · {routine.exerciseCount} exercises ·{" "}
                      {(Object.keys(routine.coverageVector) as FocusArea[])
                        .map((area) => AREA_LABELS[area])
                        .join(", ")}
                    </span>
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  {routine.isPreset ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Duplicate ${routine.name}`}
                      onClick={async () => {
                        const result = await duplicateRoutineAction(routine.id);
                        if (!result.success) setError(result.error);
                        await refresh();
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${routine.name}`}
                        onClick={() => beginEdit(routine)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ConfirmAction
                        label={`Archive ${routine.name}`}
                        title={`Archive ${routine.name}?`}
                        description="It disappears from the rotation and from anywhere it can be scheduled. Sessions you have already logged from it keep their history."
                        confirmLabel="Archive"
                        onConfirm={async () => {
                          await archiveRoutineAction(routine.id);
                          await refresh();
                        }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </ConfirmAction>
                    </>
                  )}
                </div>
              </div>

              {isOpen && (
                <RoutineDetail routineId={routine.id} coverageVector={routine.coverageVector} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
