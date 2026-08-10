"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Plus } from "lucide-react";

import { RoutineComposer } from "@/components/training/routine-composer";
import { InfoPanel } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import {
  archiveRoutineAction,
  createRoutineAction,
  getExerciseBank,
  getTrainingOverview,
  type BankExercise,
  type TrainingOverview,
} from "@/app/training/actions";
import { AREA_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import { formatMinutes } from "@/lib/training/display";
import type { AreaCoverage } from "@/lib/training/types";

export function RoutinesClient() {
  const [exercises, setExercises] = useState<BankExercise[]>([]);
  const [coverage, setCoverage] = useState<AreaCoverage[]>([]);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [isComposing, setIsComposing] = useState(false);
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <InfoPanel id="routines" title="How to read this">
        <p>
          Exercises are ordered by which focus area has gone longest without work, so the top of the
          list is what is most overdue.
        </p>
        <p>Seeded exercises and routines are read-only. Duplicate one to make it yours.</p>
      </InfoPanel>

      {isComposing ? (
        <RoutineComposer
          exercises={exercises}
          coverage={coverage}
          onCancel={() => setIsComposing(false)}
          onSave={async (input) => {
            const result = await createRoutineAction(input);
            if (result.success) {
              setIsComposing(false);
              await refresh();
            } else {
              setError(result.error);
            }
          }}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Routines</h2>
            <Button size="sm" onClick={() => setIsComposing(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New routine
            </Button>
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {(overview?.routines ?? []).map((routine) => (
              <li key={routine.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{routine.name}</span>
                    {routine.isPreset && (
                      <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                        seeded
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {formatMinutes(routine.estDurationMin)} · {routine.exerciseCount} exercises ·{" "}
                    {(Object.keys(routine.coverageVector) as FocusArea[])
                      .map((area) => AREA_LABELS[area])
                      .join(", ")}
                  </p>
                </div>
                {!routine.isPreset && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Archive ${routine.name}`}
                    onClick={async () => {
                      await archiveRoutineAction(routine.id);
                      await refresh();
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
