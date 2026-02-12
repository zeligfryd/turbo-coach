import { Plus, X } from "lucide-react";
import type { ScheduledWorkout } from "./types";
import { formatDateKey, formatHoursFromSeconds, getWorkoutMetrics } from "./utils";

interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  workouts: ScheduledWorkout[];
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
}

export function CalendarDay({ date, isCurrentMonth, workouts, onAdd, onRemove }: CalendarDayProps) {
  const dateKey = formatDateKey(date);

  return (
    <div
      className={[
        "group relative rounded-lg bg-card shadow-sm p-3 min-h-[120px] flex flex-col gap-2",
        isCurrentMonth ? "text-foreground" : "text-muted-foreground opacity-70",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium">{date.getDate()}</span>
        <button
          onClick={() => onAdd(dateKey)}
          className="opacity-50 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-accent"
          aria-label="Add workout"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {workouts.map((item) => {
          const metrics = getWorkoutMetrics(item.workout);
          return (
            <div
              key={item.id}
              className="rounded-md bg-background px-2 py-1.5 text-xs flex items-start justify-between gap-2 shadow-sm"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{item.workout.name}</div>
                <div className="text-muted-foreground">
                  {formatHoursFromSeconds(metrics.durationSeconds)} • TSS {metrics.tss}
                </div>
              </div>
              <button
                onClick={() => onRemove(item.id)}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
                aria-label="Remove workout"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        {workouts.length === 0 && (
          <div className="text-xs text-muted-foreground">No workouts</div>
        )}
      </div>
    </div>
  );
}
