"use server";

/**
 * Thin server actions: authenticate, call the service layer, revalidate.
 *
 * No business logic lives here — it is all in lib/training/service and
 * lib/training/derive, so a coach can reach the same behaviour without going
 * through a React action.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  computeAreaCoverage,
  computeWeekLoad,
  rankRoutines,
  startOfWeek,
} from "@/lib/training/derive";
import { readTrainingWindow } from "@/lib/training/read";
import * as service from "@/lib/training/service";
import type {
  AreaCoverage,
  CoverageGoalRow,
  PlannedItem,
  RoutineCoverage,
  WeekLoad,
} from "@/lib/training/types";
import type { FocusArea } from "@/lib/training/taxonomy";

type Result<T> = { success: true; data: T } | { success: false; error: string };

async function withUser<T>(
  run: (
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
  ) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return { success: false, error: "Not authenticated" };
    return await run(supabase, user.id);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

function revalidateTraining() {
  revalidatePath("/calendar");
  revalidatePath("/training");
  revalidatePath("/today");
}

// ── Reads ───────────────────────────────────────────────────────────

export type TrainingWindowPayload = {
  items: PlannedItem[];
  weeks: WeekLoad[];
  coverage: AreaCoverage[];
};

/**
 * Everything a training surface needs for a date range, derived once.
 *
 * Coverage is computed over a longer lookback than the requested window —
 * "last done 9 days ago" is meaningless if the window only reaches back 7.
 */
export async function getTrainingWindow(
  startDate: string,
  endDate: string,
): Promise<Result<TrainingWindowPayload>> {
  return withUser(async (supabase, userId) => {
    const coverageLookbackStart = addDaysISO(startDate, -120);

    const [window, coverageWindow, goalsResult] = await Promise.all([
      readTrainingWindow(supabase, userId, startDate, endDate),
      readTrainingWindow(supabase, userId, coverageLookbackStart, endDate),
      supabase.from("coverage_goal").select("area, target_days, is_default").eq("user_id", userId),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const goals = (goalsResult.data ?? []) as Pick<
      CoverageGoalRow,
      "area" | "target_days" | "is_default"
    >[];

    const weeks: WeekLoad[] = [];
    let cursor = startOfWeek(startDate);
    while (cursor <= endDate) {
      weeks.push(computeWeekLoad(window.loadInputs, cursor));
      cursor = addDaysISO(cursor, 7);
    }

    return {
      success: true,
      data: {
        items: window.items,
        weeks,
        coverage: computeAreaCoverage(coverageWindow.coverageEvents, goals, today),
      },
    };
  });
}

function addDaysISO(date: string, amount: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

export type RoutineSummary = {
  id: string;
  name: string;
  estDurationMin: number | null;
  isPreset: boolean;
  coverageVector: RoutineCoverage;
  /** Last time a block backed by this routine was completed. */
  lastDoneDate: string | null;
  daysSinceDone: number | null;
  exerciseCount: number;
};

export type TrainingOverview = {
  coverage: AreaCoverage[];
  routines: (RoutineSummary & { fixesAreas: string[]; urgency: number })[];
};

/**
 * The coverage view and /today both need the same thing: where you stand, and
 * which routine addresses it. Derived once, here.
 */
export async function getTrainingOverview(): Promise<Result<TrainingOverview>> {
  return withUser(async (supabase, userId) => {
    const today = new Date().toISOString().slice(0, 10);
    const lookbackStart = addDaysISO(today, -120);

    const [window, goalsResult, routinesResult, doneBlocksResult] = await Promise.all([
      readTrainingWindow(supabase, userId, lookbackStart, today),
      supabase.from("coverage_goal").select("area, target_days, is_default").eq("user_id", userId),
      supabase
        .from("routine")
        .select("id, name, est_duration_min, is_preset, coverage_vector, routine_item(count)")
        .is("archived_at", null)
        .order("est_duration_min"),
      supabase
        .from("block")
        .select("routine_id, date, status")
        .eq("user_id", userId)
        .not("routine_id", "is", null)
        .in("status", ["done", "partial"])
        .lte("date", today)
        .order("date", { ascending: false }),
    ]);

    const goals = (goalsResult.data ?? []) as Pick<
      CoverageGoalRow,
      "area" | "target_days" | "is_default"
    >[];
    const coverage = computeAreaCoverage(window.coverageEvents, goals, today);

    // Most recent completion per routine. The query is already sorted newest
    // first, so the first hit for a routine wins.
    const lastDone = new Map<string, string>();
    for (const row of (doneBlocksResult.data ?? []) as { routine_id: string; date: string }[]) {
      if (!lastDone.has(row.routine_id)) lastDone.set(row.routine_id, row.date);
    }

    type RoutineRow = {
      id: string;
      name: string;
      est_duration_min: number | null;
      is_preset: boolean;
      coverage_vector: RoutineCoverage;
      routine_item: { count: number }[];
    };

    const summaries: RoutineSummary[] = ((routinesResult.data ?? []) as RoutineRow[]).map((row) => {
      const doneDate = lastDone.get(row.id) ?? null;
      return {
        id: row.id,
        name: row.name,
        estDurationMin: row.est_duration_min,
        isPreset: row.is_preset,
        coverageVector: row.coverage_vector ?? {},
        lastDoneDate: doneDate,
        daysSinceDone: doneDate ? daysBetweenISO(doneDate, today) : null,
        exerciseCount: row.routine_item?.[0]?.count ?? 0,
      };
    });

    return {
      success: true,
      data: { coverage, routines: rankRoutines(summaries, coverage) },
    };
  });
}

function daysBetweenISO(from: string, to: string): number {
  return Math.round(
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000,
  );
}

export async function scheduleRoutineAction(
  routineId: string,
  date: string,
  dayPart: "am" | "midday" | "pm" = "am",
) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.scheduleRoutine(supabase, userId, routineId, date, dayPart);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

/** Schedule a routine for today and tick it in one go — the "just did it" path. */
export async function logRoutineNowAction(routineId: string) {
  const result = await withUser(async (supabase, userId) => {
    const today = new Date().toISOString().slice(0, 10);
    const scheduled = await service.scheduleRoutine(supabase, userId, routineId, today, "am");
    if (!scheduled.success) return { success: false as const, error: scheduled.error };
    const done = await service.recordBlockCompletion(supabase, userId, scheduled.data.id, {
      status: "done",
      actualDurationMin: scheduled.data.planned_duration_min,
    });
    return done.success
      ? { success: true as const, data: scheduled.data }
      : { success: false as const, error: done.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function getRoutineDetail(routineId: string) {
  return withUser(async (supabase) => {
    const { data, error } = await supabase
      .from("routine_item")
      .select("position, dose, exercise:exercise(id, name, regions, stimulus, cues, equipment, default_dose)")
      .eq("routine_id", routineId)
      .order("position");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  });
}

export async function getBlockTemplates() {
  return withUser(async (supabase, userId) => {
    const { data, error } = await supabase
      .from("block_template")
      .select("*")
      .eq("user_id", userId)
      .order("name");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  });
}

// ── Mutations ───────────────────────────────────────────────────────

export async function scheduleBlockAction(input: service.ScheduleBlockInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.scheduleBlock(supabase, userId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function updateBlockAction(blockId: string, input: service.UpdateBlockInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.updateBlock(supabase, userId, blockId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function rescheduleBlockAction(
  blockId: string,
  date: string,
  dayPart?: "am" | "midday" | "pm",
) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.rescheduleBlock(supabase, userId, blockId, date, dayPart);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function deleteBlockAction(blockId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.deleteBlock(supabase, userId, blockId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function acceptBlockAction(blockId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.acceptBlock(supabase, userId, blockId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function recordCompletionAction(
  blockId: string,
  input: service.RecordCompletionInput,
) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.recordBlockCompletion(supabase, userId, blockId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function clearCompletionAction(blockId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.clearBlockCompletion(supabase, userId, blockId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function createBlockTemplateAction(input: service.BlockTemplateInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.createBlockTemplate(supabase, userId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function scheduleFromTemplateAction(
  templateId: string,
  date: string,
  dayPart: "am" | "midday" | "pm" = "am",
) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.scheduleFromTemplate(supabase, userId, templateId, date, dayPart);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function setAreaGoalAction(area: FocusArea, targetDays: number) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.setAreaGoal(supabase, userId, area, targetDays);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function resetAreaGoalAction(area: FocusArea) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.resetAreaGoal(supabase, userId, area);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function resetAllAreaGoalsAction() {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.resetAllAreaGoals(supabase, userId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}
