"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CoverageView } from "@/components/training/coverage-view";
import { NextRoutineCallout, RoutineRotation } from "@/components/training/routine-rotation";
import {
  getTrainingOverview,
  logRoutineNowAction,
  resetAllAreaGoalsAction,
  scheduleRoutineAction,
  setAreaGoalAction,
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

  const handleLogNow = async (routineId: string) => {
    await logRoutineNowAction(routineId);
    await refresh();
  };

  const handleSchedule = async (routineId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    await scheduleRoutineAction(routineId, today);
    await refresh();
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        Could not load your coverage: {error}
      </p>
    );
  }

  if (!overview) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">What to do next</h2>
          <NextRoutineCallout routine={overview.routines[0]} />
        </div>
        <RoutineRotation
          routines={overview.routines}
          onLogNow={handleLogNow}
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
    </div>
  );
}
