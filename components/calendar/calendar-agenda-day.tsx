import { useState } from "react";
import { Plus, X, CheckCircle, Trash2 } from "lucide-react";
import { MiniIntensityChart } from "@/components/workouts/mini-intensity-chart";
import { flattenBuilderItems } from "@/lib/workouts/utils";
import type { ScheduledWorkout, CalendarActivity } from "./types";
import type { Workout } from "@/lib/workouts/types";
import {
  getCalendarDayLabelParts,
  formatDateKey,
  formatHoursFromSeconds,
  getWorkoutMetrics,
} from "./utils";

interface CalendarAgendaDayProps {
  date: Date;
  workouts: ScheduledWorkout[];
  activities?: CalendarActivity[];
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
  onWorkoutClick?: (workout: Workout) => void;
  onActivityClick?: (activityId: string) => void;
}

export function CalendarAgendaDay({ date, workouts, activities = [], onAdd, onRemove, onWorkoutClick, onActivityClick }: CalendarAgendaDayProps) {
  const dateKey = formatDateKey(date);
  const weekday = date.toLocaleString("en-US", { weekday: "short" });
  const { monthPrefix, dayOfMonth } = getCalendarDayLabelParts(date);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <div
      className="rounded-lg bg-card shadow-sm px-2.5 py-2 flex items-start gap-2 text-foreground"
      data-day-date={dateKey}
    >
      <div className="min-w-[72px]">
        <div className="text-xs uppercase text-muted-foreground">{weekday}</div>
        <div className="text-lg leading-none text-muted-foreground">
          {monthPrefix ? (
            <>
              <span className="font-bold text-foreground">{monthPrefix}</span> {dayOfMonth}
            </>
          ) : (
            dayOfMonth
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-2">
        <div className="flex justify-end">
          <button
            onClick={() => onAdd(dateKey)}
            className="p-1 rounded-md hover:bg-accent"
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
                className="rounded-md bg-background px-1.5 py-1 text-xs flex items-start justify-between gap-1.5 shadow-sm cursor-pointer hover:ring-1 hover:ring-primary/40 transition-shadow"
                onClick={() => onWorkoutClick?.(item.workout)}
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-bold leading-tight">{item.workout.name}</div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                    {formatHoursFromSeconds(metrics.durationSeconds)} • TSS {metrics.tss}
                  </div>
                  <div className="mt-1">
                    <MiniIntensityChart
                      intervals={flattenBuilderItems(item.workout.intervals)}
                      height={12}
                    />
                  </div>
                </div>
                {confirmingId === item.id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingId(null); onRemove(item.id); }}
                    className="p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20"
                    aria-label="Confirm remove"
                    onBlur={() => setConfirmingId(null)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingId(item.id); }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground"
                    aria-label="Remove workout"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {activities.map((activity) => {
            const durationStr = activity.moving_time ? formatHoursFromSeconds(activity.moving_time) : null;
            const distanceKm = activity.distance != null ? (activity.distance / 1000).toFixed(1) : null;
            const topLine = [durationStr, distanceKm ? `${distanceKm} km` : null].filter(Boolean).join(" · ");
            const midParts = [
              activity.avg_hr != null ? `${activity.avg_hr}bpm` : null,
              activity.avg_power != null ? `${activity.avg_power}w` : null,
            ].filter(Boolean);
            const tss = activity.icu_training_load != null ? Math.round(activity.icu_training_load) : null;

            return (
              <div
                key={activity.id}
                className="rounded-md bg-green-500/10 border border-green-500/20 px-1.5 py-1 text-xs shadow-sm cursor-pointer hover:ring-1 hover:ring-green-500/40 transition-shadow"
                onClick={() => onActivityClick?.(activity.id)}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
                  <span className="truncate text-[11px] font-bold leading-tight">
                    {topLine || "—"}
                  </span>
                </div>
                {midParts.length > 0 && (
                  <div className="text-[10px] text-blue-600 mt-0.5">
                    {midParts.join(" ")}
                  </div>
                )}
                {tss != null && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Load {tss}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {activity.name ?? activity.type ?? "Activity"}
                </div>
              </div>
            );
          })}

          {workouts.length === 0 && activities.length === 0 && (
            <div className="text-xs text-muted-foreground">No workouts</div>
          )}
        </div>
      </div>
    </div>
  );
}
