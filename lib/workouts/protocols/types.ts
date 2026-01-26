import { z } from "zod";
import { WorkoutCategorySchema } from "../types";

// Parameter definition for customizable protocol values
export const ParameterDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["number"]),
  default: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

export type ParameterDefinition = z.infer<typeof ParameterDefinitionSchema>;

// Base interval structure components
export const RampSegmentSchema = z.object({
  duration_seconds: z.number(),
  type: z.literal("ramp"),
  start: z.number(), // intensity percent
  end: z.number(), // intensity percent
});

export const SteadySegmentSchema = z.object({
  duration_seconds: z.union([z.number(), z.string()]), // Can be number or template variable like "{{duration}}"
  intensity_percent: z.number(),
  type: z.enum(["work", "rest", "interval"]).optional(),
});

// Main work structure types

export const RepeatingIntervalsSchema = z.object({
  type: z.literal("repeating_intervals"),
  pattern: z.array(SteadySegmentSchema),
  sets: z.union([z.number(), z.string()]), // Can be template variable
  reps_per_set: z.union([z.number(), z.string()]),
  rest_between_sets: z.number(),
});

export const RepeatingSteadySchema = z.object({
  type: z.literal("repeating_steady"),
  work: SteadySegmentSchema,
  rest: SteadySegmentSchema,
  count: z.union([z.number(), z.string()]),
});

export const SteadyBlockSchema = z.object({
  type: z.literal("steady_block"),
  duration_seconds: z.union([z.number(), z.string()]),
  intensity_percent: z.number(),
});

export const OverUnderSchema = z.object({
  type: z.literal("over_under"),
  pattern: z.array(
    z.object({
      duration_seconds: z.number(),
      intensity_percent: z.number(),
      type: z.enum(["over", "under"]),
    })
  ),
  sets: z.union([z.number(), z.string()]),
  reps_per_set: z.union([z.number(), z.string()]),
  rest_between_sets: z.number(),
});

export const PyramidSchema = z.object({
  type: z.literal("pyramid"),
  steps: z.array(SteadySegmentSchema),
  rest_duration: z.number(),
  sets: z.union([z.number(), z.string()]),
});

export const SprintIntervalsSchema = z.object({
  type: z.literal("sprint_intervals"),
  pattern: z.array(SteadySegmentSchema),
  sets: z.union([z.number(), z.string()]),
  reps_per_set: z.union([z.number(), z.string()]),
  rest_between_sets: z.number(),
});

// Discriminated union for all main work types
export const MainWorkStructureSchema = z.discriminatedUnion("type", [
  RepeatingIntervalsSchema,
  RepeatingSteadySchema,
  SteadyBlockSchema,
  OverUnderSchema,
  PyramidSchema,
  SprintIntervalsSchema,
]);

export type MainWorkStructure = z.infer<typeof MainWorkStructureSchema>;

// Complete protocol structure
export const ProtocolStructureSchema = z.object({
  warmup: RampSegmentSchema.optional(),
  main_work: MainWorkStructureSchema,
  cooldown: RampSegmentSchema.optional(),
});

export type ProtocolStructure = z.infer<typeof ProtocolStructureSchema>;

// Protocol type constants
export const PROTOCOL_TYPES = [
  "billat_30_30",
  "tabata",
  "steady_intervals",
  "over_under",
  "pyramid",
  "sprint_intervals",
  "steady_block",
] as const;

export type ProtocolType = (typeof PROTOCOL_TYPES)[number];

// Complete workout protocol schema
export const WorkoutProtocolSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  category: WorkoutCategorySchema,
  protocol_type: z.string(),
  structure: ProtocolStructureSchema,
  parameters: z.array(ParameterDefinitionSchema),
  intensity_level: z.number().min(1).max(10).nullable(),
  tags: z.array(z.string()),
  is_preset: z.boolean(),
  created_at: z.string(),
});

export type WorkoutProtocol = z.infer<typeof WorkoutProtocolSchema>;

// User parameters for generation
export type UserParameters = Record<string, number>;

// Template variable regex for replacement
export const TEMPLATE_VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

// Helper to check if a value is a template variable
export function isTemplateVariable(value: unknown): value is string {
  return typeof value === "string" && TEMPLATE_VARIABLE_REGEX.test(value);
}

// Helper to extract template variable name
export function extractVariableName(template: string): string | null {
  const match = template.match(TEMPLATE_VARIABLE_REGEX);
  if (!match) return null;
  return match[0].replace(/\{\{|\}\}/g, "");
}

// Helper to replace template variables with user parameters
export function replaceTemplateVariables(
  value: string | number,
  params: UserParameters
): number {
  if (typeof value === "number") return value;

  const variableName = extractVariableName(value);
  if (!variableName || !(variableName in params)) {
    throw new Error(`Missing parameter: ${variableName}`);
  }

  return params[variableName];
}

// Validation helper
export function validateWorkoutProtocol(protocol: unknown): WorkoutProtocol {
  return WorkoutProtocolSchema.parse(protocol);
}
