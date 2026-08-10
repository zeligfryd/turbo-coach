/**
 * Exercise bank and routine mutations (D7).
 *
 * Presets are global and read-only. Editing one duplicates it into the user's
 * own bank with `derived_from` set, and the copy shadows the original — the
 * common case is a tweaked dose or a personal cue, not authoring from scratch.
 *
 * Nothing is ever hard-deleted while it is referenced: `routine_item` and
 * historical completions point at these rows, and coverage history is the
 * product's value.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { routineCoverageFromExercises } from "../read";
import {
  BodyRegionSchema,
  EquipmentSchema,
  ExerciseScopeSchema,
  StimulusTypeSchema,
  type BodyRegion,
  type StimulusType,
} from "../taxonomy";
import type { ExerciseRow, RoutineRow } from "../types";
import type { ServiceResult } from "./blocks";

const ok = <T>(data: T): ServiceResult<T> => ({ success: true, data });
const fail = <T>(error: string): ServiceResult<T> => ({ success: false, error });

export const ExerciseInput = z.object({
  name: z.string().min(1).max(120),
  // Required, not optional: an exercise with no region contributes nothing to
  // coverage and cannot be ranked, so it would be invisible to both features
  // the bank exists to serve.
  regions: z.array(BodyRegionSchema).min(1, "Pick at least one region"),
  stimulus: StimulusTypeSchema,
  defaultDose: z.unknown().optional(),
  equipment: z.array(EquipmentSchema).default([]),
  difficulty: z.number().int().min(1).max(3).nullable().optional(),
  cues: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  scope: ExerciseScopeSchema.default("prehab"),
});
export type ExerciseInput = z.input<typeof ExerciseInput>;

function toRow(userId: string, value: z.output<typeof ExerciseInput>) {
  return {
    user_id: userId,
    name: value.name.trim(),
    regions: value.regions,
    stimulus: value.stimulus,
    default_dose: value.defaultDose ?? null,
    equipment: value.equipment,
    difficulty: value.difficulty ?? null,
    cues: value.cues?.trim() || null,
    notes: value.notes?.trim() || null,
    scope: value.scope,
    is_preset: false,
    is_public: false,
  };
}

export async function createExercise(
  supabase: SupabaseClient,
  userId: string,
  input: ExerciseInput,
): Promise<ServiceResult<ExerciseRow>> {
  const parsed = ExerciseInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid exercise");

  const { data, error } = await supabase
    .from("exercise")
    .insert(toRow(userId, parsed.data))
    .select("*")
    .single();

  if (error) return fail(error.message);
  return ok(data as ExerciseRow);
}

export async function updateExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
  input: ExerciseInput,
): Promise<ServiceResult<ExerciseRow>> {
  const parsed = ExerciseInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid exercise");

  const { data, error } = await supabase
    .from("exercise")
    .update(toRow(userId, parsed.data))
    .eq("id", exerciseId)
    .eq("user_id", userId)
    .eq("is_preset", false)
    .select("*")
    .single();

  if (error) return fail(error.message);
  return ok(data as ExerciseRow);
}

/**
 * Copy an exercise into the user's own bank so they can edit it. Used for
 * presets, which RLS makes read-only, and available for any readable row.
 */
export async function duplicateExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ServiceResult<ExerciseRow>> {
  const { data: source, error } = await supabase
    .from("exercise")
    .select("*")
    .eq("id", exerciseId)
    .single();

  if (error || !source) return fail(error?.message ?? "Exercise not found");

  const { data, error: insertError } = await supabase
    .from("exercise")
    .insert({
      user_id: userId,
      name: source.name,
      regions: source.regions,
      stimulus: source.stimulus,
      default_dose: source.default_dose,
      equipment: source.equipment,
      difficulty: source.difficulty,
      cues: source.cues,
      notes: source.notes,
      media_url: source.media_url,
      scope: source.scope,
      is_preset: false,
      is_public: false,
      derived_from: source.id,
    })
    .select("*")
    .single();

  if (insertError) return fail(insertError.message);
  return ok(data as ExerciseRow);
}

/** Retire rather than delete — saved routines and past completions reference it. */
export async function archiveExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabase
    .from("exercise")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", exerciseId)
    .eq("user_id", userId)
    .eq("is_preset", false);

  if (error) return fail(error.message);
  return ok({ id: exerciseId });
}

export async function restoreExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabase
    .from("exercise")
    .update({ archived_at: null })
    .eq("id", exerciseId)
    .eq("user_id", userId)
    .eq("is_preset", false);

  if (error) return fail(error.message);
  return ok({ id: exerciseId });
}

// ── Routines ────────────────────────────────────────────────────────

export const RoutineInput = z.object({
  name: z.string().min(1).max(120),
  items: z
    .array(z.object({ exerciseId: z.string().uuid(), dose: z.unknown().optional() }))
    .min(1, "A routine needs at least one exercise"),
  estDurationMin: z.number().int().min(1).max(240).nullable().optional(),
});
export type RoutineInput = z.input<typeof RoutineInput>;

/**
 * Save a routine and its ordered items.
 *
 * The coverage vector is derived here, once, from the exercises actually in the
 * routine — never recomputed at read time, and never hand-maintained.
 */
export async function createRoutine(
  supabase: SupabaseClient,
  userId: string,
  input: RoutineInput,
): Promise<ServiceResult<RoutineRow>> {
  const parsed = RoutineInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid routine");
  const value = parsed.data;

  const exerciseIds = value.items.map((item) => item.exerciseId);
  const { data: exercises, error: lookupError } = await supabase
    .from("exercise")
    .select("id, regions, stimulus")
    .in("id", exerciseIds);

  if (lookupError) return fail(lookupError.message);
  const found = (exercises ?? []) as { id: string; regions: BodyRegion[]; stimulus: StimulusType }[];
  if (found.length !== new Set(exerciseIds).size) {
    return fail("One or more exercises could not be found");
  }

  // Preserve the user's ordering; the lookup came back in arbitrary order.
  const byId = new Map(found.map((e) => [e.id, e]));
  const ordered = exerciseIds.map((id) => byId.get(id)!);
  const coverageVector = routineCoverageFromExercises(ordered);

  const { data: routine, error } = await supabase
    .from("routine")
    .insert({
      user_id: userId,
      name: value.name.trim(),
      est_duration_min: value.estDurationMin ?? null,
      coverage_vector: coverageVector,
      is_preset: false,
      is_public: false,
    })
    .select("*")
    .single();

  if (error || !routine) return fail(error?.message ?? "Could not save the routine");

  const { error: itemsError } = await supabase.from("routine_item").insert(
    value.items.map((item, index) => ({
      routine_id: routine.id,
      position: index,
      exercise_id: item.exerciseId,
      dose: item.dose ?? null,
    })),
  );

  if (itemsError) {
    // Leave no half-saved routine behind: an empty routine would rank and
    // schedule like a real one while doing nothing.
    await supabase.from("routine").delete().eq("id", routine.id).eq("user_id", userId);
    return fail(itemsError.message);
  }

  return ok(routine as RoutineRow);
}

export async function archiveRoutine(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabase
    .from("routine")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", routineId)
    .eq("user_id", userId)
    .eq("is_preset", false);

  if (error) return fail(error.message);
  return ok({ id: routineId });
}
