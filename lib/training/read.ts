/**
 * The union (D1) — the ONLY place that knows bike sessions live in a different
 * table from everything else.
 *
 * Non-bike sessions are `block` rows. Bike sessions stay in
 * `scheduled_workouts`, created and edited by the existing cycling flow. Both
 * come out of here as `PlannedItem`, and nothing downstream — no component, no
 * view, no service function — may branch on `source`. If that branching escapes
 * this file, the indirection has stopped paying for itself.
 *
 * Three separate outputs, because they answer three different questions:
 *   • `items`          — what is on the calendar (planned rides + blocks).
 *   • `loadInputs`     — what actually happened, for load maths. Rides
 *                        contribute through their imported activity, not
 *                        through their planned row; two sources for the same
 *                        number would eventually disagree.
 *   • `coverageEvents` — which focus areas were stimulated, and when.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateAverageIntensityFromItems, calculateTotalDurationFromItems, calculateTSS } from "@/lib/workouts/utils";
import { validateWorkout, type Workout } from "@/lib/workouts/types";
import { estimateRpeFromIntensity } from "./derive";
import { areasOfRegions, isCompleted, isLoaded, type FocusArea } from "./taxonomy";
import type {
  BlockRow,
  CompletionRow,
  CoverageEvent,
  PlannedItem,
  RoutineCoverage,
} from "./types";

export type LoadInput = {
  item: PlannedItem;
  actualDurationMin?: number | null;
  srpe?: number | null;
};

export type TrainingWindow = {
  items: PlannedItem[];
  loadInputs: LoadInput[];
  coverageEvents: CoverageEvent[];
  /** Keyed by block id, for surfaces that need the tick detail. */
  completionsByBlockId: Map<string, CompletionRow>;
};

type ScheduledWorkoutRow = {
  id: string;
  scheduled_date: string;
  day_part: PlannedItem["dayPart"] | null;
  status: string | null;
  workout: Workout | Workout[] | null;
};

type ActivityRow = {
  id: string;
  activity_date: string;
  name: string | null;
  moving_time: number | null;
  icu_intensity: number | null;
  icu_training_load: number | null;
  rpe: number | null;
  rpe_estimated: boolean | null;
};

function blockToItem(row: BlockRow): PlannedItem {
  return {
    id: row.id,
    source: "block",
    date: row.date,
    dayPart: row.day_part,
    modality: row.modality,
    name: row.name,
    plannedDurationMin: row.planned_duration_min,
    plannedRpe: row.planned_rpe,
    areaTags: row.area_tags ?? [],
    routineId: row.routine_id,
    seriesId: row.series_id,
    templateId: row.template_id,
    status: row.status,
    createdBy: row.created_by,
    acceptedAt: row.accepted_at,
    editableHere: true,
    workoutId: null,
    plannedTss: null,
  };
}

function scheduledToItem(row: ScheduledWorkoutRow): PlannedItem | null {
  const candidate = Array.isArray(row.workout) ? row.workout[0] : row.workout;
  const workout = candidate ? validateWorkout(candidate) : null;
  if (!workout) return null;

  const durationSeconds =
    workout.duration_seconds ?? calculateTotalDurationFromItems(workout.intervals);
  const avgIntensity =
    workout.avg_intensity_percent ?? calculateAverageIntensityFromItems(workout.intervals);

  return {
    id: row.id,
    source: "scheduled_workout",
    date: row.scheduled_date,
    dayPart: row.day_part ?? "am",
    modality: "bike",
    name: workout.name,
    plannedDurationMin: Math.round(durationSeconds / 60),
    // A planned ride has no sRPE until it is ridden; load comes from the
    // imported activity, so this stays null rather than guessing.
    plannedRpe: null,
    areaTags: [],
    routineId: null,
    seriesId: null,
    templateId: null,
    status: (row.status as PlannedItem["status"]) ?? "planned",
    createdBy: "user",
    acceptedAt: null,
    // Rides are anchors here: visible, load-bearing, but still created and
    // edited only through the cycling flow.
    editableHere: false,
    workoutId: workout.id,
    plannedTss: calculateTSS(avgIntensity, durationSeconds),
  };
}

/**
 * A completed ride, expressed as a PlannedItem so it can go through the same
 * load maths as everything else. This is what actually happened, as opposed to
 * the `scheduled_workouts` row, which is what was intended.
 */
function activityToItem(row: ActivityRow): PlannedItem {
  return {
    id: `activity:${row.id}`,
    source: "scheduled_workout",
    date: row.activity_date,
    dayPart: "am",
    modality: "bike",
    name: row.name ?? "Ride",
    plannedDurationMin: row.moving_time ? Math.round(row.moving_time / 60) : null,
    plannedRpe: null,
    areaTags: [],
    routineId: null,
    seriesId: null,
    templateId: null,
    status: "done",
    createdBy: "user",
    acceptedAt: null,
    editableHere: false,
    workoutId: null,
    plannedTss: row.icu_training_load != null ? Math.round(row.icu_training_load) : null,
  };
}

/**
 * Which areas a completed block stimulated, and whether anything loaded them.
 *
 * Two sources, in order of precision:
 *   1. A routine's stored coverage vector — knows loaded vs stretch per area.
 *   2. The block's own area tags — used by block templates and one-off blocks.
 *      Strength, prehab and yoga count as loaded; a mobility block does not.
 */
function blockCoverage(
  item: PlannedItem,
  routineCoverage: RoutineCoverage | null,
): { area: FocusArea; loaded: boolean }[] {
  if (routineCoverage) {
    return Object.entries(routineCoverage).map(([area, value]) => ({
      area: area as FocusArea,
      loaded: Boolean(value?.loaded),
    }));
  }
  const loaded = item.modality !== "mobility";
  return item.areaTags.map((area) => ({ area, loaded }));
}

export async function readTrainingWindow(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<TrainingWindow> {
  const [blocksResult, scheduledResult, activitiesResult] = await Promise.all([
    supabase
      .from("block")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true }),
    supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, day_part, status, workout:workouts(*)")
      .eq("user_id", userId)
      .gte("scheduled_date", startDate)
      .lte("scheduled_date", endDate)
      .order("scheduled_date", { ascending: true }),
    supabase
      .from("activities")
      .select("id, activity_date, name, moving_time, icu_intensity, icu_training_load, rpe, rpe_estimated")
      .eq("user_id", userId)
      .gte("activity_date", startDate)
      .lte("activity_date", endDate),
  ]);

  const blockRows = (blocksResult.data ?? []) as BlockRow[];
  const scheduledRows = (scheduledResult.data ?? []) as unknown as ScheduledWorkoutRow[];
  const activityRows = (activitiesResult.data ?? []) as ActivityRow[];

  const blockItems = blockRows.map(blockToItem);
  const scheduledItems = scheduledRows
    .map(scheduledToItem)
    .filter((item): item is PlannedItem => item !== null);

  const items = [...blockItems, ...scheduledItems];

  // Completions and routine coverage, only for the blocks actually in range.
  const blockIds = blockRows.map((b) => b.id);
  const routineIds = [...new Set(blockRows.map((b) => b.routine_id).filter((id): id is string => !!id))];

  const [completionsResult, routinesResult] = await Promise.all([
    blockIds.length
      ? supabase.from("completion").select("*").in("block_id", blockIds)
      : Promise.resolve({ data: [] as CompletionRow[] }),
    routineIds.length
      ? supabase.from("routine").select("id, coverage_vector").in("id", routineIds)
      : Promise.resolve({ data: [] as { id: string; coverage_vector: RoutineCoverage }[] }),
  ]);

  const completionsByBlockId = new Map<string, CompletionRow>();
  for (const row of (completionsResult.data ?? []) as CompletionRow[]) {
    if (row.block_id) completionsByBlockId.set(row.block_id, row);
  }

  const coverageByRoutineId = new Map<string, RoutineCoverage>();
  for (const row of (routinesResult.data ?? []) as { id: string; coverage_vector: RoutineCoverage }[]) {
    coverageByRoutineId.set(row.id, row.coverage_vector ?? {});
  }

  // ── Load: completed blocks, plus rides via their imported activity ──
  const loadInputs: LoadInput[] = [];

  for (const item of blockItems) {
    if (!isCompleted(item.status)) continue;
    const completion = completionsByBlockId.get(item.id);
    loadInputs.push({
      item,
      actualDurationMin: completion?.actual_duration_min ?? item.plannedDurationMin,
      srpe: completion?.srpe ?? item.plannedRpe,
    });
  }

  for (const activity of activityRows) {
    const item = activityToItem(activity);
    const srpe = activity.rpe ?? estimateRpeFromIntensity(activity.icu_intensity);
    loadInputs.push({
      item,
      actualDurationMin: item.plannedDurationMin,
      srpe,
    });
  }

  // ── Coverage: completed blocks only ─────────────────────────────────
  const coverageEvents: CoverageEvent[] = [];
  for (const item of blockItems) {
    if (!isCompleted(item.status)) continue;
    const routineCoverage = item.routineId ? coverageByRoutineId.get(item.routineId) ?? null : null;
    for (const entry of blockCoverage(item, routineCoverage)) {
      coverageEvents.push({ date: item.date, area: entry.area, loaded: entry.loaded });
    }
  }

  return { items, loadInputs, coverageEvents, completionsByBlockId };
}

/**
 * Coverage vector for a routine, from its exercises. Derived on save and stored
 * on the routine so the coverage view never has to walk exercises at read time.
 */
export function routineCoverageFromExercises(
  exercises: { regions: Parameters<typeof areasOfRegions>[0]; stimulus: Parameters<typeof isLoaded>[0] }[],
): RoutineCoverage {
  const vector: RoutineCoverage = {};
  for (const exercise of exercises) {
    const loaded = isLoaded(exercise.stimulus);
    for (const area of areasOfRegions(exercise.regions)) {
      vector[area] = { loaded: Boolean(vector[area]?.loaded) || loaded };
    }
  }
  return vector;
}
