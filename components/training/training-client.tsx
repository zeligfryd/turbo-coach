"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CoverageView } from "@/components/training/coverage-view";
import { TemplateManager } from "@/components/training/template-manager";
import { RoutineRotation } from "@/components/training/routine-rotation";
import {
  getTrainingOverview,
  logRoutineNowAction,
  resetAllAreaGoalsAction,
  scheduleRoutineAction,
  setAreaGoalAction,
  undoRoutineTodayAction,
  type TrainingOverview,
} from "@/app/training/actions";
import type { FocusArea } from "@/lib/training/taxonomy";

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

  // Failures were previously swallowed here, which is how a broken tick looked
  // exactly like a working one.
  const run = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    const result = await action();
    setError(result.success ? null : (result.error ?? "Something went wrong"));
    await refresh();
  };

  const handleLogNow = (routineId: string) => run(() => logRoutineNowAction(routineId));

  const handleUndo = (blockId: string) => run(() => undoRoutineTodayAction(blockId));

  const handleSchedule = (routineId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    return run(() => scheduleRoutineAction(routineId, today));
  };

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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What to do next</h2>
        <RoutineRotation
          routines={overview.routines}
          coverage={overview.coverage}
          onLogNow={handleLogNow}
          onUndo={handleUndo}
          onSchedule={handleSchedule}
        />
        <p className="text-sm">
          <Link href="/training/routines" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Manage routines
          </Link>
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Coverage</h2>
          <p className="text-sm text-muted-foreground">
            Six areas, one target interval each.
          </p>
        </div>
        <CoverageView
          coverage={overview.coverage}
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
