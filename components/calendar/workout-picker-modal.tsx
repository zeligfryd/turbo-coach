"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Workout } from "@/lib/workouts/types";
import { getWorkoutLibrary } from "@/app/calendar/actions";
import { formatHoursFromSeconds, getWorkoutMetrics } from "./utils";

type WorkoutTab = "presets" | "favorites" | "custom";

interface WorkoutPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectWorkout: (workoutId: string) => void;
}

export function WorkoutPickerModal({ open, onClose, onSelectWorkout }: WorkoutPickerModalProps) {
  const [activeTab, setActiveTab] = useState<WorkoutTab>("presets");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [library, setLibrary] = useState<{
    presets: Workout[];
    favorites: Workout[];
    custom: Workout[];
  }>({ presets: [], favorites: [], custom: [] });

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    getWorkoutLibrary().then((result) => {
      if (result.success) {
        setLibrary({
          presets: result.presets,
          favorites: result.favorites,
          custom: result.custom,
        });
      }
      setIsLoading(false);
    });
  }, [open]);

  const workouts = library[activeTab];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return workouts;
    return workouts.filter((workout) => workout.name.toLowerCase().includes(term));
  }, [workouts, search]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select a workout</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "presets", label: "Presets" },
              { id: "favorites", label: "Favorites" },
              { id: "custom", label: "My Workouts" },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                className={cn(
                  "rounded-lg",
                  activeTab === tab.id && "bg-accent text-accent-foreground"
                )}
                onClick={() => setActiveTab(tab.id as WorkoutTab)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <Input
            placeholder="Search workouts..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="max-h-[60vh] overflow-auto space-y-2 pr-2">
            {isLoading && <div className="text-sm text-muted-foreground">Loading workouts...</div>}
            {!isLoading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground">No workouts found.</div>
            )}
            {filtered.map((workout) => {
              const metrics = getWorkoutMetrics(workout);
              return (
                <button
                  key={workout.id}
                  className="w-full text-left rounded-lg bg-card shadow-sm p-3 hover:bg-accent/30 transition-colors"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectWorkout(workout.id);
                  }}
                >
                  <div className="font-medium">{workout.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatHoursFromSeconds(metrics.durationSeconds)} • TSS {metrics.tss}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
