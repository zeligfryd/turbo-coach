import { CalendarAgendaDay } from "./calendar-agenda-day";
import { CalendarAgendaWeekSummary } from "./calendar-agenda-week-summary";
import type { ScheduledWorkout } from "./types";
import { formatDateKey } from "./utils";

interface CalendarAgendaProps {
  weeks: Date[][];
  scheduledByDate: Record<string, ScheduledWorkout[]>;
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
}

function formatWeekRangeLabel(week: Date[]) {
  const start = week[0];
  const end = week[week.length - 1];
  const startLabel = start.toLocaleString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleString("en-US", { month: "short", day: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

export function CalendarAgenda({
  weeks,
  scheduledByDate,
  onAdd,
  onRemove,
}: CalendarAgendaProps) {
  return (
    <section className="space-y-4">
      {weeks.map((week, weekIndex) => {
        const weekWorkouts: ScheduledWorkout[] = [];
        week.forEach((day) => {
          const key = formatDateKey(day);
          const dayItems = scheduledByDate[key] ?? [];
          weekWorkouts.push(...dayItems);
        });

        const weekStartKey = formatDateKey(week[0]);
        return (
          <div
            key={`week-${weekIndex}`}
            className="space-y-2"
            data-week-start={weekStartKey}
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground px-1">
              {formatWeekRangeLabel(week)}
            </div>

            <div className="space-y-2">
              {week.map((day) => {
                const key = formatDateKey(day);
                const items = scheduledByDate[key] ?? [];
                return (
                  <CalendarAgendaDay
                    key={key}
                    date={day}
                    workouts={items}
                    onAdd={onAdd}
                    onRemove={onRemove}
                  />
                );
              })}
            </div>

            <CalendarAgendaWeekSummary weekWorkouts={weekWorkouts} />
          </div>
        );
      })}
    </section>
  );
}
