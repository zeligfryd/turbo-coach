"use client";

/**
 * Choosing what goes on a day: search the library, or build something new.
 *
 * Creating opens the real builder in an overlay — the same component the
 * /workouts/builder route renders, not a cut-down copy. It reports the workout
 * it saved, which goes straight onto the day you were filling, so composing a
 * plan never sends you somewhere else and back.
 */

import { useEffect, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkoutBuilder } from "@/components/workouts/workout-builder";
import { listComposerWorkouts, type WorkoutOption } from "@/app/plans/composer-actions";
import { cn } from "@/lib/utils";

export function WorkoutPickerDialog({
  open,
  dayLabel,
  onClose,
  onPick,
  onCreated,
}: {
  open: boolean;
  dayLabel: string;
  onClose: () => void;
  onPick: (workout: WorkoutOption) => Promise<void>;
  /** A workout built here goes straight onto the day being filled. */
  onCreated: (workoutId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [building, setBuilding] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutOption[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Debounced so typing does not fire a query per keystroke.
    const timer = setTimeout(async () => {
      const result = await listComposerWorkouts(search);
      if (!cancelled && result.success) setWorkouts(result.workouts);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a workout</DialogTitle>
          <DialogDescription>{dayLabel}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your library"
            aria-label="Search workouts"
            className="min-h-[42px] w-full bg-transparent text-sm outline-none"
          />
        </div>

        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {workouts.length === 0 && (
            <li className="px-1 py-6 text-center text-sm text-muted-foreground">
              {search ? "Nothing matches that." : "No workouts yet."}
            </li>
          )}
          {workouts.map((workout) => (
            <li key={workout.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => onPick(workout))}
                className={cn(
                  "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-lg px-3 text-left transition-colors",
                  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:opacity-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{workout.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[
                      workout.durationMin ? `${workout.durationMin}m` : null,
                      workout.avgIntensity ? `${workout.avgIntensity}% avg` : null,
                      workout.category,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create a new workout
        </button>
      </DialogContent>

      {/*
        The real builder, in an overlay. Rendered as a sibling dialog rather
        than nested inside the picker so it gets the full width it needs —
        interval rows are duration, type, power and cadence on one line.
      */}
      <Dialog open={building} onOpenChange={(next) => !next && setBuilding(false)}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New workout</DialogTitle>
            <DialogDescription>It will be added to {dayLabel} when you save.</DialogDescription>
          </DialogHeader>
          <WorkoutBuilder
            embedded
            mode="create"
            onCancel={() => setBuilding(false)}
            onSaved={async (workoutId) => {
              setBuilding(false);
              await onCreated(workoutId);
            }}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
