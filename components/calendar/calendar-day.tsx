import { Plus, X } from "lucide-react";
import { MiniIntensityChart } from "@/components/workouts/mini-intensity-chart";
import { flattenBuilderItems } from "@/lib/workouts/utils";
import type { ScheduledWorkout } from "./types";
import {
  getCalendarDayLabelParts,
  formatDateKey,
  formatHoursFromSeconds,
  getWorkoutMetrics,
} from "./utils";

interface CalendarDayProps {
  date: Date;
  workouts: ScheduledWorkout[];
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
}

export function CalendarDay({ date, workouts, onAdd, onRemove }: CalendarDayProps) {
  const dateKey = formatDateKey(date);
  const { monthPrefix, dayOfMonth } = getCalendarDayLabelParts(date);

  return (
    <div
      className="group relative rounded-lg bg-card shadow-sm px-2 py-2 min-h-[120px] flex flex-col gap-2 text-foreground"
      data-day-date={dateKey}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm text-muted-foreground">
          {monthPrefix ? (
            <>
              <span className="font-bold text-foreground">{monthPrefix}</span>{" "}
              {dayOfMonth}
            </>
          ) : (
            dayOfMonth
          )}
        </span>
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
              className="rounded-md bg-background px-1.5 py-1 text-xs flex items-start justify-between gap-1.5 shadow-sm"
            >
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold leading-tight">{item.workout.name}</div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatHoursFromSeconds(metrics.durationSeconds)} • TSS {metrics.tss}
                </div>
                <div className="mt-1">
                  <MiniIntensityChart intervals={flattenBuilderItems(item.workout.intervals)} height={12} />
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
