import { CalendarDay } from "./calendar-day";
import { CalendarWeekSummary } from "./calendar-week-summary";
import type { ScheduledWorkout, CalendarActivity } from "./types";
import type { Workout } from "@/lib/workouts/types";
import type { CalendarWellness } from "@/app/calendar/actions";
import { formatDateKey } from "./utils";

interface CalendarGridProps {
  weeks: Date[][];
  scheduledByDate: Record<string, ScheduledWorkout[]>;
  activitiesByDate: Record<string, CalendarActivity[]>;
  wellnessByDate: Record<string, CalendarWellness>;
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
  onWorkoutClick?: (workout: Workout) => void;
}

const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"];

export function CalendarGrid({
  weeks,
  scheduledByDate,
  activitiesByDate,
  wellnessByDate,
  onAdd,
  onRemove,
  onWorkoutClick,
}: CalendarGridProps) {
  return (
    <section className="space-y-4">
      <div className="sticky top-0 z-10 bg-background pt-1 pb-2" data-calendar-sticky-header>
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
          const weekActivities: CalendarActivity[] = [];
          week.forEach((day) => {
            const key = formatDateKey(day);
            weekWorkouts.push(...(scheduledByDate[key] ?? []));
            weekActivities.push(...(activitiesByDate[key] ?? []));
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
                const activities = activitiesByDate[key] ?? [];
                return (
                  <CalendarDay
                    key={key}
                    date={day}
                    workouts={items}
                    activities={activities}
                    onAdd={onAdd}
                    onRemove={onRemove}
                    onWorkoutClick={onWorkoutClick}
                  />
                );
              })}
              <CalendarWeekSummary
                weekWorkouts={weekWorkouts}
                weekActivities={weekActivities}
                endOfWeekWellness={wellnessByDate[formatDateKey(week[week.length - 1])] ?? null}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
