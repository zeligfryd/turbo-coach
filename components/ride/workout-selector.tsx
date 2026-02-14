"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Workout } from "@/lib/workouts/types";
import { calculateTotalDurationFromItems, formatDurationSeconds } from "@/lib/workouts/utils";

type WorkoutSelectorProps = {
  workouts: Workout[];
  onSelect: (workout: Workout) => void;
};

export function WorkoutSelector({ workouts, onSelect }: WorkoutSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return workouts;
    return workouts.filter(
      (workout) =>
        workout.name.toLowerCase().includes(normalized) ||
        workout.category.toLowerCase().includes(normalized),
    );
  }, [query, workouts]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Load Workout
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Workout</DialogTitle>
          <DialogDescription>
            Select a workout to run ERG targets while keeping the same ride page.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            placeholder="Search workouts"
          />
        </div>

        <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
          {filtered.map((workout) => {
            const durationSeconds =
              workout.duration_seconds ?? calculateTotalDurationFromItems(workout.intervals);
            return (
              <button
                key={workout.id}
                type="button"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-left transition hover:bg-accent"
                onClick={() => {
                  onSelect(workout);
                  setOpen(false);
                }}
              >
                <p className="font-medium">{workout.name}</p>
                <p className="text-xs text-muted-foreground">
                  {workout.category} · {formatDurationSeconds(durationSeconds)}
                </p>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
