import type { Workout } from "@/lib/workouts/types";
import type { CalendarRaceEvent } from "@/lib/race/types";

export type ScheduledWorkout = {
  id: string;
  scheduled_date: string;
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

export type { CalendarRaceEvent };
