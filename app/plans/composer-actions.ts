"use server";

/**
 * Server actions for the manual composer.
 *
 * The plan tree, activation and calendar sync already exist and are shared with
 * the coach-authored path. What is here is only what building a plan by hand
 * needs: scaffolding a work/recovery pattern, pointing an item at an exact
 * workout, and deriving next week's workout from this week's.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { applyVariation, describeVariation, type VariationOps } from "@/lib/workouts/variation";
import { materialiseRoles } from "@/lib/workouts/roles";
import {
  calculateAverageIntensityFromItems,
  calculateTotalDurationFromItems,
} from "@/lib/workouts/utils";
import type { BuilderItem } from "@/lib/workouts/types";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Unexpected error");

/**
 * Create the blocks and weeks for a work/recovery pattern.
 *
 * A pattern of 3 work + 1 recovery over 12 weeks is three cycles: Build (3
 * weeks), Recovery (1), Build, Recovery, Build, Recovery. The last cycle is
 * truncated rather than overshooting, so the plan is exactly the length asked
 * for — `duration_weeks` is capped at 52 in the schema and the two must agree.
 */
export async function scaffoldManualPlan(params: {
  planId: string;
  workWeeks: number;
  recoveryWeeks: number;
  durationWeeks: number;
}) {
  try {
    const supabase = await createClient();
    const { planId, workWeeks, recoveryWeeks, durationWeeks } = params;
    if (workWeeks < 1) return { success: false as const, error: "A block needs at least one week" };

    const { error: clearError } = await supabase
      .from("plan_blocks")
      .delete()
      .eq("plan_id", planId);
    if (clearError) return { success: false as const, error: clearError.message };

    let remaining = durationWeeks;
    let orderIndex = 0;
    let cycle = 1;

    while (remaining > 0) {
      for (const [kind, length] of [
        ["work", workWeeks],
        ["recovery", recoveryWeeks],
      ] as const) {
        if (remaining <= 0 || length <= 0) continue;
        const weeks = Math.min(length, remaining);
        const { data: block, error } = await supabase
          .from("plan_blocks")
          .insert({
            plan_id: planId,
            order_index: orderIndex,
            name: kind === "work" ? `Build ${cycle}` : `Recovery ${cycle}`,
            duration_weeks: weeks,
            goal: kind,
          })
          .select("id")
          .single();
        if (error) return { success: false as const, error: error.message };

        const weekRows = Array.from({ length: weeks }, (_, i) => ({
          block_id: block.id as string,
          order_index: i,
        }));
        const { error: weekError } = await supabase.from("plan_weeks").insert(weekRows);
        if (weekError) return { success: false as const, error: weekError.message };

        remaining -= weeks;
        orderIndex++;
        if (kind === "recovery") cycle++;
      }
      // A pattern of "all work, no recovery" would otherwise spin here. The
      // cycle advances too, or every block ends up called "Build 1".
      if (recoveryWeeks <= 0 && remaining > 0) {
        cycle++;
        const { data: block, error } = await supabase
          .from("plan_blocks")
          .insert({
            plan_id: planId,
            order_index: orderIndex,
            name: `Build ${cycle}`,
            duration_weeks: remaining,
            goal: "work",
          })
          .select("id")
          .single();
        if (error) return { success: false as const, error: error.message };
        const weekRows = Array.from({ length: remaining }, (_, i) => ({
          block_id: block.id as string,
          order_index: i,
        }));
        await supabase.from("plan_weeks").insert(weekRows);
        remaining = 0;
      }
    }

    revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

/** Put an existing workout on a day. */
export async function setDayWorkout(params: {
  weekId: string;
  dayOfWeek: number;
  workoutId: string;
  planId: string;
}) {
  try {
    const supabase = await createClient();
    const { data: dayRow, error: dayError } = await supabase
      .from("plan_days")
      .upsert(
        { week_id: params.weekId, day_of_week: params.dayOfWeek },
        { onConflict: "week_id,day_of_week" },
      )
      .select("id")
      .single();
    if (dayError) return { success: false as const, error: dayError.message };

    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .select("duration_seconds")
      .eq("id", params.workoutId)
      .single();
    if (workoutError) return { success: false as const, error: workoutError.message };

    const { data, error } = await supabase
      .from("plan_day_items")
      .insert({
        day_id: dayRow.id as string,
        order_index: 0,
        kind: "cycling",
        workout_id: params.workoutId,
        target_duration_min: workout?.duration_seconds
          ? Math.round((workout.duration_seconds as number) / 60)
          : null,
      })
      .select("id")
      .single();
    if (error) return { success: false as const, error: error.message };

    revalidatePath(`/plans/${params.planId}`);
    return { success: true as const, id: data.id as string };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

/**
 * Move an item to another day, without touching anything derived from it.
 *
 * Deliberately just a move. Regenerating the weeks below because a card was
 * dragged would rewrite work you had already approved; the composer marks the
 * broken link instead and leaves re-deriving to you.
 */
export async function movePlanItem(params: {
  itemId: string;
  weekId: string;
  dayOfWeek: number;
  planId: string;
}) {
  try {
    const supabase = await createClient();
    const { data: dayRow, error: dayError } = await supabase
      .from("plan_days")
      .upsert(
        { week_id: params.weekId, day_of_week: params.dayOfWeek },
        { onConflict: "week_id,day_of_week" },
      )
      .select("id")
      .single();
    if (dayError) return { success: false as const, error: dayError.message };

    const { error } = await supabase
      .from("plan_day_items")
      .update({ day_id: dayRow.id as string })
      .eq("id", params.itemId);
    if (error) return { success: false as const, error: error.message };

    revalidatePath(`/plans/${params.planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export type DerivePreview = {
  name: string;
  durationMin: number;
  avgIntensity: number;
  intervals: BuilderItem[];
  description: string;
};

/** What a variation would produce, without writing anything. */
export async function previewDerivedWorkout(params: {
  sourceWorkoutId: string;
  ops: VariationOps;
}): Promise<{ success: true; preview: DerivePreview } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: source, error } = await supabase
      .from("workouts")
      .select("name, intervals")
      .eq("id", params.sourceWorkoutId)
      .single();
    if (error || !source) return { success: false as const, error: error?.message ?? "Not found" };

    const intervals = applyVariation(source.intervals as BuilderItem[], params.ops);
    const description = describeVariation(params.ops);

    return {
      success: true as const,
      preview: {
        name: description ? `${source.name} · ${description}` : (source.name as string),
        durationMin: Math.round(calculateTotalDurationFromItems(intervals) / 60),
        avgIntensity: Math.round(calculateAverageIntensityFromItems(intervals)),
        intervals,
        description,
      },
    };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

/**
 * Materialise a variation as a real workout and put it on a day.
 *
 * Written as a workout with `is_library = false`, so a twelve-week plan does not
 * add fifty variants to a library of seventy-eight. Roles are stamped in at this
 * point: the derived workout must carry explicit roles, or deriving from it in
 * turn would re-infer them from a shape the operators have already changed.
 */
export async function createDerivedWorkout(params: {
  sourceWorkoutId: string;
  ops: VariationOps;
  weekId: string;
  dayOfWeek: number;
  planId: string;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const previewResult = await previewDerivedWorkout({
      sourceWorkoutId: params.sourceWorkoutId,
      ops: params.ops,
    });
    if (!previewResult.success) return previewResult;
    const preview = previewResult.preview;

    const { data: source } = await supabase
      .from("workouts")
      .select("category, archetype")
      .eq("id", params.sourceWorkoutId)
      .single();

    const { data: workout, error } = await supabase
      .from("workouts")
      .insert({
        user_id: user.id,
        name: preview.name,
        category: source?.category ?? "threshold",
        description: `Derived from a workout: ${preview.description}`,
        tags: [],
        intervals: materialiseRoles(preview.intervals),
        archetype: source?.archetype ?? null,
        is_library: false,
        is_preset: false,
        is_public: false,
        duration_seconds: preview.durationMin * 60,
        avg_intensity_percent: preview.avgIntensity,
      })
      .select("id")
      .single();
    if (error) return { success: false as const, error: error.message };

    return setDayWorkout({
      weekId: params.weekId,
      dayOfWeek: params.dayOfWeek,
      workoutId: workout.id as string,
      planId: params.planId,
    });
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

/**
 * Take a plan off the calendar.
 *
 * Only future rows go. The past is what was actually scheduled at the time and
 * deleting it would rewrite history — the same rule `resyncPlanCalendar`
 * already follows.
 */
export async function deactivatePlan(planId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const today = new Date().toISOString().slice(0, 10);
    const { data: removed, error } = await supabase
      .from("scheduled_workouts")
      .delete()
      .eq("plan_id", planId)
      .eq("user_id", user.id)
      .gte("scheduled_date", today)
      .select("id");
    if (error) return { success: false as const, error: error.message };

    const { error: planError } = await supabase
      .from("training_plans")
      .update({ status: "draft", activated_at: null })
      .eq("id", planId)
      .eq("user_id", user.id);
    if (planError) return { success: false as const, error: planError.message };

    revalidatePath(`/plans/${planId}`);
    revalidatePath("/calendar");
    return { success: true as const, removed: removed?.length ?? 0 };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export type WorkoutOption = {
  id: string;
  name: string;
  category: string;
  durationMin: number | null;
  avgIntensity: number | null;
};

/**
 * Workouts you can put on a day.
 *
 * Library and preset workouts only — the variants this composer generates are
 * `is_library = false` precisely so they do not come back round as options and
 * turn a twelve-week plan into seventy new library entries.
 */
export async function listComposerWorkouts(search?: string) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("workouts")
      .select("id, name, category, duration_seconds, avg_intensity_percent")
      .or("is_library.eq.true,is_preset.eq.true")
      .order("name")
      .limit(60);
    if (search?.trim()) query = query.ilike("name", `%${search.trim()}%`);

    const { data, error } = await query;
    if (error) return { success: false as const, error: error.message, workouts: [] };

    return {
      success: true as const,
      workouts: (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        category: row.category as string,
        durationMin: row.duration_seconds ? Math.round((row.duration_seconds as number) / 60) : null,
        avgIntensity: (row.avg_intensity_percent as number | null) ?? null,
      })) satisfies WorkoutOption[],
    };
  } catch (error) {
    return { success: false as const, error: errMsg(error), workouts: [] };
  }
}

/** Take a workout off a day. */
export async function removeDayItem(itemId: string, planId: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("plan_day_items").delete().eq("id", itemId);
    if (error) return { success: false as const, error: error.message };
    revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

/** Add one more week to the end of the last block. */
export async function appendPlanWeek(planId: string) {
  try {
    const supabase = await createClient();
    const { data: blocks, error } = await supabase
      .from("plan_blocks")
      .select("id, duration_weeks, order_index")
      .eq("plan_id", planId)
      .order("order_index", { ascending: false })
      .limit(1);
    if (error) return { success: false as const, error: error.message };
    const last = blocks?.[0];
    if (!last) return { success: false as const, error: "Add a block first" };

    // plan_blocks.duration_weeks is capped at 26 and the plan at 52; growing a
    // block past its cap would fail on the constraint rather than here.
    if ((last.duration_weeks as number) >= 26) {
      return { success: false as const, error: "That block is full — add a new block instead" };
    }

    const { error: weekError } = await supabase
      .from("plan_weeks")
      .insert({ block_id: last.id as string, order_index: last.duration_weeks as number });
    if (weekError) return { success: false as const, error: weekError.message };

    await supabase
      .from("plan_blocks")
      .update({ duration_weeks: (last.duration_weeks as number) + 1 })
      .eq("id", last.id as string);

    const { data: plan } = await supabase
      .from("training_plans")
      .select("duration_weeks")
      .eq("id", planId)
      .single();
    if (plan && (plan.duration_weeks as number) < 52) {
      await supabase
        .from("training_plans")
        .update({ duration_weeks: (plan.duration_weeks as number) + 1 })
        .eq("id", planId);
    }

    revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

/**
 * Names and durations for every workout a plan references.
 *
 * The composer grid renders workout names, and the plan tree only stores ids.
 * Resolved in one query on the server rather than a lookup per cell.
 */
export async function getPlanWorkoutNames(planId: string) {
  try {
    const supabase = await createClient();
    const { data: blocks } = await supabase
      .from("plan_blocks")
      .select("id, plan_weeks(id, plan_days(id, plan_day_items(workout_id)))")
      .eq("plan_id", planId);

    const ids = new Set<string>();
    for (const block of (blocks ?? []) as unknown as {
      plan_weeks: { plan_days: { plan_day_items: { workout_id: string | null }[] }[] }[];
    }[]) {
      for (const week of block.plan_weeks ?? []) {
        for (const day of week.plan_days ?? []) {
          for (const item of day.plan_day_items ?? []) {
            if (item.workout_id) ids.add(item.workout_id);
          }
        }
      }
    }
    if (ids.size === 0) return { success: true as const, workouts: {} };

    const { data, error } = await supabase
      .from("workouts")
      .select("id, name, duration_seconds")
      .in("id", [...ids]);
    if (error) return { success: false as const, error: error.message, workouts: {} };

    const workouts: Record<string, { name: string; durationMin: number | null }> = {};
    for (const row of data ?? []) {
      workouts[row.id as string] = {
        name: row.name as string,
        durationMin: row.duration_seconds
          ? Math.round((row.duration_seconds as number) / 60)
          : null,
      };
    }
    return { success: true as const, workouts };
  } catch (error) {
    return { success: false as const, error: errMsg(error), workouts: {} };
  }
}

/** The full workout behind a plan item, for the detail modal. */
export async function getWorkoutForPreview(workoutId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", workoutId)
      .single();
    if (error) return { success: false as const, error: error.message, workout: null };
    return { success: true as const, workout: data };
  } catch (error) {
    return { success: false as const, error: errMsg(error), workout: null };
  }
}
