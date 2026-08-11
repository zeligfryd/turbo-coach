import { useState } from "react";
import { X, CheckCircle, Trash2, Flag, GripVertical } from "lucide-react";
import { AddToDayMenu } from "./add-to-day-menu";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { MiniIntensityChart } from "@/components/workouts/mini-intensity-chart";
import { flattenBuilderItems } from "@/lib/workouts/utils";
import { EVENT_TYPE_LABELS } from "@/lib/race/types";
import type { ScheduledWorkout, CalendarRaceEvent, DayContent, CalendarHandlers } from "./types";
import type { Workout } from "@/lib/workouts/types";
import type { EventType } from "@/lib/race/types";
import { BlockCard } from "@/components/training/block-card";
import { modalityColor } from "@/lib/training/display";
import { DAY_PARTS, DAY_PART_LABELS } from "@/lib/training/taxonomy";
import {
  getCalendarDayLabelParts,
  formatDateKey,
  formatHoursFromSeconds,
  getWorkoutMetrics,
} from "./utils";

// ── Draggable cards ─────────────────────────────────────────────────

function DraggableWorkoutCard({
  item,
  onWorkoutClick,
  confirmingId,
  onConfirm,
  onRemove,
}: {
  item: ScheduledWorkout;
  onWorkoutClick?: (workout: Workout) => void;
  confirmingId: string | null;
  onConfirm: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `workout:${item.id}`,
  });
  const metrics = getWorkoutMetrics(item.workout);

  return (
    <div
      ref={setNodeRef}
      style={{ borderLeftColor: modalityColor("bike") }}
      className={`rounded-md border border-border border-l-[3px] bg-background px-1.5 py-1 text-xs flex items-start justify-between gap-1 shadow-sm cursor-pointer hover:ring-1 hover:ring-primary/40 transition-shadow ${isDragging ? "opacity-30" : ""}`}
      onClick={() => onWorkoutClick?.(item.workout)}
    >
      <div
        className="flex items-center self-stretch cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold leading-snug line-clamp-2">
          {item.workout.name}
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
          {formatHoursFromSeconds(metrics.durationSeconds)} · TSS {metrics.tss}
        </div>
        <div className="mt-1 opacity-70">
          <MiniIntensityChart intervals={flattenBuilderItems(item.workout.intervals)} height={4} />
        </div>
      </div>
      {confirmingId === item.id ? (
        <button
          onClick={(e) => { e.stopPropagation(); onConfirm(null); onRemove(item.id); }}
          className="p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20"
          aria-label="Confirm remove"
          onBlur={() => onConfirm(null)}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onConfirm(item.id); }}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
          aria-label="Remove workout"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function DraggableRaceCard({
  race,
  onRaceClick,
}: {
  race: CalendarRaceEvent;
  onRaceClick?: (raceId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `race:${race.id}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md bg-red-500/10 border border-red-500/20 px-1.5 py-1 text-xs shadow-sm cursor-pointer hover:ring-1 hover:ring-red-500/40 transition-shadow ${isDragging ? "opacity-30" : ""}`}
      onClick={() => onRaceClick?.(race.id)}
    >
      <div className="flex items-center gap-1 min-w-0">
        <div
          className="flex items-center cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground"
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </div>
        <Flag className="h-3 w-3 text-red-600 shrink-0" />
        <span className="text-[12px] font-semibold leading-snug line-clamp-2 text-red-700 dark:text-red-400">
          {race.name}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 pl-4">
        {EVENT_TYPE_LABELS[race.event_type as EventType] ?? race.event_type}
        {race.distance_km != null && ` · ${race.distance_km}km`}
      </div>
    </div>
  );
}

// ── Overlay previews (non-interactive copies shown while dragging) ───

export function WorkoutDragOverlay({ item }: { item: ScheduledWorkout }) {
  const metrics = getWorkoutMetrics(item.workout);
  return (
    <div className="rounded-md bg-background px-1.5 py-1 text-xs shadow-lg ring-2 ring-primary/50 w-[180px] opacity-90">
      <div className="truncate text-[11px] font-bold leading-tight">{item.workout.name}</div>
      <div className="text-[10px] text-muted-foreground">
        {formatHoursFromSeconds(metrics.durationSeconds)} • TSS {metrics.tss}
      </div>
    </div>
  );
}

export function RaceDragOverlay({ race }: { race: CalendarRaceEvent }) {
  return (
    <div className="rounded-md bg-red-500/10 border border-red-500/20 px-1.5 py-1 text-xs shadow-lg ring-2 ring-red-500/50 w-[180px] opacity-90">
      <div className="flex items-center gap-1">
        <Flag className="h-3 w-3 text-red-600 shrink-0" />
        <span className="truncate text-[11px] font-bold leading-tight text-red-700 dark:text-red-400">
          {race.name}
        </span>
      </div>
    </div>
  );
}

// ── Day cell ────────────────────────────────────────────────────────

interface CalendarDayProps {
  date: Date;
  content: DayContent;
  handlers: CalendarHandlers;
}

export function CalendarDay({ date, content, handlers }: CalendarDayProps) {
  const { workouts, activities, races, blocks } = content;
  const isToday = formatDateKey(date) === formatDateKey(new Date());
  const { onAdd, onRemove, onWorkoutClick, onActivityClick, onRaceClick, onAddRace } = handlers;
  const dateKey = formatDateKey(date);
  const { monthPrefix, dayOfMonth } = getCalendarDayLabelParts(date);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `day:${dateKey}`,
  });

  // Group the day's sessions by part. A part is only shown when it holds
  // something, so a day with one morning ride looks exactly as it does today.
  const parts = DAY_PARTS.map((part) => ({
    part,
    workouts: workouts.filter((w) => (w.day_part ?? "am") === part),
    blocks: blocks.filter((b) => b.dayPart === part),
  })).filter((group) => group.workouts.length > 0 || group.blocks.length > 0);

  const showPartLabels = parts.length > 1;

  const isEmpty =
    workouts.length === 0 && activities.length === 0 && races.length === 0 && blocks.length === 0;

  return (
    <div
      ref={setDropRef}
      // An empty day loses its card: no fill, no shadow, only a hairline to
      // hold the grid. Ink is spent in proportion to content, so a quiet month
      // reads as quiet instead of as fifty identical cards.
      className={`group relative rounded-lg px-2 py-2 min-h-[120px] flex flex-col gap-2 text-foreground transition-colors ${
        isToday
          ? "bg-accent/60 ring-1 ring-border shadow-sm"
          : isEmpty
            ? "border border-border/40"
            : "bg-card shadow-sm"
      } ${isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
      data-day-date={dateKey}
    >
      <div className="flex items-start justify-between">
        <span className={`text-sm ${isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {monthPrefix ? (
            <>
              <span className="font-bold text-foreground">{monthPrefix}</span>{" "}
              {dayOfMonth}
            </>
          ) : (
            dayOfMonth
          )}
        </span>
        {/*
          One control instead of three. The old header put a race flag, a plus
          and a dumbbell on every cell — 21 buttons a week, most of them on days
          with nothing in them, and all of them below a comfortable tap size.
          The menu keeps every one of those actions, and only appears once the
          day is hovered or focused.
        */}
        {!isEmpty && (
          <AddToDayMenu
            dateKey={dateKey}
            onAdd={onAdd}
            onAddRace={onAddRace}
            onAddBlock={handlers.onAddBlock}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        {parts.map(({ part, workouts: partWorkouts, blocks: partBlocks }) => (
          <div key={part} className="flex flex-col gap-1.5">
            {showPartLabels && (
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
                {DAY_PART_LABELS[part]}
                <span className="h-px flex-1 bg-border/60" />
              </div>
            )}
            {partWorkouts.map((item) => (
              <DraggableWorkoutCard
                key={item.id}
                item={item}
                onWorkoutClick={onWorkoutClick}
                confirmingId={confirmingId}
                onConfirm={setConfirmingId}
                onRemove={onRemove}
              />
            ))}
            {partBlocks.map((block) => (
              <BlockCard key={block.id} item={block} handlers={handlers.block} />
            ))}
          </div>
        ))}

        {activities.map((activity) => {
          const durationStr = activity.moving_time ? formatHoursFromSeconds(activity.moving_time) : null;
          const distanceKm = activity.distance != null ? (activity.distance / 1000).toFixed(1) : null;
          const topLine = [durationStr, distanceKm ? `${distanceKm} km` : null].filter(Boolean).join(" · ");
          const midParts = [
            activity.avg_hr != null ? `${activity.avg_hr}bpm` : null,
            activity.avg_power != null ? `${activity.avg_power}w` : null,
          ].filter(Boolean);
          const tss = activity.icu_training_load != null ? Math.round(activity.icu_training_load) : null;

          return (
            <div
              key={activity.id}
              className="rounded-md bg-green-500/10 border border-green-500/20 px-1.5 py-1 text-xs shadow-sm cursor-pointer hover:ring-1 hover:ring-green-500/40 transition-shadow"
              onClick={() => onActivityClick?.(activity.id)}
            >
              <div className="flex items-center gap-1 min-w-0">
                <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
                <span className="truncate text-[12px] font-semibold leading-snug">
                  {topLine || "—"}
                </span>
              </div>
              {midParts.length > 0 && (
                <div className="text-[11px] text-blue-600 mt-0.5 tabular-nums">
                  {midParts.join(" · ")}
                </div>
              )}
              {tss != null && (
                <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                  Load {tss}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                {activity.name ?? activity.type ?? "Activity"}
              </div>
            </div>
          );
        })}

        {races.map((race) => (
          <DraggableRaceCard key={race.id} race={race} onRaceClick={onRaceClick} />
        ))}

        {/*
          An empty day says nothing and becomes the button. Fifty "Nothing
          scheduled" labels were fifty things to read past, and on a phone the
          only way to add to a day was a 24px icon. Now the whole cell is the
          tap target, and it is silent until you touch it.
        */}
        {isEmpty && (
          <AddToDayMenu
            dateKey={dateKey}
            onAdd={onAdd}
            onAddRace={onAddRace}
            onAddBlock={handlers.onAddBlock}
            variant="fill"
          />
        )}
      </div>
    </div>
  );
}
