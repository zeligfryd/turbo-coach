import type { Workout } from "@/lib/workouts/types";

export type ScheduledWorkout = {
  id: string;
  scheduled_date: string;
  workout: Workout;
};
