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
import { computeAreaCoverage, computeWeekLoad, startOfWeek } from "@/lib/training/derive";
import { readTrainingWindow } from "@/lib/training/read";
import * as service from "@/lib/training/service";
import type { AreaCoverage, CoverageGoalRow, PlannedItem, WeekLoad } from "@/lib/training/types";
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
