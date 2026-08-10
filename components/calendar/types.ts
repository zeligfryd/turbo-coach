import type { Workout } from "@/lib/workouts/types";
import type { CalendarRaceEvent } from "@/lib/race/types";
import type { BlockCardHandlers } from "@/components/training/block-card";
import type { DayPart } from "@/lib/training/taxonomy";
import type { PlannedItem, WeekLoad } from "@/lib/training/types";

export type ScheduledWorkout = {
  id: string;
  scheduled_date: string;
  /** Which part of the day the ride sits in. Defaults to morning. */
  day_part: DayPart;
  workout: Workout;
};

export type CalendarActivity = {
  id: string;
  activity_date: string;
  name: string | null;
  type: string | null;
  moving_time: number | null;
  icu_training_load: number | null;
  avg_power: number | null;
  normalized_power: number | null;
  avg_hr: number | null;
  distance: number | null;
  elevation_gain: number | null;
  source: string;
};

/**
 * Everything on one day, in one prop.
 *
 * Grouped deliberately: the day components already carried ten props each, and
 * blocks plus day-parts would have pushed them past fifteen. Adding a fifth
 * content stream now means changing this type, not every call site.
 */
export type DayContent = {
  workouts: ScheduledWorkout[];
  activities: CalendarActivity[];
  races: CalendarRaceEvent[];
  blocks: PlannedItem[];
};

export const EMPTY_DAY_CONTENT: DayContent = {
  workouts: [],
  activities: [],
  races: [],
  blocks: [],
};

export type CalendarHandlers = {
  onAdd: (dateKey: string) => void;
  onRemove: (scheduledWorkoutId: string) => void;
  onWorkoutClick?: (workout: Workout) => void;
  onActivityClick?: (activityId: string) => void;
  onRaceClick?: (raceId: string) => void;
  onAddRace?: (dateKey: string) => void;
  onAddBlock?: (dateKey: string) => void;
  block?: BlockCardHandlers;
};

export type { CalendarRaceEvent, PlannedItem, WeekLoad };
