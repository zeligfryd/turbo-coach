"use client";

/**
 * The home screen: what to do today, and one button to record it.
 *
 * This replaces two screens. /dashboard showed six coverage areas all reading
 * "never" — greeting you with six failures before you had agreed to any of it —
 * and /today offered four "Did it" buttons of equal weight, so the first thing
 * asked of you was a choice between things you had no reason to rank.
 *
 * The shape now: one headline that names the day, one recommendation with one
 * full-width action, and a week you can read at a glance. Alternatives exist
 * behind a single line. Nothing here needs setting up, and nothing is coloured
 * as a problem unless it genuinely is one.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, Undo2 } from "lucide-react";

import {
  getTodaySnapshot,
  getTrainingOverview,
  getTrainingWindow,
  logRoutineNowAction,
  recordCompletionAction,
  undoRoutineTodayAction,
  type TodaySnapshot,
  type TrainingOverview,
} from "@/app/training/actions";
import { MODALITY_ICONS, formatMinutes, modalityColor } from "@/lib/training/display";
import type { PlannedItem } from "@/lib/training/types";
import { cn } from "@/lib/utils";

import { RpePrompt } from "./rpe-prompt";
import { WeekStrip } from "./week-strip";

export function TodayClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [items, setItems] = useState<PlannedItem[]>([]);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [justLogged, setJustLogged] = useState<{ blockId: string; name: string } | null>(null);
  // Logging a routine drops it down the staleness ranking, so the recommended
  // card would quietly become a *different* routine the moment you acted on
  // it — the card you just used slides away and something else takes its
  // place, with nothing to say your tap worked. Pinning holds the card still
  // for the rest of the visit.
  const [pinnedRoutineId, setPinnedRoutineId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const [windowResult, overviewResult, snapshotResult] = await Promise.all([
      getTrainingWindow(today, today),
      getTrainingOverview(),
      getTodaySnapshot(),
    ]);
    if (windowResult.success) setItems(windowResult.data.items);
    if (overviewResult.success) setOverview(overviewResult.data);
    if (snapshotResult.success) setSnapshot(snapshotResult.data);
    setIsLoading(false);
  }, [today]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rides = useMemo(() => items.filter((item) => !item.editableHere), [items]);

  // The recommendation: the routine you last acted on if there is one, so the
  // card never moves under your hand; otherwise the stalest.
  const routines = overview?.routines ?? [];
  const suggestion =
    (pinnedRoutineId ? routines.find((r) => r.id === pinnedRoutineId) : null) ?? routines[0] ?? null;
  const alternatives = routines.filter((r) => r.id !== suggestion?.id);

  const log = (routineId: string, name: string) => {
    startTransition(async () => {
      const result = await logRoutineNowAction(routineId);
      if (result.success) setJustLogged({ blockId: result.data.id, name });
      setPinnedRoutineId(routineId);
      setShowAlternatives(false);
      await refresh();
    });
  };

  const undo = () => {
    if (!justLogged) return;
    const { blockId } = justLogged;
    startTransition(async () => {
      await undoRoutineTodayAction(blockId);
      setJustLogged(null);
      await refresh();
    });
  };

  const setRpe = (blockId: string, srpe: number) => {
    startTransition(async () => {
      await recordCompletionAction(blockId, { status: "done", srpe });
      setJustLogged(null);
      await refresh();
    });
  };

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted/40" aria-label="Loading" />;
  }

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // The headline names the day rather than repeating "Today", which the date
  // above already says.
  const headline =
    rides.length === 0 ? "Rest day" : rides.length === 1 ? rides[0].name : `${rides.length} rides`;

  const subhead =
    rides.length > 0
      ? [formatMinutes(rides[0].plannedDurationMin), rides[0].plannedTss ? `TSS ${rides[0].plannedTss}` : null]
          .filter(Boolean)
          .join(" · ")
      : "Nothing on the bike today.";

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{dateLabel}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{headline}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{subhead}</p>
      </header>

      {/* Rides are context, not a task: they are recorded by the sync, and
          reconciliation settles the plan against them without being asked. */}
      {rides.length > 1 &&
        rides.map((ride) => {
          const Icon = MODALITY_ICONS.bike;
          return (
            <div
              key={ride.id}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3"
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: modalityColor("bike") }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{ride.name}</p>
                <p className="text-xs text-muted-foreground">{formatMinutes(ride.plannedDurationMin)}</p>
              </div>
            </div>
          );
        })}

      {/* One recommendation, one action. */}
      {justLogged ? (
        <RpePrompt
          name={justLogged.name}
          onRpe={(value) => setRpe(justLogged.blockId, value)}
          onUndo={undo}
          onDismiss={() => setJustLogged(null)}
          disabled={pending}
        />
      ) : suggestion ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight">{suggestion.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMinutes(suggestion.estDurationMin)} · {suggestion.exerciseCount} exercises
              </p>
            </div>
            {suggestion.completedTodayBlockId ? (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">Done today</span>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">suggested</span>
            )}
          </div>

          {suggestion.completedTodayBlockId ? (
            <button
              type="button"
              onClick={() => {
                const blockId = suggestion.completedTodayBlockId!;
                startTransition(async () => {
                  await undoRoutineTodayAction(blockId);
                  await refresh();
                });
              }}
              disabled={pending}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Undo
            </button>
          ) : (
            <button
              type="button"
              onClick={() => log(suggestion.id, suggestion.name)}
              disabled={pending}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Log it
            </button>
          )}

          {alternatives.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAlternatives((open) => !open)}
                aria-expanded={showAlternatives}
                className="mt-2 flex min-h-[36px] w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Something else
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", showAlternatives && "rotate-180")}
                  aria-hidden="true"
                />
              </button>

              {showAlternatives && (
                <ul className="mt-1 space-y-1 border-t border-border pt-2">
                  {alternatives.map((routine) => (
                    <li key={routine.id}>
                      <button
                        type="button"
                        onClick={() => log(routine.id, routine.name)}
                        disabled={pending}
                        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{routine.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatMinutes(routine.estDurationMin)} · {routine.exerciseCount} exercises
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">Log</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      ) : null}

      {snapshot && <WeekStrip snapshot={snapshot} />}
    </div>
  );
}
