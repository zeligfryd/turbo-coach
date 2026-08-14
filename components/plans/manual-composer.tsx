"use client";

/**
 * Building a plan by hand: weeks down, days across.
 *
 * The first week of a block is laid out from the library. Weeks under it are
 * derived from the week above on the same weekday, which is the chain your
 * progression follows — Tuesday of week 3 comes from Tuesday of week 2.
 *
 * Derivation materialises a real workout at the moment you accept it, and
 * remembers the operators that produced it. Keeping it as a live rule would be
 * neater on paper and wrong in practice: a workout must be draggable without
 * silently rewriting the three weeks below it, which only holds if those weeks
 * are already concrete.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import {
  appendPlanWeek,
  createDerivedWorkout,
  movePlanItem,
  removeDayItem,
  setDayWorkout,
  type WorkoutOption,
} from "@/app/plans/composer-actions";
import { flattenPlanWeeks } from "@/lib/plans/flatten";
import type { PlanWithTree } from "@/lib/plans/types";
import type { VariationOps } from "@/lib/workouts/variation";
import { cn } from "@/lib/utils";

import { DeriveDialog } from "./derive-dialog";
import { WorkoutPickerDialog } from "./workout-picker-dialog";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Slot = { weekId: string; weekNumber: number; dayOfWeek: number };

export function ManualComposer({
  plan,
  workoutsById,
}: {
  plan: PlanWithTree;
  /** Names for the workouts the plan references, resolved on the server. */
  workoutsById: Record<string, { name: string; durationMin: number | null }>;
}) {
  const router = useRouter();
  const weeks = useMemo(() => flattenPlanWeeks(plan), [plan]);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [deriving, setDeriving] = useState<
    (Slot & { sourceWorkoutId: string; sourceName: string }) | null
  >(null);
  const [dragging, setDragging] = useState<{ itemId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.success ? null : (result.error ?? "Something went wrong"));
      if (result.success) router.refresh();
    });

  const label = (slot: Slot) => `Week ${slot.weekNumber} · ${DOW[slot.dayOfWeek]}`;

  /** The same weekday, one week up — the chain a derivation follows. */
  const parentOf = (weekNumber: number, dayOfWeek: number) => {
    const above = weeks.find((w) => w.weekNumber === weekNumber - 1);
    const day = above?.days.find((d) => d.dayOfWeek === dayOfWeek);
    const item = day?.items.find((i) => i.workout_id);
    if (!item?.workout_id) return null;
    return { workoutId: item.workout_id, name: workoutsById[item.workout_id]?.name ?? "Workout" };
  };

  if (weeks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No weeks yet. Set a work/recovery pattern to scaffold the plan.
      </p>
    );
  }

  let lastBlockId: string | null = null;

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[720px] space-y-1">
          <div className="grid grid-cols-[76px_repeat(7,1fr)] gap-1.5">
            <span />
            {DOW.map((day) => (
              <span
                key={day}
                className="pb-1 text-center text-[10px] uppercase tracking-[0.11em] text-muted-foreground"
              >
                {day}
              </span>
            ))}
          </div>

          {weeks.map((week) => {
            const isNewBlock = week.block?.id !== lastBlockId;
            lastBlockId = week.block?.id ?? null;
            const isRecovery = week.block?.goal === "recovery";

            return (
              <div key={week.weekNumber}>
                {isNewBlock && week.block && (
                  <p className="pt-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span className="font-semibold text-foreground">{week.block.name}</span>
                    {" · "}
                    {/* The block's own name usually says which kind it is
                        already — "Recovery 1 · recovery" is the label twice. */}
                    {!/recovery|build/i.test(week.block.name) && (
                      <>{isRecovery ? "recovery" : "work"} · </>
                    )}
                    {week.block.duration_weeks}{" "}
                    {week.block.duration_weeks === 1 ? "week" : "weeks"}
                  </p>
                )}

                <div className="mt-1 grid grid-cols-[76px_repeat(7,1fr)] gap-1.5">
                  <span className="flex items-center text-[11px] text-muted-foreground">
                    Week {week.weekNumber}
                  </span>

                  {DOW.map((_, dayOfWeek) => {
                    const day = week.days.find((d) => d.dayOfWeek === dayOfWeek);
                    const item = day?.items.find((i) => i.workout_id) ?? day?.items[0] ?? null;
                    const workout = item?.workout_id ? workoutsById[item.workout_id] : null;
                    const slot: Slot = {
                      weekId: week.weekId ?? "",
                      weekNumber: week.weekNumber,
                      dayOfWeek,
                    };
                    const parent = parentOf(week.weekNumber, dayOfWeek);

                    return (
                      <div
                        key={dayOfWeek}
                        onDragOver={(event) => dragging && event.preventDefault()}
                        onDrop={() => {
                          if (!dragging || !week.weekId) return;
                          run(() =>
                            movePlanItem({
                              itemId: dragging.itemId,
                              weekId: week.weekId!,
                              dayOfWeek,
                              planId: plan.id,
                            }),
                          );
                          setDragging(null);
                        }}
                        className={cn(
                          "min-h-[64px] rounded-md border p-1.5 text-[11px]",
                          item ? "border-border bg-card" : "border-dashed border-border/50",
                          isRecovery && item && "border-l-2 border-l-emerald-500/60",
                          !isRecovery && item && "border-l-2 border-l-primary/60",
                        )}
                      >
                        {item && workout ? (
                          <div
                            draggable
                            onDragStart={() => setDragging({ itemId: item.id })}
                            onDragEnd={() => setDragging(null)}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <p className="line-clamp-2 font-medium leading-tight">{workout.name}</p>
                            {workout.durationMin && (
                              <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                                {workout.durationMin}m
                              </p>
                            )}
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => removeDayItem(item.id, plan.id))}
                              aria-label={`Remove ${workout.name} from ${label(slot)}`}
                              className="mt-1 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex h-full flex-col gap-1">
                            <button
                              type="button"
                              disabled={!week.weekId || pending}
                              onClick={() => setPicking(slot)}
                              aria-label={`Add a workout to ${label(slot)}`}
                              className="flex flex-1 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground disabled:opacity-40"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            {parent && (
                              // Only offered where there is something above to
                              // derive from — the first week of a plan has no
                              // parent, and neither does an empty day.
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  setDeriving({
                                    ...slot,
                                    sourceWorkoutId: parent.workoutId,
                                    sourceName: parent.name,
                                  })
                                }
                                className="flex items-center justify-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Sparkles className="h-3 w-3" />
                                derive
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => appendPlanWeek(plan.id))}
        className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a week
      </button>

      <WorkoutPickerDialog
        open={picking !== null}
        dayLabel={picking ? label(picking) : ""}
        onClose={() => setPicking(null)}
        onPick={async (workout: WorkoutOption) => {
          if (!picking) return;
          const slot = picking;
          setPicking(null);
          run(() =>
            setDayWorkout({
              weekId: slot.weekId,
              dayOfWeek: slot.dayOfWeek,
              workoutId: workout.id,
              planId: plan.id,
            }),
          );
        }}
      />

      {deriving && (
        <DeriveDialog
          open
          sourceName={deriving.sourceName}
          sourceWorkoutId={deriving.sourceWorkoutId}
          dayLabel={label(deriving)}
          onClose={() => setDeriving(null)}
          onConfirm={async (ops: VariationOps) => {
            const slot = deriving;
            setDeriving(null);
            run(() =>
              createDerivedWorkout({
                sourceWorkoutId: slot.sourceWorkoutId,
                ops,
                weekId: slot.weekId,
                dayOfWeek: slot.dayOfWeek,
                planId: plan.id,
              }),
            );
          }}
        />
      )}
    </div>
  );
}
