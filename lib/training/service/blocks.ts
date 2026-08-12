/**
 * Block mutations (§7.1).
 *
 * Every write to `block` goes through here. Nothing mutates blocks inline in a
 * component or a server action — actions do auth and IO, then call these.
 *
 * The point of the indirection: an AI coach later becomes a *second caller of
 * these same functions* with `createdBy: 'coach'`, which forces its output into
 * the ghost flow. That property is free now and expensive to retrofit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  BlockModalitySchema,
  DayPartSchema,
  FocusAreaSchema,
  ProvenanceSchema,
} from "../taxonomy";
import type { BlockRow } from "../types";

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const ok = <T>(data: T): ServiceResult<T> => ({ success: true, data });
const fail = <T>(error: string): ServiceResult<T> => ({ success: false, error });

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

export const ScheduleBlockInput = z.object({
  date: DateSchema,
  dayPart: DayPartSchema.default("am"),
  modality: BlockModalitySchema,
  name: z.string().min(1).max(120),
  plannedDurationMin: z.number().int().min(1).max(600).nullable().optional(),
  plannedRpe: z.number().min(1).max(10).nullable().optional(),
  areaTags: z.array(FocusAreaSchema).default([]),
  routineId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  seriesId: z.string().uuid().nullable().optional(),
  /**
   * Anything not created by the user lands as a ghost: a proposal, excluded
   * from planned load, confirmed or dismissed in one tap. This is enforced
   * here rather than trusted to the caller.
   */
  createdBy: ProvenanceSchema.default("user"),
});
export type ScheduleBlockInput = z.input<typeof ScheduleBlockInput>;

export async function scheduleBlock(
  supabase: SupabaseClient,
  userId: string,
  input: ScheduleBlockInput,
): Promise<ServiceResult<BlockRow>> {
  const parsed = ScheduleBlockInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid block");
  const value = parsed.data;

  const isProposal = value.createdBy !== "user";

  const { data, error } = await supabase
    .from("block")
    .insert({
      user_id: userId,
      date: value.date,
      day_part: value.dayPart,
      modality: value.modality,
      name: value.name.trim(),
      planned_duration_min: value.plannedDurationMin ?? null,
      planned_rpe: value.plannedRpe ?? null,
      area_tags: value.areaTags,
      routine_id: value.routineId ?? null,
      template_id: value.templateId ?? null,
      series_id: value.seriesId ?? null,
      status: isProposal ? "ghost" : "planned",
      created_by: value.createdBy,
      accepted_at: isProposal ? null : new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return fail(error.message);
  return ok(data as BlockRow);
}

export const UpdateBlockInput = z.object({
  name: z.string().min(1).max(120).optional(),
  date: DateSchema.optional(),
  dayPart: DayPartSchema.optional(),
  plannedDurationMin: z.number().int().min(1).max(600).nullable().optional(),
  plannedRpe: z.number().min(1).max(10).nullable().optional(),
  areaTags: z.array(FocusAreaSchema).optional(),
});
export type UpdateBlockInput = z.input<typeof UpdateBlockInput>;

export async function updateBlock(
  supabase: SupabaseClient,
  userId: string,
  blockId: string,
  input: UpdateBlockInput,
): Promise<ServiceResult<BlockRow>> {
  const parsed = UpdateBlockInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid update");
  const value = parsed.data;

  const patch: Record<string, unknown> = {};
  if (value.name !== undefined) patch.name = value.name.trim();
  if (value.date !== undefined) patch.date = value.date;
  if (value.dayPart !== undefined) patch.day_part = value.dayPart;
  if (value.plannedDurationMin !== undefined) patch.planned_duration_min = value.plannedDurationMin;
  if (value.plannedRpe !== undefined) patch.planned_rpe = value.plannedRpe;
  if (value.areaTags !== undefined) patch.area_tags = value.areaTags;

  if (Object.keys(patch).length === 0) return fail("Nothing to update");

  // Editing an instance detaches it from its series — the template stops
  // overwriting a session the user has deliberately changed.
  patch.detached_from_series = true;

  const { data, error } = await supabase
    .from("block")
    .update(patch)
    .eq("id", blockId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) return fail(error.message);
  return ok(data as BlockRow);
}

/** Move a block to another day, or another part of the same day. */
export async function rescheduleBlock(
  supabase: SupabaseClient,
  userId: string,
  blockId: string,
  date: string,
  dayPart?: z.infer<typeof DayPartSchema>,
): Promise<ServiceResult<BlockRow>> {
  return updateBlock(supabase, userId, blockId, { date, ...(dayPart ? { dayPart } : {}) });
}

/**
 * Accept a proposal. Ghosts become real only through this path, so there is
 * exactly one place where a suggestion turns into a commitment.
 */
export async function acceptBlock(
  supabase: SupabaseClient,
  userId: string,
  blockId: string,
): Promise<ServiceResult<BlockRow>> {
  const { data, error } = await supabase
    .from("block")
    .update({ status: "planned", accepted_at: new Date().toISOString() })
    .eq("id", blockId)
    .eq("user_id", userId)
    .eq("status", "ghost")
    .select("*")
    .single();

  if (error) return fail(error.message);
  return ok(data as BlockRow);
}

export async function deleteBlock(
  supabase: SupabaseClient,
  userId: string,
  blockId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabase.from("block").delete().eq("id", blockId).eq("user_id", userId);
  if (error) return fail(error.message);
  return ok({ id: blockId });
}

// ── Block templates ─────────────────────────────────────────────────

export const BlockTemplateInput = z.object({
  modality: BlockModalitySchema,
  name: z.string().min(1).max(120),
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
  areaTags: z.array(FocusAreaSchema).default([]),
  defaultRpe: z.number().min(1).max(10).nullable().optional(),
});
export type BlockTemplateInput = z.input<typeof BlockTemplateInput>;

export async function createBlockTemplate(
  supabase: SupabaseClient,
  userId: string,
  input: BlockTemplateInput,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = BlockTemplateInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid template");
  const value = parsed.data;

  const { data, error } = await supabase
    .from("block_template")
    .insert({
      user_id: userId,
      modality: value.modality,
      name: value.name.trim(),
      duration_min: value.durationMin ?? null,
      area_tags: value.areaTags,
      default_rpe: value.defaultRpe ?? null,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);
  return ok(data as { id: string });
}

export async function updateBlockTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
  input: BlockTemplateInput,
): Promise<ServiceResult<{ id: string }>> {
  const parsed = BlockTemplateInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid template");
  const value = parsed.data;

  const { data, error } = await supabase
    .from("block_template")
    .update({
      modality: value.modality,
      name: value.name.trim(),
      duration_min: value.durationMin ?? null,
      area_tags: value.areaTags,
      default_rpe: value.defaultRpe ?? null,
    })
    .eq("id", templateId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) return fail(error.message);
  return ok(data as { id: string });
}

/**
 * Templates are safe to hard-delete: blocks reference them with
 * `on delete set null`, so past sessions keep their own name, duration and
 * area tags. Nothing about coverage history depends on the template surviving.
 */
export async function deleteBlockTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabase
    .from("block_template")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId);

  if (error) return fail(error.message);
  return ok({ id: templateId });
}

/**
 * Schedule one of the named routines.
 *
 * The default path (D8): the user starts the stalest of four rather than
 * composing a session. The block carries `routine_id`, so when it is ticked its
 * stored coverage vector — which knows loaded from stretch per area — is what
 * feeds coverage, rather than the coarse area tags a plain block would use.
 */
export async function scheduleRoutine(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
  date: string,
  dayPart: z.infer<typeof DayPartSchema> = "am",
): Promise<ServiceResult<BlockRow>> {
  const { data: routine, error } = await supabase
    .from("routine")
    .select("id, name, est_duration_min, is_preset, user_id, coverage_vector")
    .eq("id", routineId)
    .single();

  if (error || !routine) return fail(error?.message ?? "Routine not found");
  // RLS allows reading presets and public routines; only the owner or a preset
  // may be scheduled.
  if (!routine.is_preset && routine.user_id !== userId) return fail("Routine not found");

  return scheduleBlock(supabase, userId, {
    date,
    dayPart,
    modality: "prehab",
    name: routine.name,
    plannedDurationMin: routine.est_duration_min,
    plannedRpe: 3,
    routineId,
    // Snapshot the routine's areas onto the block. Coverage still reads the
    // routine's vector while it exists — that knows loaded from stretch, which
    // tags cannot — but `routine_id` is `on delete set null`, so without this
    // deleting a routine silently erased the coverage history of every session
    // ever done from it. It is also what the scheduling dialog shows you, and
    // that promise should survive the save.
    areaTags: Object.keys(
      (routine.coverage_vector ?? {}) as Record<string, unknown>,
    ) as z.infer<typeof FocusAreaSchema>[],
  });
}

/**
 * Schedule a block from a saved template. This is the path that makes coverage
 * correct at zero marginal effort: the user saves their handful of standing
 * strength sessions once, and thereafter ticking one feeds area recency.
 */
export async function scheduleFromTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
  date: string,
  dayPart: z.infer<typeof DayPartSchema> = "am",
): Promise<ServiceResult<BlockRow>> {
  const { data: template, error } = await supabase
    .from("block_template")
    .select("*")
    .eq("id", templateId)
    .eq("user_id", userId)
    .single();

  if (error || !template) return fail(error?.message ?? "Template not found");

  return scheduleBlock(supabase, userId, {
    date,
    dayPart,
    modality: template.modality,
    name: template.name,
    plannedDurationMin: template.duration_min,
    plannedRpe: template.default_rpe,
    areaTags: template.area_tags ?? [],
    templateId,
  });
}
