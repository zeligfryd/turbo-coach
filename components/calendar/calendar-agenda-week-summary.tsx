import { formatHoursFromSeconds, getWorkoutMetrics } from "./utils";
import type { ScheduledWorkout } from "./types";

interface CalendarAgendaWeekSummaryProps {
  weekWorkouts: ScheduledWorkout[];
}

export function CalendarAgendaWeekSummary({ weekWorkouts }: CalendarAgendaWeekSummaryProps) {
  const totals = weekWorkouts.reduce(
    (acc, item) => {
      const metrics = getWorkoutMetrics(item.workout);
      acc.totalSeconds += metrics.durationSeconds;
      acc.totalTss += metrics.tss;
      return acc;
    },
    { totalSeconds: 0, totalTss: 0 }
  );

  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs flex items-center justify-between">
      <span className="text-muted-foreground">Week total</span>
      <span className="font-medium">{formatHoursFromSeconds(totals.totalSeconds)}</span>
      <span className="text-muted-foreground">TSS {totals.totalTss}</span>
    </div>
  );
}
