"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  PlanAdaptation,
  PlanBlock,
  PlanBlockWithChildren,
  PlanDay,
  PlanDayItem,
  PlanListRow,
  PlanWeek,
  PlanWeekWithChildren,
  PlanWithTree,
  TrainingPlan,
  PlanItemKind,
} from "@/lib/plans/types";
import {
  buildActivationPreview,
  type ActivationPreview,
} from "@/lib/plans/activation";
import { computeWeekShiftOperations } from "@/lib/plans/week-shift";
import type { Workout } from "@/lib/workouts/types";

// ── Read ────────────────────────────────────────────────────────────

export async function listPlans() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return { success: false as const, error: "Not authenticated", plans: [] };

    const { data, error } = await supabase
      .from("training_plans")
      .select(
        "id, name, goal, duration_weeks, status, start_date, target_event_id, updated_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) return { success: false as const, error: error.message, plans: [] };

    return { success: true as const, plans: (data as PlanListRow[]) ?? [] };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
      plans: [],
    };
  }
}

export async function getPlan(id: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return { success: false as const, error: "Not authenticated", plan: null };

    const { data: planRow, error: planErr } = await supabase
      .from("training_plans")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (planErr) return { success: false as const, error: planErr.message, plan: null };
    if (!planRow) return { success: false as const, error: "Plan not found", plan: null };

    const plan = planRow as TrainingPlan;

    // Fetch the full tree in parallel via relational joins. RLS on child tables
    // guards access but we already proved ownership with the top-level query.
    const { data: blockRows, error: blockErr } = await supabase
      .from("plan_blocks")
      .select("*")
      .eq("plan_id", plan.id)
      .order("order_index", { ascending: true });
    if (blockErr) return { success: false as const, error: blockErr.message, plan: null };

    const blockIds = (blockRows ?? []).map((b) => (b as PlanBlock).id);
    const { data: weekRows, error: weekErr } = blockIds.length
      ? await supabase
          .from("plan_weeks")
          .select("*")
          .in("block_id", blockIds)
          .order("order_index", { ascending: true })
      : { data: [], error: null };
    if (weekErr) return { success: false as const, error: weekErr.message, plan: null };

    const weekIds = (weekRows ?? []).map((w) => (w as PlanWeek).id);
    const { data: dayRows, error: dayErr } = weekIds.length
      ? await supabase
          .from("plan_days")
          .select("*")
          .in("week_id", weekIds)
          .order("day_of_week", { ascending: true })
      : { data: [], error: null };
    if (dayErr) return { success: false as const, error: dayErr.message, plan: null };

    const dayIds = (dayRows ?? []).map((d) => (d as PlanDay).id);
    const { data: itemRows, error: itemErr } = dayIds.length
      ? await supabase
          .from("plan_day_items")
          .select("*")
          .in("day_id", dayIds)
          .order("order_index", { ascending: true })
      : { data: [], error: null };
    if (itemErr) return { success: false as const, error: itemErr.message, plan: null };

    const items = (itemRows ?? []) as PlanDayItem[];
    const days = (dayRows ?? []).map((d) => {
      const day = d as PlanDay;
      return { ...day, items: items.filter((i) => i.day_id === day.id) };
    });
    const weeks: PlanWeekWithChildren[] = (weekRows ?? []).map((w) => {
      const week = w as PlanWeek;
      return { ...week, days: days.filter((d) => d.week_id === week.id) };
    });
    const blocks: PlanBlockWithChildren[] = (blockRows ?? []).map((b) => {
      const block = b as PlanBlock;
      return { ...block, weeks: weeks.filter((w) => w.block_id === block.id) };
    });

    const tree: PlanWithTree = { ...plan, blocks };
    return { success: true as const, plan: tree };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
      plan: null,
    };
  }
}

// ── Write ───────────────────────────────────────────────────────────

export async function createPlan(params: {
  name: string;
  duration_weeks: number;
  goal?: string | null;
  philosophy?: string | null;
  target_event_id?: string | null;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    if (!params.name.trim()) return { success: false as const, error: "Name is required" };
    if (!Number.isInteger(params.duration_weeks) || params.duration_weeks < 1 || params.duration_weeks > 52)
      return { success: false as const, error: "duration_weeks must be between 1 and 52" };

    const { data, error } = await supabase
      .from("training_plans")
      .insert({
        user_id: user.id,
        name: params.name.trim(),
        duration_weeks: params.duration_weeks,
        goal: params.goal ?? null,
        philosophy: params.philosophy ?? null,
        target_event_id: params.target_event_id ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false as const, error: error.message };

    revalidatePath("/plans");
    return { success: true as const, id: data.id as string };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function updatePlan(
  id: string,
  params: Partial<{
    name: string;
    goal: string | null;
    philosophy: string | null;
    duration_weeks: number;
    target_event_id: string | null;
  }>,
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const { error } = await supabase
      .from("training_plans")
      .update(params)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false as const, error: error.message };

    revalidatePath("/plans");
    revalidatePath(`/plans/${id}`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function archivePlan(id: string) {
  return updatePlanStatus(id, "archived");
}

async function updatePlanStatus(id: string, status: "draft" | "active" | "archived") {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const { error } = await supabase
      .from("training_plans")
      .update({ status })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false as const, error: error.message };

    revalidatePath("/plans");
    revalidatePath(`/plans/${id}`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deletePlan(id: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const { error } = await supabase
      .from("training_plans")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false as const, error: error.message };

    revalidatePath("/plans");
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── Block CRUD ──────────────────────────────────────────────────────
// RLS on plan_blocks verifies ownership via the nested training_plans row,
// so we don't need to re-check user_id here — any unauthorised row will be
// rejected with a policy violation.

export async function createPlanBlock(params: {
  plan_id: string;
  name: string;
  duration_weeks: number;
  goal?: string | null;
  rationale?: string | null;
}) {
  try {
    const supabase = await createClient();

    // Append at the end — pick the next order_index for this plan.
    const { data: existing, error: idxErr } = await supabase
      .from("plan_blocks")
      .select("order_index")
      .eq("plan_id", params.plan_id)
      .order("order_index", { ascending: false })
      .limit(1);
    if (idxErr) return { success: false as const, error: idxErr.message };
    const nextIndex = existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

    const { data, error } = await supabase
      .from("plan_blocks")
      .insert({
        plan_id: params.plan_id,
        order_index: nextIndex,
        name: params.name.trim(),
        duration_weeks: params.duration_weeks,
        goal: params.goal ?? null,
        rationale: params.rationale ?? null,
      })
      .select("id")
      .single();
    if (error) return { success: false as const, error: error.message };

    revalidatePath(`/plans/${params.plan_id}`);
    return { success: true as const, id: data.id as string };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function updatePlanBlock(
  id: string,
  params: Partial<{ name: string; duration_weeks: number; goal: string | null; rationale: string | null }>,
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plan_blocks")
      .update(params)
      .eq("id", id)
      .select("plan_id")
      .single();
    if (error) return { success: false as const, error: error.message };
    revalidatePath(`/plans/${data.plan_id}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function deletePlanBlock(id: string) {
  try {
    const supabase = await createClient();
    const { data: block, error: fetchErr } = await supabase
      .from("plan_blocks")
      .select("plan_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return { success: false as const, error: fetchErr.message };
    if (!block) return { success: false as const, error: "Block not found" };

    const { error } = await supabase.from("plan_blocks").delete().eq("id", id);
    if (error) return { success: false as const, error: error.message };

    revalidatePath(`/plans/${block.plan_id}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

// ── Week CRUD ──────────────────────────────────────────────────────

export async function createPlanWeek(params: {
  block_id: string;
  order_index?: number;
  theme?: string | null;
  target_tss?: number | null;
  rationale?: string | null;
}) {
  try {
    const supabase = await createClient();

    let orderIndex = params.order_index;
    if (orderIndex == null) {
      const { data: existing, error: idxErr } = await supabase
        .from("plan_weeks")
        .select("order_index")
        .eq("block_id", params.block_id)
        .order("order_index", { ascending: false })
        .limit(1);
      if (idxErr) return { success: false as const, error: idxErr.message };
      orderIndex = existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;
    }

    const { data, error } = await supabase
      .from("plan_weeks")
      .insert({
        block_id: params.block_id,
        order_index: orderIndex,
        theme: params.theme ?? null,
        target_tss: params.target_tss ?? null,
        rationale: params.rationale ?? null,
      })
      .select("id, block_id")
      .single();
    if (error) return { success: false as const, error: error.message };

    const planId = await lookupPlanIdForBlock(supabase, data.block_id as string);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const, id: data.id as string };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function updatePlanWeek(
  id: string,
  params: Partial<{ theme: string | null; target_tss: number | null; rationale: string | null }>,
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plan_weeks")
      .update(params)
      .eq("id", id)
      .select("block_id")
      .single();
    if (error) return { success: false as const, error: error.message };
    const planId = await lookupPlanIdForBlock(supabase, data.block_id as string);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function deletePlanWeek(id: string) {
  try {
    const supabase = await createClient();
    const { data: week, error: fetchErr } = await supabase
      .from("plan_weeks")
      .select("block_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return { success: false as const, error: fetchErr.message };
    if (!week) return { success: false as const, error: "Week not found" };

    const { error } = await supabase.from("plan_weeks").delete().eq("id", id);
    if (error) return { success: false as const, error: error.message };

    const planId = await lookupPlanIdForBlock(supabase, week.block_id as string);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

// ── Strategic week ops ─────────────────────────────────────────────
//
// These operate on the week shape of a plan: cloning, reordering, or
// inserting a fresh week. order_index is UNIQUE per (block_id, order_index),
// so any shift needs the two-phase (negative bump → final) dance to avoid
// constraint collisions.

export async function duplicatePlanWeek(weekId: string) {
  try {
    const supabase = await createClient();

    const { data: source, error: fetchErr } = await supabase
      .from("plan_weeks")
      .select("id, block_id, order_index, theme, target_tss, rationale")
      .eq("id", weekId)
      .maybeSingle();
    if (fetchErr) return { success: false as const, error: fetchErr.message };
    if (!source) return { success: false as const, error: "Week not found" };

    const blockId = source.block_id as string;
    const insertIndex = (source.order_index as number) + 1;

    const shiftErr = await shiftWeeksForward(supabase, blockId, insertIndex);
    if (shiftErr) return { success: false as const, error: shiftErr };

    const { data: newWeek, error: insertErr } = await supabase
      .from("plan_weeks")
      .insert({
        block_id: blockId,
        order_index: insertIndex,
        theme: source.theme,
        target_tss: source.target_tss,
        rationale: source.rationale,
      })
      .select("id")
      .single();
    if (insertErr) return { success: false as const, error: insertErr.message };

    // Clone day subtrees (days + items). Notes on days are copied too.
    const { data: sourceDays, error: daysErr } = await supabase
      .from("plan_days")
      .select("id, day_of_week, notes")
      .eq("week_id", weekId);
    if (daysErr) return { success: false as const, error: daysErr.message };

    for (const srcDay of sourceDays ?? []) {
      const { data: newDay, error: newDayErr } = await supabase
        .from("plan_days")
        .insert({
          week_id: newWeek.id,
          day_of_week: srcDay.day_of_week,
          notes: srcDay.notes,
        })
        .select("id")
        .single();
      if (newDayErr) return { success: false as const, error: newDayErr.message };

      const { data: srcItems, error: itemsErr } = await supabase
        .from("plan_day_items")
        .select(
          "order_index, kind, archetype, target_duration_min, target_tiz_min, notes",
        )
        .eq("day_id", srcDay.id as string)
        .order("order_index", { ascending: true });
      if (itemsErr) return { success: false as const, error: itemsErr.message };

      if ((srcItems ?? []).length > 0) {
        const rows = (srcItems ?? []).map((it) => ({
          day_id: newDay.id,
          order_index: it.order_index,
          kind: it.kind,
          archetype: it.archetype,
          target_duration_min: it.target_duration_min,
          target_tiz_min: it.target_tiz_min,
          notes: it.notes,
        }));
        const { error: cloneErr } = await supabase
          .from("plan_day_items")
          .insert(rows);
        if (cloneErr) return { success: false as const, error: cloneErr.message };
      }
    }

    const planId = await lookupPlanIdForBlock(supabase, blockId);
    if (planId) {
      await supabase.from("plan_adaptations").insert({
        plan_id: planId,
        scope: "week",
        reason: "Duplicated week",
        triggered_by: "user",
        block_id: blockId,
        week_id: newWeek.id as string,
        details: { action: "duplicate", source_week_id: weekId },
      });
      revalidatePath(`/plans/${planId}`);
    }

    return { success: true as const, id: newWeek.id as string };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function swapPlanWeeks(weekIdA: string, weekIdB: string) {
  try {
    if (weekIdA === weekIdB)
      return { success: false as const, error: "Cannot swap a week with itself" };

    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("plan_weeks")
      .select("id, block_id, order_index")
      .in("id", [weekIdA, weekIdB]);
    if (error) return { success: false as const, error: error.message };
    if (!rows || rows.length !== 2)
      return { success: false as const, error: "Both weeks not found" };

    const [a, b] = rows;
    if (a.block_id !== b.block_id)
      return {
        success: false as const,
        error: "Cross-block swaps are not supported yet",
      };

    // Two-phase: park one row at a negative index first.
    const parkIndex = -(Math.max(a.order_index as number, b.order_index as number) + 1);
    const { error: step1Err } = await supabase
      .from("plan_weeks")
      .update({ order_index: parkIndex })
      .eq("id", a.id as string);
    if (step1Err) return { success: false as const, error: step1Err.message };
    const { error: step2Err } = await supabase
      .from("plan_weeks")
      .update({ order_index: a.order_index as number })
      .eq("id", b.id as string);
    if (step2Err) return { success: false as const, error: step2Err.message };
    const { error: step3Err } = await supabase
      .from("plan_weeks")
      .update({ order_index: b.order_index as number })
      .eq("id", a.id as string);
    if (step3Err) return { success: false as const, error: step3Err.message };

    const planId = await lookupPlanIdForBlock(supabase, a.block_id as string);
    if (planId) {
      await supabase.from("plan_adaptations").insert({
        plan_id: planId,
        scope: "week",
        reason: "Swapped weeks",
        triggered_by: "user",
        block_id: a.block_id as string,
        week_id: a.id as string,
        details: {
          action: "swap",
          other_week_id: b.id as string,
          from_index: a.order_index,
          to_index: b.order_index,
        },
      });
      revalidatePath(`/plans/${planId}`);
    }
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function insertRecoveryWeek(params: {
  block_id: string;
  after_order_index: number | null;
  target_tss?: number | null;
}) {
  try {
    const supabase = await createClient();

    const insertIndex =
      params.after_order_index == null ? 0 : params.after_order_index + 1;

    const shiftErr = await shiftWeeksForward(supabase, params.block_id, insertIndex);
    if (shiftErr) return { success: false as const, error: shiftErr };

    const { data: newWeek, error: insertErr } = await supabase
      .from("plan_weeks")
      .insert({
        block_id: params.block_id,
        order_index: insertIndex,
        theme: "Recovery",
        target_tss: params.target_tss ?? null,
        rationale: "Unload week — reduce volume and intensity to absorb prior load.",
      })
      .select("id")
      .single();
    if (insertErr) return { success: false as const, error: insertErr.message };

    const planId = await lookupPlanIdForBlock(supabase, params.block_id);
    if (planId) {
      await supabase.from("plan_adaptations").insert({
        plan_id: planId,
        scope: "week",
        reason: "Inserted recovery week",
        triggered_by: "user",
        block_id: params.block_id,
        week_id: newWeek.id as string,
        details: { action: "insert_recovery", at_index: insertIndex },
      });
      revalidatePath(`/plans/${planId}`);
    }
    return { success: true as const, id: newWeek.id as string };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

async function shiftWeeksForward(
  supabase: SupabaseClient,
  blockId: string,
  fromIndex: number,
): Promise<string | null> {
  const { data: toShift, error } = await supabase
    .from("plan_weeks")
    .select("id, order_index")
    .eq("block_id", blockId)
    .gte("order_index", fromIndex);
  if (error) return error.message;

  const ops = computeWeekShiftOperations(
    (toShift ?? []).map((r) => ({
      id: r.id as string,
      order_index: r.order_index as number,
    })),
    fromIndex,
  );

  for (const op of ops) {
    const { error: e1 } = await supabase
      .from("plan_weeks")
      .update({ order_index: op.parkIndex })
      .eq("id", op.id);
    if (e1) return e1.message;
  }
  for (const op of ops) {
    const { error: e2 } = await supabase
      .from("plan_weeks")
      .update({ order_index: op.finalIndex })
      .eq("id", op.id);
    if (e2) return e2.message;
  }
  return null;
}

// ── Day + Item CRUD ────────────────────────────────────────────────

export async function upsertPlanDayNotes(params: {
  week_id: string;
  day_of_week: number;
  notes: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plan_days")
      .upsert(
        {
          week_id: params.week_id,
          day_of_week: params.day_of_week,
          notes: params.notes,
        },
        { onConflict: "week_id,day_of_week" },
      )
      .select("id, week_id")
      .single();
    if (error) return { success: false as const, error: error.message };
    const planId = await lookupPlanIdForWeek(supabase, data.week_id as string);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const, id: data.id as string };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

// Create an item, materialising the plan_day row first if it does not yet
// exist. This lets the UI work purely off (week_id, day_of_week) without
// requiring callers to know whether a plan_days row already exists.
export async function createPlanDayItem(params: {
  week_id: string;
  day_of_week: number;
  kind: PlanItemKind;
  archetype?: string | null;
  target_duration_min?: number | null;
  target_tiz_min?: number | null;
  notes?: string | null;
}) {
  try {
    const supabase = await createClient();

    // Upsert the day row.
    const { data: dayRow, error: dayErr } = await supabase
      .from("plan_days")
      .upsert(
        { week_id: params.week_id, day_of_week: params.day_of_week },
        { onConflict: "week_id,day_of_week" },
      )
      .select("id, week_id")
      .single();
    if (dayErr) return { success: false as const, error: dayErr.message };
    const dayId = dayRow.id as string;

    // Next order_index within the day.
    const { data: existing, error: idxErr } = await supabase
      .from("plan_day_items")
      .select("order_index")
      .eq("day_id", dayId)
      .order("order_index", { ascending: false })
      .limit(1);
    if (idxErr) return { success: false as const, error: idxErr.message };
    const nextIndex = existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

    const { data, error } = await supabase
      .from("plan_day_items")
      .insert({
        day_id: dayId,
        order_index: nextIndex,
        kind: params.kind,
        archetype: params.archetype ?? null,
        target_duration_min: params.target_duration_min ?? null,
        target_tiz_min: params.target_tiz_min ?? null,
        notes: params.notes ?? null,
      })
      .select("id")
      .single();
    if (error) return { success: false as const, error: error.message };

    const planId = await lookupPlanIdForWeek(supabase, dayRow.week_id as string);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const, id: data.id as string };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function updatePlanDayItem(
  id: string,
  params: Partial<{
    kind: PlanItemKind;
    archetype: string | null;
    target_duration_min: number | null;
    target_tiz_min: number | null;
    notes: string | null;
  }>,
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plan_day_items")
      .update(params)
      .eq("id", id)
      .select("day_id")
      .single();
    if (error) return { success: false as const, error: error.message };
    const planId = await lookupPlanIdForDay(supabase, data.day_id as string);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function deletePlanDayItem(id: string) {
  try {
    const supabase = await createClient();
    const { data: item, error: fetchErr } = await supabase
      .from("plan_day_items")
      .select("day_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return { success: false as const, error: fetchErr.message };
    if (!item) return { success: false as const, error: "Item not found" };

    const { error } = await supabase.from("plan_day_items").delete().eq("id", id);
    if (error) return { success: false as const, error: error.message };

    const planId = await lookupPlanIdForDay(supabase, item.day_id as string);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

export async function reorderPlanDayItems(dayId: string, orderedIds: string[]) {
  try {
    const supabase = await createClient();
    // Two-phase reorder so we don't hit the (day_id, order_index) uniqueness
    // constraint: bump everything into a disjoint negative range first, then
    // assign the final positions.
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from("plan_day_items")
        .update({ order_index: -(i + 1) })
        .eq("id", orderedIds[i])
        .eq("day_id", dayId);
      if (error) return { success: false as const, error: error.message };
    }
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from("plan_day_items")
        .update({ order_index: i })
        .eq("id", orderedIds[i])
        .eq("day_id", dayId);
      if (error) return { success: false as const, error: error.message };
    }
    const planId = await lookupPlanIdForDay(supabase, dayId);
    if (planId) revalidatePath(`/plans/${planId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

// ── Archetype catalog ──────────────────────────────────────────────

export type ArchetypeOption = {
  id: string;
  name: string;
  category: string;
  zone_label: string;
  default_duration_min: number | null;
  default_duration_max: number | null;
  default_tiz_min: number | null;
  default_tiz_max: number | null;
};

export async function listArchetypes() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workout_archetypes")
      .select(
        "id, name, category, zone_label, default_duration_min, default_duration_max, default_tiz_min, default_tiz_max, display_order",
      )
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return { success: false as const, error: error.message, archetypes: [] };
    return {
      success: true as const,
      archetypes: (data ?? []) as ArchetypeOption[],
    };
  } catch (error) {
    return { success: false as const, error: errMsg(error), archetypes: [] };
  }
}

// ── Activation ─────────────────────────────────────────────────────

/**
 * Fetch a plan + candidate workouts and build an activation preview.
 * This is a pure read — no DB writes — so the wizard can surface expected
 * outcomes (and any unresolved items) before the rider commits.
 */
export async function previewActivation(planId: string, startDate: string) {
  try {
    if (!isValidDate(startDate))
      return { success: false as const, error: "Invalid start date" };

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return { success: false as const, error: "Not authenticated" };

    const planResult = await getPlan(planId);
    if (!planResult.success || !planResult.plan)
      return { success: false as const, error: planResult.error ?? "Plan not found" };

    const candidates = await loadMatcherCandidates(supabase, user.id);
    const preview = buildActivationPreview(planResult.plan, startDate, candidates);
    return { success: true as const, preview };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

/**
 * Activate a plan: inserts scheduled_workouts rows for every resolvable
 * cycling item, updates each plan_day_item.scheduled_workout_id, and flips
 * the plan to active status with the given start_date. Non-cycling or
 * unresolved items are skipped and surfaced via the returned preview.
 */
export async function activatePlan(planId: string, startDate: string) {
  try {
    if (!isValidDate(startDate))
      return { success: false as const, error: "Invalid start date" };

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return { success: false as const, error: "Not authenticated" };

    const planResult = await getPlan(planId);
    if (!planResult.success || !planResult.plan)
      return { success: false as const, error: planResult.error ?? "Plan not found" };
    if (planResult.plan.status !== "draft")
      return {
        success: false as const,
        error: `Cannot activate a ${planResult.plan.status} plan`,
      };

    const candidates = await loadMatcherCandidates(supabase, user.id);
    const preview = buildActivationPreview(planResult.plan, startDate, candidates);

    const rowsToInsert = preview.entries
      .filter((e) => !e.unresolved && e.workoutId)
      .map((e) => ({
        user_id: user.id,
        workout_id: e.workoutId!,
        scheduled_date: e.date,
        plan_id: planId,
        plan_day_item_id: e.itemId,
      }));

    if (rowsToInsert.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from("scheduled_workouts")
        .insert(rowsToInsert)
        .select("id, plan_day_item_id");
      if (insertErr) return { success: false as const, error: insertErr.message };

      // Link each created scheduled_workout back onto its plan_day_item so
      // the editor can surface "already scheduled" state and the re-sync
      // flow can tell which items have materialised.
      for (const row of inserted ?? []) {
        if (!row.plan_day_item_id) continue;
        const { error: linkErr } = await supabase
          .from("plan_day_items")
          .update({ scheduled_workout_id: row.id })
          .eq("id", row.plan_day_item_id as string);
        if (linkErr)
          return { success: false as const, error: linkErr.message };
      }
    }

    const nowIso = new Date().toISOString();
    const { error: planUpdateErr } = await supabase
      .from("training_plans")
      .update({
        status: "active",
        start_date: startDate,
        activated_at: nowIso,
      })
      .eq("id", planId)
      .eq("user_id", user.id);
    if (planUpdateErr)
      return { success: false as const, error: planUpdateErr.message };

    const { error: logErr } = await supabase.from("plan_adaptations").insert({
      plan_id: planId,
      scope: "plan",
      reason: `Activated — ${rowsToInsert.length} workouts scheduled starting ${startDate}`,
      triggered_by: "user",
      details: {
        action: "activate",
        start_date: startDate,
        scheduled_count: rowsToInsert.length,
        unresolved_count: preview.unresolvedCycling,
        skipped_non_cycling: preview.nonCyclingSkipped,
      },
    });
    if (logErr) return { success: false as const, error: logErr.message };

    revalidatePath(`/plans/${planId}`);
    revalidatePath("/plans");
    revalidatePath("/calendar");
    return { success: true as const, preview };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Rebuild scheduled_workouts for an active plan from the current plan tree,
 * preserving history. Only future rows (scheduled_date >= today) are touched:
 * they are deleted and re-inserted using the current archetype prescriptions.
 * Past rows are left alone so the calendar retains an accurate record of
 * what was actually scheduled at the time.
 */
export async function resyncPlanCalendar(planId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return { success: false as const, error: "Not authenticated" };

    const planResult = await getPlan(planId);
    if (!planResult.success || !planResult.plan)
      return { success: false as const, error: planResult.error ?? "Plan not found" };
    const plan = planResult.plan;
    if (plan.status !== "active")
      return { success: false as const, error: "Only active plans can be re-synced" };
    if (!plan.start_date)
      return { success: false as const, error: "Active plan is missing a start date" };

    const today = todayIsoLocal();

    const { data: deletedRows, error: delErr } = await supabase
      .from("scheduled_workouts")
      .delete()
      .eq("plan_id", planId)
      .eq("user_id", user.id)
      .gte("scheduled_date", today)
      .select("id");
    if (delErr) return { success: false as const, error: delErr.message };
    const deleted = deletedRows?.length ?? 0;

    const candidates = await loadMatcherCandidates(supabase, user.id);
    const preview = buildActivationPreview(plan, plan.start_date, candidates);

    // Only re-materialise entries from today onward. Past items may have been
    // edited but their prior scheduled_workouts row stays as history.
    const futureEntries = preview.entries.filter(
      (e) => !e.unresolved && e.workoutId && e.date >= today,
    );

    let inserted = 0;
    if (futureEntries.length > 0) {
      const rows = futureEntries.map((e) => ({
        user_id: user.id,
        workout_id: e.workoutId!,
        scheduled_date: e.date,
        plan_id: planId,
        plan_day_item_id: e.itemId,
      }));
      const { data: insRows, error: insErr } = await supabase
        .from("scheduled_workouts")
        .insert(rows)
        .select("id, plan_day_item_id");
      if (insErr) return { success: false as const, error: insErr.message };
      inserted = insRows?.length ?? 0;

      for (const row of insRows ?? []) {
        if (!row.plan_day_item_id) continue;
        const { error: linkErr } = await supabase
          .from("plan_day_items")
          .update({ scheduled_workout_id: row.id })
          .eq("id", row.plan_day_item_id as string);
        if (linkErr) return { success: false as const, error: linkErr.message };
      }
    }

    const unresolvedFuture = preview.entries.filter(
      (e) => e.unresolved && e.kind === "cycling" && e.date >= today,
    ).length;

    const { error: logErr } = await supabase.from("plan_adaptations").insert({
      plan_id: planId,
      scope: "plan",
      reason: `Re-synced calendar — ${inserted} rescheduled, ${deleted} replaced, ${unresolvedFuture} unresolved`,
      triggered_by: "user",
      details: {
        action: "resync",
        from_date: today,
        deleted_future_count: deleted,
        inserted_count: inserted,
        unresolved_future_count: unresolvedFuture,
      },
    });
    if (logErr) return { success: false as const, error: logErr.message };

    revalidatePath(`/plans/${planId}`);
    revalidatePath("/calendar");
    return {
      success: true as const,
      inserted,
      deleted,
      unresolvedFuture,
    };
  } catch (error) {
    return { success: false as const, error: errMsg(error) };
  }
}

async function loadMatcherCandidates(
  supabase: SupabaseClient,
  userId: string,
): Promise<Workout[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, name, category, description, tags, intervals, archetype, duration_seconds, time_in_zone_seconds, user_id, is_public, is_preset, is_library",
    )
    .not("archetype", "is", null)
    .or(`user_id.eq.${userId},is_public.eq.true,is_preset.eq.true`);
  if (error) {
    console.warn("[activation] failed to load candidates:", error.message);
    return [];
  }
  return (data ?? []) as unknown as Workout[];
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === (m ?? 1) - 1 &&
    dt.getDate() === (d ?? 1)
  );
}

// ── Adaptations ────────────────────────────────────────────────────

export async function listPlanAdaptations(planId: string, limit = 50) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return { success: false as const, error: "Not authenticated", adaptations: [] };

    // Ownership check via the parent plan row. RLS would also block but we
    // prefer an explicit 404 signal to the caller.
    const { data: plan, error: planErr } = await supabase
      .from("training_plans")
      .select("id")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (planErr) return { success: false as const, error: planErr.message, adaptations: [] };
    if (!plan) return { success: false as const, error: "Plan not found", adaptations: [] };

    const { data, error } = await supabase
      .from("plan_adaptations")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { success: false as const, error: error.message, adaptations: [] };

    return {
      success: true as const,
      adaptations: (data ?? []) as PlanAdaptation[],
    };
  } catch (error) {
    return {
      success: false as const,
      error: errMsg(error),
      adaptations: [],
    };
  }
}

export type AdaptationFeedEntry = PlanAdaptation & {
  plan_name: string;
  plan_status: TrainingPlan["status"];
};

export type AdaptationFeedCursor = { createdAt: string; id: string };

export async function listAllAdaptations(params?: {
  limit?: number;
  scope?: PlanAdaptation["scope"] | null;
  triggeredBy?: PlanAdaptation["triggered_by"] | null;
  planId?: string | null;
  cursor?: AdaptationFeedCursor | null;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return {
        success: false as const,
        error: "Not authenticated",
        entries: [],
        nextCursor: null,
      };

    const pageSize = params?.limit ?? 50;

    let query = supabase
      .from("plan_adaptations")
      .select(
        "id, plan_id, block_id, week_id, day_id, item_id, scope, reason, triggered_by, details, created_at, training_plans!inner(name, status, user_id)",
      )
      .eq("training_plans.user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize + 1);

    if (params?.scope) query = query.eq("scope", params.scope);
    if (params?.triggeredBy) query = query.eq("triggered_by", params.triggeredBy);
    if (params?.planId) query = query.eq("plan_id", params.planId);

    // Keyset pagination: rows with (created_at, id) strictly less than the cursor.
    // Postgres tuple comparison via .or() — older rows are those whose
    // created_at is earlier, OR created_at is equal and id is strictly less.
    if (params?.cursor) {
      const { createdAt, id } = params.cursor;
      query = query.or(
        `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
      );
    }

    const { data, error } = await query;
    if (error)
      return {
        success: false as const,
        error: error.message,
        entries: [],
        nextCursor: null,
      };

    type Row = Omit<PlanAdaptation, "id"> & {
      id: string;
      training_plans:
        | { name: string; status: TrainingPlan["status"] }
        | { name: string; status: TrainingPlan["status"] }[];
    };

    const rows = (data ?? []) as unknown as Row[];
    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;

    const entries: AdaptationFeedEntry[] = page.map((row) => {
      const plan = Array.isArray(row.training_plans)
        ? row.training_plans[0]
        : row.training_plans;
      const { training_plans: _tp, ...rest } = row;
      void _tp;
      return {
        ...(rest as PlanAdaptation),
        plan_name: plan?.name ?? "(unknown)",
        plan_status: plan?.status ?? "draft",
      };
    });

    const last = entries.at(-1);
    const nextCursor: AdaptationFeedCursor | null =
      hasMore && last ? { createdAt: last.created_at, id: last.id } : null;

    return { success: true as const, entries, nextCursor };
  } catch (error) {
    return {
      success: false as const,
      error: errMsg(error),
      entries: [],
      nextCursor: null,
    };
  }
}

// ── helpers ────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function lookupPlanIdForBlock(supabase: SupabaseClient, blockId: string): Promise<string | null> {
  const { data } = await supabase
    .from("plan_blocks")
    .select("plan_id")
    .eq("id", blockId)
    .maybeSingle();
  return (data?.plan_id as string | null) ?? null;
}

async function lookupPlanIdForWeek(supabase: SupabaseClient, weekId: string): Promise<string | null> {
  const { data } = await supabase
    .from("plan_weeks")
    .select("block_id")
    .eq("id", weekId)
    .maybeSingle();
  if (!data?.block_id) return null;
  return lookupPlanIdForBlock(supabase, data.block_id as string);
}

async function lookupPlanIdForDay(supabase: SupabaseClient, dayId: string): Promise<string | null> {
  const { data } = await supabase
    .from("plan_days")
    .select("week_id")
    .eq("id", dayId)
    .maybeSingle();
  if (!data?.week_id) return null;
  return lookupPlanIdForWeek(supabase, data.week_id as string);
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

// ── Plan coach conversations ─────────────────────────────────────

export async function getPlanCoachConversation(planId: string): Promise<{
  success: boolean;
  error?: string;
  messages: unknown[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated", messages: [] };
    }

    const { data: plan } = await supabase
      .from("training_plans")
      .select("id")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!plan) return { success: false, error: "Plan not found", messages: [] };

    const { data, error } = await supabase
      .from("plan_coach_conversations")
      .select("messages")
      .eq("plan_id", planId)
      .maybeSingle();
    if (error) return { success: false, error: error.message, messages: [] };

    const messages = Array.isArray(data?.messages)
      ? (data.messages as unknown[])
      : [];
    return { success: true, messages };
  } catch (error) {
    return {
      success: false,
      error: errMsg(error),
      messages: [],
    };
  }
}

export async function savePlanCoachConversation(
  planId: string,
  messages: unknown[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: "Not authenticated" };

    const { data: plan } = await supabase
      .from("training_plans")
      .select("id")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!plan) return { success: false, error: "Plan not found" };

    const { error } = await supabase
      .from("plan_coach_conversations")
      .upsert(
        { plan_id: planId, messages: messages as never },
        { onConflict: "plan_id" },
      );
    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (error) {
    return { success: false, error: errMsg(error) };
  }
}

export async function clearPlanCoachConversation(
  planId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: "Not authenticated" };

    const { data: plan } = await supabase
      .from("training_plans")
      .select("id")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!plan) return { success: false, error: "Plan not found" };

    const { error } = await supabase
      .from("plan_coach_conversations")
      .delete()
      .eq("plan_id", planId);
    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (error) {
    return { success: false, error: errMsg(error) };
  }
}
