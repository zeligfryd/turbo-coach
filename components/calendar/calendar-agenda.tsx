import { CalendarAgendaDay } from "./calendar-agenda-day";
import { CalendarAgendaWeekSummary } from "./calendar-agenda-week-summary";
import type {
  ScheduledWorkout,
  CalendarActivity,
  CalendarHandlers,
  DayContent,
  WeekLoad,
} from "./types";
import type { CalendarWellness } from "@/app/calendar/actions";
import { EMPTY_DAY_CONTENT } from "./types";
import { formatDateKey } from "./utils";

interface CalendarAgendaProps {
  weeks: Date[][];
  contentByDate: Record<string, DayContent>;
  wellnessByDate: Record<string, CalendarWellness>;
  weekLoads: Record<string, WeekLoad>;
  handlers: CalendarHandlers;
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
  contentByDate,
  wellnessByDate,
  weekLoads,
  handlers,
}: CalendarAgendaProps) {
  return (
    <section className="space-y-4">
      {weeks.map((week, weekIndex) => {
        const weekWorkouts: ScheduledWorkout[] = [];
        const weekActivities: CalendarActivity[] = [];
        week.forEach((day) => {
          const dayContent = contentByDate[formatDateKey(day)];
          if (!dayContent) return;
          weekWorkouts.push(...dayContent.workouts);
          weekActivities.push(...dayContent.activities);
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
                return (
                  <CalendarAgendaDay
                    key={key}
                    date={day}
                    content={contentByDate[key] ?? EMPTY_DAY_CONTENT}
                    handlers={handlers}
                  />
                );
              })}
            </div>

            <CalendarAgendaWeekSummary
              weekWorkouts={weekWorkouts}
              weekActivities={weekActivities}
              weekLoad={weekLoads[weekStartKey] ?? null}
              endOfWeekWellness={wellnessByDate[formatDateKey(week[week.length - 1])] ?? null}
            />
          </div>
        );
      })}
    </section>
  );
}
