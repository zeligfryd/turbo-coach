import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarDay, WorkoutDragOverlay, RaceDragOverlay } from "./calendar-day";
import { CalendarWeekSummary } from "./calendar-week-summary";
import type { ScheduledWorkout, CalendarActivity, CalendarRaceEvent } from "./types";
import type { Workout } from "@/lib/workouts/types";
import type { CalendarWellness } from "@/app/calendar/actions";
import { formatDateKey } from "./utils";

type DragItem =
  | { type: "workout"; item: ScheduledWorkout }
  | { type: "race"; item: CalendarRaceEvent };

interface CalendarGridProps {
  weeks: Date[][];
  scheduledByDate: Record<string, ScheduledWorkout[]>;
  activitiesByDate: Record<string, CalendarActivity[]>;
  wellnessByDate: Record<string, CalendarWellness>;
  racesByDate: Record<string, CalendarRaceEvent[]>;
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
  onRescheduleWorkout?: (scheduledWorkoutId: string, newDate: string) => void;
  onRescheduleRace?: (raceId: string, newDate: string) => void;
  onWorkoutClick?: (workout: Workout) => void;
  onActivityClick?: (activityId: string) => void;
  onRaceClick?: (raceId: string) => void;
  onAddRace?: (dateKey: string) => void;
}

const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"];

export function CalendarGrid({
  weeks,
  scheduledByDate,
  activitiesByDate,
  wellnessByDate,
  racesByDate,
  onAdd,
  onRemove,
  onRescheduleWorkout,
  onRescheduleRace,
  onWorkoutClick,
  onActivityClick,
  onRaceClick,
  onAddRace,
}: CalendarGridProps) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null);

  // Require 8px of movement before starting drag — prevents accidental drags on click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    const [type, itemId] = id.split(":");

    if (type === "workout") {
      for (const items of Object.values(scheduledByDate)) {
        const found = items.find((w) => w.id === itemId);
        if (found) {
          setActiveItem({ type: "workout", item: found });
          return;
        }
      }
    } else if (type === "race") {
      for (const items of Object.values(racesByDate)) {
        const found = items.find((r) => r.id === itemId);
        if (found) {
          setActiveItem({ type: "race", item: found });
          return;
        }
      }
    }
  }, [scheduledByDate, racesByDate]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const dragId = String(active.id);
    const dropId = String(over.id);

    if (!dropId.startsWith("day:")) return;
    const newDate = dropId.slice(4); // "day:2026-04-07" → "2026-04-07"
    const [type, itemId] = dragId.split(":");

    if (type === "workout") {
      // Find current date to skip no-ops
      for (const [dateKey, items] of Object.entries(scheduledByDate)) {
        if (items.some((w) => w.id === itemId) && dateKey !== newDate) {
          onRescheduleWorkout?.(itemId, newDate);
          return;
        }
      }
    } else if (type === "race") {
      for (const [dateKey, items] of Object.entries(racesByDate)) {
        if (items.some((r) => r.id === itemId) && dateKey !== newDate) {
          onRescheduleRace?.(itemId, newDate);
          return;
        }
      }
    }
  }, [scheduledByDate, racesByDate, onRescheduleWorkout, onRescheduleRace]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
                  const races = racesByDate[key] ?? [];
                  return (
                    <CalendarDay
                      key={key}
                      date={day}
                      workouts={items}
                      activities={activities}
                      races={races}
                      onAdd={onAdd}
                      onRemove={onRemove}
                      onWorkoutClick={onWorkoutClick}
                      onActivityClick={onActivityClick}
                      onRaceClick={onRaceClick}
                      onAddRace={onAddRace}
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

      <DragOverlay dropAnimation={null}>
        {activeItem?.type === "workout" && (
          <WorkoutDragOverlay item={activeItem.item} />
        )}
        {activeItem?.type === "race" && (
          <RaceDragOverlay race={activeItem.item} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
