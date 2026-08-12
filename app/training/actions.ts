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
  computeWeekLoad,
  rankRoutines,
  startOfWeek,
} from "@/lib/training/derive";
import { readTrainingWindow } from "@/lib/training/read";
import * as service from "@/lib/training/service";
import type {
  BlockTemplateRow,
  PlannedItem,
  RoutineCoverage,
  WeekLoad,
} from "@/lib/training/types";
import {
  areaOfRegion,
  isLoaded,
  type BodyRegion,
  type FocusArea,
  type StimulusType,
} from "@/lib/training/taxonomy";

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
    // The 120-day lookback existed only to age body areas. Without that, the
    // window is just the window.
    const window = await readTrainingWindow(supabase, userId, startDate, endDate);

    const weeks: WeekLoad[] = [];
    let cursor = startOfWeek(startDate);
    while (cursor <= endDate) {
      weeks.push(computeWeekLoad(window.loadInputs, cursor));
      cursor = addDaysISO(cursor, 7);
    }

    return {
      success: true,
      data: { items: window.items, weeks },
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
  /**
   * The block logged for this routine today, if any. Drives the done-today
   * state and gives Undo something to remove — without it, a routine that is
   * already done looks identical to one that is not, and a second click just
   * writes a duplicate.
   */
  completedTodayBlockId: string | null;
  /**
   * A block scheduled for today but not yet ticked. Same reasoning: without it
   * the Schedule button silently stacked duplicates, because nothing on the
   * page changed to say the routine was already on today.
   */
  scheduledTodayBlockId: string | null;
};

export type TrainingOverview = {
  routines: RoutineSummary[];
};

/**
 * Your routines, least recently done first — which is the whole of "what
 * should I do next" now that areas are a property of a routine rather than a
 * target to hit.
 */
export async function getTrainingOverview(): Promise<Result<TrainingOverview>> {
  return withUser(async (supabase, userId) => {
    const today = new Date().toISOString().slice(0, 10);
    const lookbackStart = addDaysISO(today, -120);

    const [routinesResult, doneBlocksResult] = await Promise.all([
      supabase
        .from("routine")
        .select("id, name, est_duration_min, is_preset, coverage_vector, routine_item(count)")
        .is("archived_at", null)
        .order("est_duration_min"),
      supabase
        .from("block")
        .select("id, routine_id, date, status")
        .eq("user_id", userId)
        .not("routine_id", "is", null)
        .in("status", ["done", "partial", "planned"])
        .lte("date", today)
        .order("date", { ascending: false }),
    ]);

    // Most recent completion per routine. The query is already sorted newest
    // first, so the first hit for a routine wins.
    const lastDone = new Map<string, string>();
    const doneToday = new Map<string, string>();
    const scheduledToday = new Map<string, string>();
    for (const row of (doneBlocksResult.data ?? []) as {
      id: string;
      routine_id: string;
      date: string;
      status: string;
    }[]) {
      const isComplete = row.status === "done" || row.status === "partial";
      if (isComplete && !lastDone.has(row.routine_id)) lastDone.set(row.routine_id, row.date);
      if (row.date !== today) continue;
      if (isComplete) {
        if (!doneToday.has(row.routine_id)) doneToday.set(row.routine_id, row.id);
      } else if (!scheduledToday.has(row.routine_id)) {
        scheduledToday.set(row.routine_id, row.id);
      }
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
        completedTodayBlockId: doneToday.get(row.id) ?? null,
        scheduledTodayBlockId: scheduledToday.get(row.id) ?? null,
      };
    });

    return {
      success: true,
      data: { routines: rankRoutines(summaries) },
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

/**
 * Schedule a routine for today and tick it in one go — the "just did it" path.
 *
 * The two writes are not in one transaction, so the block is removed again if
 * the completion fails. Without that, a failed tick silently leaves a *planned*
 * session behind: the button reports an error, and the user is then also shown
 * work they have already done.
 */
export async function logRoutineNowAction(routineId: string) {
  const result = await withUser(async (supabase, userId) => {
    const today = new Date().toISOString().slice(0, 10);

    // If this routine is already on today's plan, tick that block rather than
    // creating a second one beside it.
    const { data: existing } = await supabase
      .from("block")
      .select("id, planned_duration_min")
      .eq("user_id", userId)
      .eq("routine_id", routineId)
      .eq("date", today)
      .eq("status", "planned")
      .limit(1)
      .maybeSingle();

    if (existing) {
      const done = await service.recordBlockCompletion(supabase, userId, existing.id, {
        status: "done",
        actualDurationMin: existing.planned_duration_min,
      });
      return done.success
        ? { success: true as const, data: { id: existing.id } }
        : { success: false as const, error: done.error };
    }

    const scheduled = await service.scheduleRoutine(supabase, userId, routineId, today, "am");
    if (!scheduled.success) return { success: false as const, error: scheduled.error };

    const done = await service.recordBlockCompletion(supabase, userId, scheduled.data.id, {
      status: "done",
      actualDurationMin: scheduled.data.planned_duration_min,
    });

    if (!done.success) {
      await service.deleteBlock(supabase, userId, scheduled.data.id);
      return { success: false as const, error: done.error };
    }
    return { success: true as const, data: scheduled.data };
  });
  if (result.success) revalidateTraining();
  return result;
}

/**
 * Remove a routine block from today, whether it was scheduled or logged. The
 * completion row goes with it through the cascade, so nothing is left behind
 * claiming the work was done.
 */
export async function undoRoutineTodayAction(blockId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.deleteBlock(supabase, userId, blockId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function getRoutineDetail(routineId: string) {
  return withUser(async (supabase) => {
    const { data, error } = await supabase
      .from("routine_item")
      .select("position, dose, exercise:exercise(id, name, regions, stimulus, cues, description, equipment, default_dose)")
      .eq("routine_id", routineId)
      .order("position");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  });
}

export type BankExercise = {
  id: string;
  name: string;
  regions: BodyRegion[];
  stimulus: StimulusType;
  area: FocusArea;
  defaultDose: unknown;
  equipment: string[];
  difficulty: number | null;
  cues: string | null;
  description: string | null;
  notes: string | null;
  isPreset: boolean;
  isOwn: boolean;
  archivedAt: string | null;
  /** Staleness of the area this exercise serves — drives the ranking. */
  loaded: boolean;
};

/**
 * The bank, ranked stalest-first.
 *
 * The ranking is a deterministic sort on current coverage — same input, same
 * order, every time. No model, no round-trip: the ordering is the guidance and
 * the clicking is the control.
 */
export async function getExerciseBank(
  options: { includeArchived?: boolean } = {},
): Promise<Result<{ exercises: BankExercise[] }>> {
  return withUser(async (supabase, userId) => {
    const today = new Date().toISOString().slice(0, 10);

    let query = supabase.from("exercise").select("*").order("name");
    if (!options.includeArchived) query = query.is("archived_at", null);

    const exercisesResult = await query;
    if (exercisesResult.error) return { success: false, error: exercisesResult.error.message };

    type Row = {
      id: string;
      user_id: string | null;
      name: string;
      regions: BodyRegion[];
      stimulus: StimulusType;
      default_dose: unknown;
      equipment: string[];
      difficulty: number | null;
      cues: string | null;
      description: string | null;
      notes: string | null;
      is_preset: boolean;
      archived_at: string | null;
    };

    const exercises: BankExercise[] = ((exercisesResult.data ?? []) as Row[]).map((row) => {
      // An exercise can name several regions; it is ranked by the area it
      // serves first, which is the one its primary region belongs to.
      const area = areaOfRegion(row.regions[0]);
      return {
        id: row.id,
        name: row.name,
        regions: row.regions,
        stimulus: row.stimulus,
        area,
        defaultDose: row.default_dose,
        equipment: row.equipment ?? [],
        difficulty: row.difficulty,
        cues: row.cues,
        description: row.description,
        notes: row.notes,
        isPreset: row.is_preset,
        isOwn: row.user_id === userId,
        archivedAt: row.archived_at,
        loaded: isLoaded(row.stimulus),
      };
    });

    // Alphabetical. Ordering by how stale an area was made the list reshuffle
    // between visits, which is hostile in a picker you are scanning by name.
    exercises.sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data: { exercises } };
  });
}

export async function createRoutineAction(input: service.RoutineInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.createRoutine(supabase, userId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function updateRoutineAction(routineId: string, input: service.RoutineInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.updateRoutine(supabase, userId, routineId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function duplicateRoutineAction(routineId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.duplicateRoutine(supabase, userId, routineId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function archiveRoutineAction(routineId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.archiveRoutine(supabase, userId, routineId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function createExerciseAction(input: service.ExerciseInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.createExercise(supabase, userId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function updateExerciseAction(exerciseId: string, input: service.ExerciseInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.updateExercise(supabase, userId, exerciseId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function duplicateExerciseAction(exerciseId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.duplicateExercise(supabase, userId, exerciseId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function archiveExerciseAction(exerciseId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.archiveExercise(supabase, userId, exerciseId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

/**
 * Weekly session load for the last `weeks` weeks, for the Fitness page. Kept
 * separate from the PMC data, which stays bike-TSS-only.
 */
export async function getWeeklySessionLoad(weeks = 12): Promise<Result<WeekLoad[]>> {
  return withUser(async (supabase, userId) => {
    const today = new Date().toISOString().slice(0, 10);
    const firstWeekStart = startOfWeek(addDaysISO(today, -7 * (weeks - 1)));
    const window = await readTrainingWindow(supabase, userId, firstWeekStart, today);

    const series: WeekLoad[] = [];
    let cursor = firstWeekStart;
    while (cursor <= today) {
      series.push(computeWeekLoad(window.loadInputs, cursor));
      cursor = addDaysISO(cursor, 7);
    }
    return { success: true, data: series };
  });
}

export async function deleteExerciseAction(exerciseId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.deleteExercise(supabase, userId, exerciseId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function restoreExerciseAction(exerciseId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.restoreExercise(supabase, userId, exerciseId);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export type RoutineOption = {
  id: string;
  name: string;
  estDurationMin: number | null;
  /** The areas the routine covers, so scheduling it can say so up front. */
  areas: FocusArea[];
};

/** Just enough to populate a picker. */
export async function getRoutineOptions(): Promise<Result<RoutineOption[]>> {
  return withUser(async (supabase) => {
    const { data, error } = await supabase
      .from("routine")
      .select("id, name, est_duration_min, coverage_vector")
      .is("archived_at", null)
      .order("est_duration_min");
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        estDurationMin: row.est_duration_min as number | null,
        areas: Object.keys((row.coverage_vector ?? {}) as RoutineCoverage) as FocusArea[],
      })),
    };
  });
}

export async function getBlockTemplates(): Promise<Result<BlockTemplateRow[]>> {
  return withUser(async (supabase, userId) => {
    const { data, error } = await supabase
      .from("block_template")
      .select("*")
      .eq("user_id", userId)
      .order("name");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as BlockTemplateRow[] };
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

export async function updateBlockTemplateAction(
  templateId: string,
  input: service.BlockTemplateInput,
) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.updateBlockTemplate(supabase, userId, templateId, input);
    return res.success ? { success: true as const, data: res.data } : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function deleteBlockTemplateAction(templateId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.deleteBlockTemplate(supabase, userId, templateId);
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




// ── Today snapshot ──────────────────────────────────────────────────

export type WeekDay = {
  date: string;
  /** Riding minutes recorded that day. */
  minutes: number;
  /** Minutes of completed off-bike work that day. */
  offBikeMinutes: number;
  isToday: boolean;
  isFuture: boolean;
};

export type TodaySnapshot = {
  week: WeekDay[];
  weekMinutes: number;
  weekRides: number;
  /** Training stress balance, from the most recent wellness day. */
  form: number | null;
  /** Off-bike sessions logged in the last 30 days. */
  offBike30d: number;
  /** Planned sessions whose day has passed with nothing to show for them. */
  missed: number;
  /**
   * Off-bike sessions this week: how many are on the calendar and how many are
   * done. Null when nothing is scheduled — an expectation you never set is not
   * worth reporting against.
   */
  offBikeWeek: { done: number; scheduled: number } | null;
};

/**
 * Everything the home screen needs about where you stand, in one call.
 *
 * Deliberately small: a week of riding minutes, one number for form, and two
 * counts. The old home screen showed six coverage areas all reading "never",
 * which greeted you with six failures before you had agreed to any of it.
 */
export async function getTodaySnapshot(): Promise<Result<TodaySnapshot>> {
  return withUser(async (supabase, userId) => {
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = startOfWeek(today);
    const weekEnd = addDaysISO(weekStart, 6);
    const monthAgo = addDaysISO(today, -30);

    const [ridesResult, wellnessResult, blocksResult, plannedResult, overviewResult, weekBlocksResult] =
      await Promise.all([
      supabase
        .from("activities")
        .select("activity_date, moving_time")
        .eq("user_id", userId)
        .gte("activity_date", weekStart)
        .lte("activity_date", weekEnd),
      supabase
        .from("wellness")
        .select("tsb")
        .eq("user_id", userId)
        .not("tsb", "is", null)
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(1),
      supabase
        .from("block")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "done")
        .gte("date", monthAgo),
      supabase
        .from("scheduled_workouts")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "planned")
        .lt("scheduled_date", today),
      getTrainingOverview(),
      supabase
        .from("block")
        .select("id, date, status, planned_duration_min, completion(actual_duration_min)")
        .eq("user_id", userId)
        .gte("date", weekStart)
        .lte("date", weekEnd),
    ]);

    const rides = ridesResult.data ?? [];
    const minutesByDate = new Map<string, number>();
    for (const ride of rides) {
      const mins = Math.round((ride.moving_time ?? 0) / 60);
      minutesByDate.set(ride.activity_date, (minutesByDate.get(ride.activity_date) ?? 0) + mins);
    }

    // Off-bike work belongs on the same bars. Logging a routine and seeing the
    // week unchanged reads as the tap not having worked — the count moved, but
    // the only thing shaped like a record of the day did not.
    const offBikeByDate = new Map<string, number>();
    for (const block of (weekBlocksResult.data ?? []) as {
      date: string;
      status: string;
      planned_duration_min: number | null;
      completion: { actual_duration_min: number | null }[] | null;
    }[]) {
      // Minutes are what happened, so a session merely scheduled adds none.
      if (block.status !== "done" && block.status !== "partial") continue;
      const actual = block.completion?.[0]?.actual_duration_min;
      const mins = actual ?? block.planned_duration_min ?? 0;
      offBikeByDate.set(block.date, (offBikeByDate.get(block.date) ?? 0) + mins);
    }

    const week: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
      const date = addDaysISO(weekStart, index);
      return {
        date,
        minutes: minutesByDate.get(date) ?? 0,
        offBikeMinutes: offBikeByDate.get(date) ?? 0,
        isToday: date === today,
        isFuture: date > today,
      };
    });

    // The week's target is what you put on the calendar, not what a formula
    // works out from six intervals nobody chose. Scheduling four sessions makes
    // "2 of 4" a fact; scheduling none means there is nothing to report.
    const weekBlocks = (weekBlocksResult.data ?? []) as { status: string }[];
    const offBikeWeek =
      weekBlocks.length > 0
        ? {
            done: weekBlocks.filter((b) => b.status === "done" || b.status === "partial").length,
            scheduled: weekBlocks.length,
          }
        : null;

    return {
      success: true as const,
      data: {
        week,
        weekMinutes: week.reduce((sum, day) => sum + day.minutes, 0),
        weekRides: rides.length,
        form: wellnessResult.data?.[0]?.tsb ?? null,
        offBike30d: blocksResult.data?.length ?? 0,
        missed: plannedResult.data?.length ?? 0,
        offBikeWeek,
      },
    };
  });
}

// ── Week templates ──────────────────────────────────────────────────

export async function getWeekTemplates(): Promise<Result<service.WeekTemplate[]>> {
  return withUser(async (supabase, userId) => {
    const res = await service.listWeekTemplates(supabase, userId);
    return res.success
      ? { success: true as const, data: res.data }
      : { success: false as const, error: res.error };
  });
}

export async function createWeekTemplateAction(input: service.WeekTemplateInput) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.createWeekTemplate(supabase, userId, input);
    return res.success
      ? { success: true as const, data: res.data }
      : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function updateWeekTemplateAction(
  templateId: string,
  input: service.WeekTemplateInput,
) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.updateWeekTemplate(supabase, userId, templateId, input);
    return res.success
      ? { success: true as const, data: res.data }
      : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function deleteWeekTemplateAction(templateId: string) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.deleteWeekTemplate(supabase, userId, templateId);
    return res.success
      ? { success: true as const, data: null }
      : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}

export async function applyWeekTemplateAction(
  templateId: string,
  weekStartDate: string,
  repeatWeeks = 1,
) {
  const result = await withUser(async (supabase, userId) => {
    const res = await service.applyWeekTemplate(
      supabase,
      userId,
      templateId,
      weekStartDate,
      repeatWeeks,
    );
    return res.success
      ? { success: true as const, data: res.data }
      : { success: false as const, error: res.error };
  });
  if (result.success) revalidateTraining();
  return result;
}
