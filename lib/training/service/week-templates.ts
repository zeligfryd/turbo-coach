import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, startOfWeek } from "../derive";
import { BLOCK_MODALITIES, DAY_PARTS, FOCUS_AREAS } from "../taxonomy";

const WeekdaySchema = z.number().int().min(0).max(6);
const DayPartSchema = z.enum(DAY_PARTS);
const ModalitySchema = z.enum(BLOCK_MODALITIES);
const AreaSchema = z.enum(FOCUS_AREAS);

/**
 * A slot is either a routine from the library or a plain session — a yoga class
 * has no exercise list, but still belongs in a week. The database enforces the
 * same either/or, so a malformed slot cannot be written by any path.
 */
export const WeekSlotInput = z.union([
  z.object({
    weekday: WeekdaySchema,
    dayPart: DayPartSchema.default("am"),
    routineId: z.string().uuid(),
  }),
  z.object({
    weekday: WeekdaySchema,
    dayPart: DayPartSchema.default("am"),
    modality: ModalitySchema,
    name: z.string().min(1).max(120),
    durationMin: z.number().int().min(1).max(600).nullable().optional(),
    areaTags: z.array(AreaSchema).default([]),
  }),
]);
export type WeekSlotInput = z.input<typeof WeekSlotInput>;

export const WeekTemplateInput = z.object({
  name: z.string().min(1).max(80),
  slots: z.array(WeekSlotInput).max(40),
});
export type WeekTemplateInput = z.input<typeof WeekTemplateInput>;

export type WeekTemplateSlot = {
  id: string;
  weekday: number;
  dayPart: string;
  routineId: string | null;
  /** Resolved from the routine when the slot points at one. */
  name: string;
  modality: string;
  durationMin: number | null;
  areaTags: string[];
};

export type WeekTemplate = {
  id: string;
  name: string;
  slots: WeekTemplateSlot[];
};

type Result<T> = { success: true; data: T } | { success: false; error: string };

type SlotRow = {
  id: string;
  weekday: number;
  day_part: string;
  routine_id: string | null;
  modality: string | null;
  name: string | null;
  duration_min: number | null;
  area_tags: string[] | null;
  position: number;
  routine: { name: string; est_duration_min: number | null } | null;
};

/**
 * A routine-backed slot takes its name and duration from the routine at read
 * time rather than from a copy made when the template was saved, so renaming a
 * routine updates every week that uses it.
 */
function toSlot(row: SlotRow): WeekTemplateSlot {
  return {
    id: row.id,
    weekday: row.weekday,
    dayPart: row.day_part,
    routineId: row.routine_id,
    name: row.routine?.name ?? row.name ?? "Session",
    modality: row.modality ?? "prehab",
    durationMin: row.routine?.est_duration_min ?? row.duration_min,
    areaTags: row.area_tags ?? [],
  };
}

const SLOT_SELECT =
  "id, weekday, day_part, routine_id, modality, name, duration_min, area_tags, position, routine(name, est_duration_min)";

export async function listWeekTemplates(
  supabase: SupabaseClient,
  userId: string,
): Promise<Result<WeekTemplate[]>> {
  const { data, error } = await supabase
    .from("week_template")
    .select(`id, name, week_template_slot(${SLOT_SELECT})`)
    .eq("user_id", userId)
    .order("name");

  if (error) return { success: false, error: error.message };

  const templates = (data ?? []).map((row) => {
    const slots = ((row.week_template_slot ?? []) as unknown as SlotRow[])
      .slice()
      .sort((a, b) => a.weekday - b.weekday || a.position - b.position)
      .map(toSlot);
    return { id: row.id as string, name: row.name as string, slots };
  });

  return { success: true, data: templates };
}

/**
 * Slot inputs to database rows.
 *
 * Every row carries every column, even the ones a given kind of slot does not
 * use. PostgREST builds a bulk insert from the union of keys across the batch,
 * so a column omitted by one row and present on another is sent as an explicit
 * NULL rather than falling back to its default — which meant a template mixing
 * a routine slot with a plain one failed on `area_tags` not-null, while a
 * template of either kind alone saved fine.
 *
 * Exported so the shape can be asserted directly; that failure only appeared
 * with a specific mix, which is exactly the kind a round-trip test misses.
 */
export function toSlotRows(templateId: string, slots: WeekSlotInput[]): Record<string, unknown>[] {
  const perDay = new Map<number, number>();
  return slots.map((slot) => {
    const position = perDay.get(slot.weekday) ?? 0;
    perDay.set(slot.weekday, position + 1);
    const isRoutine = "routineId" in slot;
    return {
      week_template_id: templateId,
      weekday: slot.weekday,
      day_part: slot.dayPart ?? "am",
      position,
      routine_id: isRoutine ? slot.routineId : null,
      modality: isRoutine ? null : slot.modality,
      name: isRoutine ? null : slot.name,
      duration_min: isRoutine ? null : (slot.durationMin ?? null),
      area_tags: isRoutine ? [] : (slot.areaTags ?? []),
    };
  });
}

async function writeSlots(
  supabase: SupabaseClient,
  templateId: string,
  slots: WeekSlotInput[],
): Promise<string | null> {
  await supabase.from("week_template_slot").delete().eq("week_template_id", templateId);
  if (slots.length === 0) return null;

  const { error } = await supabase.from("week_template_slot").insert(toSlotRows(templateId, slots));
  return error?.message ?? null;
}

export async function createWeekTemplate(
  supabase: SupabaseClient,
  userId: string,
  input: WeekTemplateInput,
): Promise<Result<{ id: string }>> {
  const parsed = WeekTemplateInput.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("week_template")
    .insert({ user_id: userId, name: parsed.data.name })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Could not create" };

  const slotError = await writeSlots(supabase, data.id, parsed.data.slots);
  if (slotError) {
    // A template with no slots does nothing when applied, which would look like
    // a silent failure later. Roll it back rather than leave an empty shell.
    await supabase.from("week_template").delete().eq("id", data.id);
    return { success: false, error: slotError };
  }

  return { success: true, data: { id: data.id } };
}

export async function updateWeekTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
  input: WeekTemplateInput,
): Promise<Result<{ id: string }>> {
  const parsed = WeekTemplateInput.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("week_template")
    .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("user_id", userId);

  if (error) return { success: false, error: error.message };

  const slotError = await writeSlots(supabase, templateId, parsed.data.slots);
  if (slotError) return { success: false, error: slotError };

  return { success: true, data: { id: templateId } };
}

export async function deleteWeekTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
): Promise<Result<null>> {
  const { error } = await supabase
    .from("week_template")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId);
  return error ? { success: false, error: error.message } : { success: true, data: null };
}

export type ApplyResult = {
  created: number;
  /** Slots skipped because that session was already on that day. */
  skipped: number;
  weeksApplied: number;
};

/**
 * Write a template's sessions into real weeks.
 *
 * The blocks created are ordinary ones — nothing downstream can tell they came
 * from a template, so completion, coverage, load and deletion all work on them
 * unchanged.
 *
 * Applying the same template to the same week twice is a mistake worth
 * absorbing rather than punishing: a slot whose session is already on that day
 * at that day part is skipped, so a second apply is a no-op instead of a
 * duplicate week you have to unpick by hand.
 */
export async function applyWeekTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
  weekStartDate: string,
  repeatWeeks = 1,
): Promise<Result<ApplyResult>> {
  const weeks = Math.max(1, Math.min(12, Math.round(repeatWeeks)));
  const templates = await listWeekTemplates(supabase, userId);
  if (!templates.success) return templates;

  const template = templates.data.find((t) => t.id === templateId);
  if (!template) return { success: false, error: "That week is no longer available" };
  if (template.slots.length === 0) return { success: false, error: "That week has nothing in it" };

  const firstMonday = startOfWeek(weekStartDate);
  const lastDay = addDays(firstMonday, weeks * 7 - 1);

  // One read covers every week being written, so duplicate detection does not
  // cost a query per slot.
  const { data: existing } = await supabase
    .from("block")
    .select("date, day_part, name, routine_id")
    .eq("user_id", userId)
    .gte("date", firstMonday)
    .lte("date", lastDay);

  const taken = new Set(
    (existing ?? []).map((b) => `${b.date}|${b.day_part}|${b.routine_id ?? b.name}`),
  );

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (let week = 0; week < weeks; week++) {
    // One series id per application, so a whole apply can be identified later.
    const seriesId = crypto.randomUUID();
    for (const slot of template.slots) {
      const date = addDays(firstMonday, week * 7 + slot.weekday);
      const key = `${date}|${slot.dayPart}|${slot.routineId ?? slot.name}`;
      if (taken.has(key)) {
        skipped++;
        continue;
      }
      taken.add(key);
      rows.push({
        user_id: userId,
        date,
        day_part: slot.dayPart,
        modality: slot.modality,
        name: slot.name,
        planned_duration_min: slot.durationMin,
        area_tags: slot.areaTags,
        routine_id: slot.routineId,
        series_id: seriesId,
        status: "planned",
        created_by: "user",
      });
    }
  }

  if (rows.length === 0) {
    return { success: true, data: { created: 0, skipped, weeksApplied: weeks } };
  }

  const { error } = await supabase.from("block").insert(rows);
  if (error) return { success: false, error: error.message };

  return { success: true, data: { created: rows.length, skipped, weeksApplied: weeks } };
}
