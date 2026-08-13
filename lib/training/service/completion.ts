/**
 * Ticking things off, and the six coverage targets.
 *
 * Completion is the shared contract the whole ecosystem writes:
 * `{ source, status, actual_duration_min, srpe, exercises }`. The strength tool
 * and a Whoop replacement will write the same row shape; the planner only reads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CompletionSourceSchema, FocusAreaSchema } from "../taxonomy";
import type { CompletionRow } from "../types";
import { type ServiceResult } from "./blocks";

const ok = <T>(data: T): ServiceResult<T> => ({ success: true, data });
const fail = <T>(error: string): ServiceResult<T> => ({ success: false, error });

export const RecordCompletionInput = z.object({
  status: z.enum(["done", "partial", "skipped"]),
  actualDurationMin: z.number().int().min(0).max(600).nullable().optional(),
  srpe: z.number().min(1).max(10).nullable().optional(),
  source: CompletionSourceSchema.default("manual"),
  exercises: z.unknown().optional(),
});
export type RecordCompletionInput = z.input<typeof RecordCompletionInput>;

/**
 * Tick a block. Writes the completion row and mirrors the status onto the block
 * so the calendar can render without a join.
 *
 * Upserts on block_id: ticking twice corrects the record rather than stacking
 * duplicates, which matters because `/today` is a phone surface where a double
 * tap is a normal accident.
 */
export async function recordBlockCompletion(
  supabase: SupabaseClient,
  userId: string,
  blockId: string,
  input: RecordCompletionInput,
): Promise<ServiceResult<CompletionRow>> {
  const parsed = RecordCompletionInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid completion");
  const value = parsed.data;

  const { data, error } = await supabase
    .from("completion")
    .upsert(
      {
        user_id: userId,
        block_id: blockId,
        scheduled_workout_id: null,
        source: value.source,
        status: value.status,
        actual_duration_min: value.actualDurationMin ?? null,
        srpe: value.srpe ?? null,
        exercises: value.exercises ?? null,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "block_id" },
    )
    .select("*")
    .single();

  if (error) return fail(error.message);

  const { error: blockError } = await supabase
    .from("block")
    .update({ status: value.status })
    .eq("id", blockId)
    .eq("user_id", userId);

  if (blockError) return fail(blockError.message);

  return ok(data as CompletionRow);
}

/** Undo a tick, returning the block to planned. */
export async function clearBlockCompletion(
  supabase: SupabaseClient,
  userId: string,
  blockId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabase
    .from("completion")
    .delete()
    .eq("block_id", blockId)
    .eq("user_id", userId);

  if (error) return fail(error.message);

  const { error: blockError } = await supabase
    .from("block")
    .update({ status: "planned" })
    .eq("id", blockId)
    .eq("user_id", userId);

  if (blockError) return fail(blockError.message);
  return ok({ id: blockId });
}

/** Tick a ride. Only needed for a ride that never imported from intervals.icu. */
export async function recordRideCompletion(
  supabase: SupabaseClient,
  userId: string,
  scheduledWorkoutId: string,
  input: RecordCompletionInput,
): Promise<ServiceResult<CompletionRow>> {
  const parsed = RecordCompletionInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid completion");
  const value = parsed.data;

  const { data, error } = await supabase
    .from("completion")
    .upsert(
      {
        user_id: userId,
        block_id: null,
        scheduled_workout_id: scheduledWorkoutId,
        source: value.source,
        status: value.status,
        actual_duration_min: value.actualDurationMin ?? null,
        srpe: value.srpe ?? null,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "scheduled_workout_id" },
    )
    .select("*")
    .single();

  if (error) return fail(error.message);

  const { error: scheduledError } = await supabase
    .from("scheduled_workouts")
    .update({ status: value.status })
    .eq("id", scheduledWorkoutId)
    .eq("user_id", userId);

  if (scheduledError) return fail(scheduledError.message);
  return ok(data as CompletionRow);
}

/**
 * Untick a ride. Removes the completion and returns the scheduled workout to
 * planned, so a mis-tap is one tap to undo rather than something to go and fix
 * in the calendar.
 */
export async function clearRideCompletion(
  supabase: SupabaseClient,
  userId: string,
  scheduledWorkoutId: string,
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from("completion")
    .delete()
    .eq("user_id", userId)
    .eq("scheduled_workout_id", scheduledWorkoutId);
  if (error) return fail(error.message);

  const { error: scheduledError } = await supabase
    .from("scheduled_workouts")
    .update({ status: "planned" })
    .eq("id", scheduledWorkoutId)
    .eq("user_id", userId);
  if (scheduledError) return fail(scheduledError.message);

  return ok(null);
}
