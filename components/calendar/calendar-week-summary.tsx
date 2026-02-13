import { formatHoursFromSeconds, getWorkoutMetrics } from "./utils";
import type { ScheduledWorkout } from "./types";

interface CalendarWeekSummaryProps {
  weekWorkouts: ScheduledWorkout[];
}

export function CalendarWeekSummary({ weekWorkouts }: CalendarWeekSummaryProps) {
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
    <div className="h-full rounded-lg bg-card shadow-sm p-3 flex flex-col justify-start text-sm">
      <div className="text-muted-foreground">Week Total</div>
      <div className="font-medium">{formatHoursFromSeconds(totals.totalSeconds)}</div>
      <div className="text-muted-foreground">TSS {totals.totalTss}</div>
    </div>
  );
}
