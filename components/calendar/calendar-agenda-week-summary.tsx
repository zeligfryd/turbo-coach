import { ApplyWeekDialog } from "./apply-week-dialog";
import { formatHoursFromSeconds, getWorkoutMetrics } from "./utils";
import type { ScheduledWorkout, CalendarActivity, WeekLoad } from "./types";
import { modalityColor } from "@/lib/training/display";
import { MODALITY_LABELS } from "@/lib/training/taxonomy";
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
  weekLoad?: WeekLoad | null;
  endOfWeekWellness?: CalendarWellness | null;
  /** Monday of this row, for applying a saved week. */
  weekStart?: string;
  onWeekApplied?: () => void;
}

export function CalendarAgendaWeekSummary({ weekWorkouts, weekActivities = [], weekLoad = null, endOfWeekWellness, weekStart, onWeekApplied }: CalendarAgendaWeekSummaryProps) {
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

  const loadRows = weekLoad ? weekLoad.byModality.filter((m) => m.load > 0) : [];

  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs flex flex-col gap-1">
      {/* The phone layout needs this as much as the grid does — arguably more,
          since filling a week by hand on a phone is the worst version of it. */}
      {weekStart && (
        <div className="flex justify-end">
          <ApplyWeekDialog weekStart={weekStart} onApplied={onWeekApplied} />
        </div>
      )}
      {weekLoad && weekLoad.totalLoad > 0 && (
        <div className="flex items-center justify-between gap-2 pb-1 mb-1 border-b border-border/50">
          <span className="text-muted-foreground">Session load</span>
          <span className="flex items-center gap-1.5">
            {loadRows.map((m) => (
              <span
                key={m.modality}
                title={`${MODALITY_LABELS[m.modality]} ${m.load}`}
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.max(6, (m.load / weekLoad.totalLoad) * 48)}px`,
                  backgroundColor: modalityColor(m.modality),
                }}
              />
            ))}
            <span className="font-medium tabular-nums">{weekLoad.totalLoad.toLocaleString("en-GB")}</span>
          </span>
        </div>
      )}
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
