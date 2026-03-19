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

interface CalendarAgendaWeekSummaryProps {
  weekWorkouts: ScheduledWorkout[];
  weekActivities?: CalendarActivity[];
  endOfWeekWellness?: CalendarWellness | null;
}

export function CalendarAgendaWeekSummary({ weekWorkouts, weekActivities = [], endOfWeekWellness }: CalendarAgendaWeekSummaryProps) {
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
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Planned</span>
        <span className="font-medium">{formatHoursFromSeconds(planned.totalSeconds)}</span>
        <span className="text-muted-foreground">TSS {planned.totalTss}</span>
      </div>
      {hasActual && (
        <div className="flex items-center justify-between">
          <span className="text-green-600">Actual</span>
          <span className="font-medium text-green-600">{formatHoursFromSeconds(actual.totalSeconds)}</span>
          <span className="text-green-600/70">TSS {Math.round(actual.totalTss)}</span>
        </div>
      )}
      {endOfWeekWellness && (endOfWeekWellness.ctl != null || endOfWeekWellness.atl != null) && (
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          {endOfWeekWellness.ctl != null && (
            <span className="text-blue-500">Fit {Math.round(endOfWeekWellness.ctl)}</span>
          )}
          {endOfWeekWellness.atl != null && (
            <span className="text-purple-500">Fat {Math.round(endOfWeekWellness.atl)}</span>
          )}
          {endOfWeekWellness.tsb != null && (
            <span className={formColor(endOfWeekWellness.tsb)}>
              Form {Math.round(endOfWeekWellness.tsb)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
