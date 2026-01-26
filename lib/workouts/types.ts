import { z } from "zod";

// Zod schema for workout intervals with ramp and free ride support
export const WorkoutIntervalSchema = z.object({
  name: z.string().optional(), // Optional for backward compatibility
  durationSeconds: z.number().positive(),
  intensityPercentStart: z.number().min(0).optional(),
  intensityPercentEnd: z.number().min(0).optional(),
});

// New: Repeat group schema
export const RepeatGroupDataSchema = z.object({
  count: z.number().int().min(1).max(999),
  intervals: z.array(WorkoutIntervalSchema).min(1),
});

// New: Discriminated union for builder items
export const BuilderItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("interval"),
    data: WorkoutIntervalSchema,
  }),
  z.object({
    type: z.literal("repeat"),
    data: RepeatGroupDataSchema,
  }),
]);

// Zod schema for workouts
export const WorkoutSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  intervals: z.array(BuilderItemSchema), // Changed from WorkoutIntervalSchema
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  is_favorite: z.boolean().optional(),
  user_id: z.string().uuid().nullable().optional(),
  is_public: z.boolean().optional(),
  is_preset: z.boolean().optional(),
  // Metrics (optional for backwards compatibility during migration)
  duration_seconds: z.number().int().optional(),
  avg_intensity_percent: z.number().int().optional(),
});

// Infer TypeScript types from Zod schemas
export type WorkoutInterval = z.infer<typeof WorkoutIntervalSchema>;
export type RepeatGroupData = z.infer<typeof RepeatGroupDataSchema>;
export type BuilderItem = z.infer<typeof BuilderItemSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;

// Workout categories
export const WORKOUT_CATEGORIES = [
  "recovery",
  "endurance",
  "tempo",
  "sweet_spot",
  "threshold",
  "vo2max",
  "anaerobic",
  "race_simulation",
] as const;

export type WorkoutCategory = (typeof WORKOUT_CATEGORIES)[number];

export const WorkoutCategorySchema = z.enum([
  "recovery",
  "endurance",
  "tempo",
  "sweet_spot",
  "threshold",
  "vo2max",
  "anaerobic",
  "race_simulation",
]);

// Category display labels
export const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  recovery: "Recovery",
  endurance: "Endurance",
  tempo: "Tempo",
  sweet_spot: "Sweet Spot",
  threshold: "Threshold",
  vo2max: "VO2max",
  anaerobic: "Anaerobic",
  race_simulation: "Race Simulation",
};

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
