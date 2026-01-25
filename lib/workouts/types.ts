import { z } from "zod";

// Zod schema for workout intervals with ramp and free ride support
export const WorkoutIntervalSchema = z.object({
  name: z.string().optional(), // Optional for backward compatibility
  durationSeconds: z.number().positive(),
  intensityPercentStart: z.number().min(0).optional(),
  intensityPercentEnd: z.number().min(0).optional(),
});

// Zod schema for workouts
export const WorkoutSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  intervals: z.array(WorkoutIntervalSchema),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  is_favorite: z.boolean().optional(),
  user_id: z.string().uuid().nullable().optional(),
  is_public: z.boolean().optional(),
  is_preset: z.boolean().optional(),
});

// Infer TypeScript types from Zod schemas
export type WorkoutInterval = z.infer<typeof WorkoutIntervalSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;

// Validation helper function
export function validateWorkout(data: unknown): Workout | null {
  try {
    return WorkoutSchema.parse(data);
  } catch (error) {
    console.error("Workout validation failed:", error);
    return null;
  }
}

// Validation helper for arrays of workouts
export function validateWorkouts(data: unknown[]): Workout[] {
  const validWorkouts: Workout[] = [];
  
  data.forEach((workout, index) => {
    const validated = validateWorkout(workout);
    if (validated) {
      validWorkouts.push(validated);
    } else {
      console.warn(`Skipping invalid workout at index ${index}`);
    }
  });
  
  return validWorkouts;
}
