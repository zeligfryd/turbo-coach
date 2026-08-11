import { formatHoursFromSeconds, getWorkoutMetrics } from "./utils";
import type { ScheduledWorkout, CalendarActivity, WeekLoad } from "./types";
import type { CalendarWellness } from "@/app/calendar/actions";
import { Hint } from "@/components/training/hint";
import { modalityColor } from "@/lib/training/display";
import { MODALITY_LABELS } from "@/lib/training/taxonomy";

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
  weekLoad?: WeekLoad | null;
  endOfWeekWellness?: CalendarWellness | null;
}

export function CalendarWeekSummaryRow({
  weekWorkouts,
  weekActivities = [],
  weekLoad = null,
  endOfWeekWellness,
}: CalendarWeekSummaryProps) {
  const planned = weekWorkouts.reduce(
    (acc, item) => {
      const metrics = getWorkoutMetrics(item.workout);
      acc.totalSeconds += metrics.durationSeconds;
      acc.totalTss += metrics.tss;
      return acc;
    },
    { totalSeconds: 0, totalTss: 0 },
  );
  const actual = weekActivities.reduce(
    (acc, a) => {
      acc.totalSeconds += a.moving_time ?? 0;
      acc.totalTss += a.icu_training_load ?? 0;
      return acc;
    },
    { totalSeconds: 0, totalTss: 0 },
  );
  const hasActual = weekActivities.length > 0;
  const loadRows = weekLoad ? weekLoad.byModality.filter((m) => m.load > 0) : [];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-1.5 text-[11px]">
      <span className="text-muted-foreground">Week</span>
      <span>
        <span className="text-muted-foreground">Planned </span>
        <span className="font-medium tabular-nums">
          {formatHoursFromSeconds(planned.totalSeconds)}
        </span>
        <span className="text-muted-foreground"> · TSS {planned.totalTss}</span>
      </span>
      {hasActual && (
        <span className="text-green-600">
          Actual{" "}
          <span className="font-medium tabular-nums">
            {formatHoursFromSeconds(actual.totalSeconds)}
          </span>{" "}
          · TSS {Math.round(actual.totalTss)}
        </span>
      )}
      {weekLoad && weekLoad.totalLoad > 0 && (
        <span className="flex items-center gap-1.5">
          <Hint term="session_load" underline={false} className="text-muted-foreground">
            Load
          </Hint>
          <span className="flex items-center gap-[2px]">
            {loadRows.map((m) => (
              <span
                key={m.modality}
                title={`${MODALITY_LABELS[m.modality]} ${m.load}`}
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.max(5, (m.load / weekLoad.totalLoad) * 56)}px`,
                  backgroundColor: modalityColor(m.modality),
                }}
              />
            ))}
          </span>
          <span className="font-medium tabular-nums">
            {weekLoad.totalLoad.toLocaleString("en-GB")}
          </span>
        </span>
      )}
      {endOfWeekWellness?.ctl != null && (
        <span className="ml-auto flex items-center gap-3 tabular-nums">
          <span className="text-blue-500">Fitness {Math.round(endOfWeekWellness.ctl)}</span>
          {endOfWeekWellness.atl != null && (
            <span className="text-purple-500">Fatigue {Math.round(endOfWeekWellness.atl)}</span>
          )}
          {endOfWeekWellness.tsb != null && (
            <span className={formColor(endOfWeekWellness.tsb)}>
              Form {Math.round(endOfWeekWellness.tsb)}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function CalendarWeekSummary({ weekWorkouts, weekActivities = [], weekLoad = null, endOfWeekWellness }: CalendarWeekSummaryProps) {
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
      {weekLoad && weekLoad.totalLoad > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <Hint term="session_load" className="text-[11px] text-muted-foreground" side="left">
            Session load
          </Hint>
          <div className="font-medium tabular-nums">{weekLoad.totalLoad.toLocaleString("en-GB")}</div>
          <div className="mt-1 flex flex-col gap-1">
            {weekLoad.byModality
              .filter((m) => m.load > 0)
              .map((m) => {
                const share = (m.load / weekLoad.totalLoad) * 100;
                return (
                  <div key={m.modality} className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: modalityColor(m.modality) }}
                      aria-hidden="true"
                    />
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${share}%`, backgroundColor: modalityColor(m.modality) }}
                      />
                    </span>
                    <span className="w-8 text-right text-[9px] tabular-nums text-muted-foreground">
                      {Math.round(share)}%
                    </span>
                    <span className="sr-only">{MODALITY_LABELS[m.modality]}</span>
                  </div>
                );
              })}
          </div>
        </div>
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
