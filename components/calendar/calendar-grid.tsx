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
import { BlockDragOverlay } from "@/components/training/block-card";
import type {
  ScheduledWorkout,
  CalendarActivity,
  CalendarRaceEvent,
  CalendarHandlers,
  DayContent,
  PlannedItem,
  WeekLoad,
} from "./types";
import type { CalendarWellness } from "@/app/calendar/actions";
import { EMPTY_DAY_CONTENT } from "./types";
import { formatDateKey } from "./utils";

type DragItem =
  | { type: "workout"; item: ScheduledWorkout }
  | { type: "race"; item: CalendarRaceEvent }
  | { type: "block"; item: PlannedItem };

interface CalendarGridProps {
  weeks: Date[][];
  contentByDate: Record<string, DayContent>;
  wellnessByDate: Record<string, CalendarWellness>;
  weekLoads: Record<string, WeekLoad>;
  handlers: CalendarHandlers;
  onRescheduleWorkout?: (scheduledWorkoutId: string, newDate: string) => void;
  onRescheduleRace?: (raceId: string, newDate: string) => void;
  onRescheduleBlock?: (blockId: string, newDate: string) => void;
}

const weekDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"];

export function CalendarGrid({
  weeks,
  contentByDate,
  wellnessByDate,
  weekLoads,
  handlers,
  onRescheduleWorkout,
  onRescheduleRace,
  onRescheduleBlock,
}: CalendarGridProps) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null);

  // Require 8px of movement before starting drag — prevents accidental drags on click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    const [type, itemId] = id.split(":");

    for (const content of Object.values(contentByDate)) {
      if (type === "workout") {
        const found = content.workouts.find((w) => w.id === itemId);
        if (found) return setActiveItem({ type: "workout", item: found });
      } else if (type === "race") {
        const found = content.races.find((r) => r.id === itemId);
        if (found) return setActiveItem({ type: "race", item: found });
      } else if (type === "block") {
        const found = content.blocks.find((b) => b.id === itemId);
        if (found) return setActiveItem({ type: "block", item: found });
      }
    }
  }, [contentByDate]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const dragId = String(active.id);
    const dropId = String(over.id);

    if (!dropId.startsWith("day:")) return;
    const newDate = dropId.slice(4); // "day:2026-04-07" → "2026-04-07"
    const [type, itemId] = dragId.split(":");

    // Find the current date so a drop onto the same day is a no-op.
    for (const [dateKey, content] of Object.entries(contentByDate)) {
      if (dateKey === newDate) continue;
      if (type === "workout" && content.workouts.some((w) => w.id === itemId)) {
        return onRescheduleWorkout?.(itemId, newDate);
      }
      if (type === "race" && content.races.some((r) => r.id === itemId)) {
        return onRescheduleRace?.(itemId, newDate);
      }
      if (type === "block" && content.blocks.some((b) => b.id === itemId)) {
        return onRescheduleBlock?.(itemId, newDate);
      }
    }
  }, [contentByDate, onRescheduleWorkout, onRescheduleRace, onRescheduleBlock]);

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
              const dayContent = contentByDate[formatDateKey(day)];
              if (!dayContent) return;
              weekWorkouts.push(...dayContent.workouts);
              weekActivities.push(...dayContent.activities);
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
                  return (
                    <CalendarDay
                      key={key}
                      date={day}
                      content={contentByDate[key] ?? EMPTY_DAY_CONTENT}
                      handlers={handlers}
                    />
                  );
                })}
                <CalendarWeekSummary
                  weekWorkouts={weekWorkouts}
                  weekActivities={weekActivities}
                  weekLoad={weekLoads[weekStartKey] ?? null}
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
        {activeItem?.type === "block" && (
          <BlockDragOverlay item={activeItem.item} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
