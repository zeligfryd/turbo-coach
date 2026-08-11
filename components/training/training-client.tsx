"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { WeekShape } from "@/components/training/week-shape";
import { TemplateManager } from "@/components/training/template-manager";
import {
  getTrainingOverview,
  resetAllAreaGoalsAction,
  setAreaGoalAction,
  type TrainingOverview,
} from "@/app/training/actions";
import type { FocusArea } from "@/lib/training/taxonomy";
import type { RoutineShape } from "@/lib/training/cadence";

export function TrainingClient() {
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const result = await getTrainingOverview();
    if (result.success) {
      setOverview(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSetTarget = async (area: FocusArea, targetDays: number) => {
    await setAreaGoalAction(area, targetDays);
    await refresh();
  };

  const handleResetAll = async () => {
    await resetAllAreaGoalsAction();
    await refresh();
  };

  // How many sessions the shape comes to depends on how broad your routines
  // are: the same demand takes fewer sessions when each covers four areas.
  const routineShapes: RoutineShape[] = (overview?.routines ?? []).map((routine) => ({
    areaCount: Object.keys(routine.coverageVector).length,
    durationMin: routine.estDurationMin,
  }));

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!overview) {
    return error ? (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        Could not load your coverage: {error}
      </p>
    ) : null;
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {/*
        "What to do next" moved to the home screen, where it is one card with
        one button. This page is now only the parts you come to deliberately:
        the two libraries, the targets, and the templates.
      */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/training/routines"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <span className="block text-sm font-semibold">Routines</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            The sets of exercises you rotate through.
          </span>
        </Link>
        <Link
          href="/training/exercises"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <span className="block text-sm font-semibold">Exercises</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Every movement a routine can draw on.
          </span>
        </Link>
      </section>

      <section>
        <WeekShape
          coverage={overview.coverage}
          routines={routineShapes}
          onSetTarget={handleSetTarget}
          onResetAll={handleResetAll}
        />
      </section>

      <section>
        <TemplateManager />
      </section>
    </div>
  );
}
