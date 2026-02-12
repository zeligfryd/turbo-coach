import { CalendarDay } from "./calendar-day";
import { CalendarWeekSummary } from "./calendar-week-summary";
import type { ScheduledWorkout } from "./types";
import { formatDateKey } from "./utils";

interface CalendarGridProps {
  weeks: Date[][];
  focusMonth: number;
  scheduledByDate: Record<string, ScheduledWorkout[]>;
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
}

const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"];

export function CalendarGrid({
  weeks,
  focusMonth,
  scheduledByDate,
  onAdd,
  onRemove,
}: CalendarGridProps) {
  return (
    <section className="space-y-4">
      <div className="sticky top-0 z-10 bg-background pt-1 pb-2">
        <div className="grid grid-cols-8 gap-3 text-xs uppercase tracking-wide text-muted-foreground">
          {weekDayLabels.map((label) => (
            <div key={label} className="px-1">
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
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
              className="grid grid-cols-8 gap-3"
              data-week-start={weekStartKey}
            >
              {week.map((day) => {
                const key = formatDateKey(day);
                const items = scheduledByDate[key] ?? [];
                return (
                  <CalendarDay
                    key={key}
                    date={day}
                    isCurrentMonth={day.getMonth() === focusMonth}
                    workouts={items}
                    onAdd={onAdd}
                    onRemove={onRemove}
                  />
                );
              })}
              <CalendarWeekSummary weekWorkouts={weekWorkouts} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
