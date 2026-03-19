import { formatHoursFromSeconds, getWorkoutMetrics } from "./utils";
import type { ScheduledWorkout, CalendarActivity } from "./types";
import type { CalendarWellness } from "@/app/calendar/actions";

function formColor(tsb: number) {
  if (tsb < -30) return "text-red-500";
  if (tsb < -10) return "text-green-500";
  if (tsb < 5) return "text-muted-foreground";
  if (tsb < 25) return "text-blue-500";
  return "text-yellow-500";
}

interface CalendarWeekSummaryProps {
  weekWorkouts: ScheduledWorkout[];
  weekActivities?: CalendarActivity[];
  endOfWeekWellness?: CalendarWellness | null;
}

export function CalendarWeekSummary({ weekWorkouts, weekActivities = [], endOfWeekWellness }: CalendarWeekSummaryProps) {
  const planned = weekWorkouts.reduce(
    (acc, item) => {
      const metrics = getWorkoutMetrics(item.workout);
      acc.totalSeconds += metrics.durationSeconds;
      acc.totalTss += metrics.tss;
      return acc;
    },
    { totalSeconds: 0, totalTss: 0 }
  );

  const actual = weekActivities.reduce(
    (acc, a) => {
      acc.totalSeconds += a.moving_time ?? 0;
      acc.totalTss += a.icu_training_load ?? 0;
      return acc;
    },
    { totalSeconds: 0, totalTss: 0 }
  );

  const hasActual = weekActivities.length > 0;

  return (
    <div className="h-full rounded-lg bg-card shadow-sm p-3 flex flex-col justify-start text-sm">
      <div className="text-muted-foreground">Planned</div>
      <div className="font-medium">{formatHoursFromSeconds(planned.totalSeconds)}</div>
      <div className="text-muted-foreground">TSS {planned.totalTss}</div>
      {hasActual && (
        <>
          <div className="text-green-600 mt-2">Actual</div>
          <div className="font-medium text-green-600">{formatHoursFromSeconds(actual.totalSeconds)}</div>
          <div className="text-green-600/70">TSS {Math.round(actual.totalTss)}</div>
        </>
      )}
      {endOfWeekWellness && (endOfWeekWellness.ctl != null || endOfWeekWellness.atl != null) && (
        <div className="mt-2 pt-2 border-t border-border/50 text-[11px]">
          {endOfWeekWellness.ctl != null && (
            <div className="flex justify-between">
              <span className="text-blue-500">Fitness</span>
              <span className="text-blue-500 font-medium">{Math.round(endOfWeekWellness.ctl)}</span>
            </div>
          )}
          {endOfWeekWellness.atl != null && (
            <div className="flex justify-between">
              <span className="text-purple-500">Fatigue</span>
              <span className="text-purple-500 font-medium">{Math.round(endOfWeekWellness.atl)}</span>
            </div>
          )}
          {endOfWeekWellness.tsb != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Form</span>
              <span className={`${formColor(endOfWeekWellness.tsb)} font-medium`}>
                {Math.round(endOfWeekWellness.tsb)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
