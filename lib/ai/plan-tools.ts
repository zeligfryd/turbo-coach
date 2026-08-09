import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PLAN_ITEM_KINDS, type AdaptationScope, type PlanItemKind } from "@/lib/plans/types";
import { computeWeekShiftOperations } from "@/lib/plans/week-shift";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Strip null/undefined values from an object to reduce token usage in LLM tool results. */
const compact = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as Partial<T>;

async function logAdaptation(
  supabase: SupabaseServerClient,
  planId: string,
  params: {
    scope: AdaptationScope;
    reason: string;
    block_id?: string | null;
    week_id?: string | null;
    day_id?: string | null;
    item_id?: string | null;
    details?: Record<string, unknown> | null;
  },
) {
  await supabase.from("plan_adaptations").insert({
    plan_id: planId,
    scope: params.scope,
    reason: params.reason,
    triggered_by: "coach",
    block_id: params.block_id ?? null,
    week_id: params.week_id ?? null,
    day_id: params.day_id ?? null,
    item_id: params.item_id ?? null,
    details: params.details ?? null,
  });
}

async function resolveBlockParentPlan(supabase: SupabaseServerClient, blockId: string) {
  const { data } = await supabase
    .from("plan_blocks")
    .select("plan_id")
    .eq("id", blockId)
    .maybeSingle();
  return (data?.plan_id as string | null) ?? null;
}

async function resolveWeekContext(supabase: SupabaseServerClient, weekId: string) {
  const { data } = await supabase
    .from("plan_weeks")
    .select("block_id, plan_blocks!inner(plan_id)")
    .eq("id", weekId)
    .maybeSingle();
  if (!data) return null;
  type Joined = { block_id: string; plan_blocks: { plan_id: string } | { plan_id: string }[] };
  const joined = data as unknown as Joined;
  const block = Array.isArray(joined.plan_blocks) ? joined.plan_blocks[0] : joined.plan_blocks;
  return { blockId: joined.block_id, planId: block?.plan_id ?? null };
}

async function resolveDayContext(supabase: SupabaseServerClient, dayId: string) {
  const { data } = await supabase
    .from("plan_days")
    .select("week_id")
    .eq("id", dayId)
    .maybeSingle();
  if (!data?.week_id) return null;
  const week = await resolveWeekContext(supabase, data.week_id as string);
  if (!week) return null;
  return { weekId: data.week_id as string, blockId: week.blockId, planId: week.planId };
}

async function resolveItemContext(supabase: SupabaseServerClient, itemId: string) {
  const { data } = await supabase
    .from("plan_day_items")
    .select("day_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!data?.day_id) return null;
  const day = await resolveDayContext(supabase, data.day_id as string);
  if (!day) return null;
  return { dayId: data.day_id as string, ...day };
}

async function assertBlockInPlan(supabase: SupabaseServerClient, planId: string, blockId: string) {
  const owner = await resolveBlockParentPlan(supabase, blockId);
  if (owner !== planId) throw new Error("Block does not belong to this plan");
}

async function assertWeekInPlan(supabase: SupabaseServerClient, planId: string, weekId: string) {
  const ctx = await resolveWeekContext(supabase, weekId);
  if (!ctx || ctx.planId !== planId) throw new Error("Week does not belong to this plan");
  return ctx;
}

async function assertItemInPlan(supabase: SupabaseServerClient, planId: string, itemId: string) {
  const ctx = await resolveItemContext(supabase, itemId);
  if (!ctx || ctx.planId !== planId) throw new Error("Item does not belong to this plan");
  return ctx;
}

async function shiftWeeksForwardInline(
  supabase: SupabaseServerClient,
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
    const { error: parkErr } = await supabase
      .from("plan_weeks")
      .update({ order_index: op.parkIndex })
      .eq("id", op.id);
    if (parkErr) return parkErr.message;
  }
  for (const op of ops) {
    const { error: moveErr } = await supabase
      .from("plan_weeks")
      .update({ order_index: op.finalIndex })
      .eq("id", op.id);
    if (moveErr) return moveErr.message;
  }
  return null;
}

/**
 * Names of mutating tools that REQUIRE the rider's explicit approval before
 * executing. These are plan- and block-scoped moves with wide blast radius.
 * Week- and day-scoped edits auto-apply once the rider has approved the
 * block structure, because per-day approvals made the authoring flow
 * unusable.
 */
export const PLAN_COACH_MUTATION_TOOLS = [
  "updatePlanMetadata",
  "addBlock",
  "updateBlock",
  "deleteBlock",
  "proposeBlockStructure",
] as const;

export type PlanCoachMutationTool = (typeof PLAN_COACH_MUTATION_TOOLS)[number];

/**
 * Plan-scoped tools. Ownership of the plan is assumed to be pre-verified
 * by the caller (see app/api/coach/plans/route.ts). Sub-entity ownership is
 * re-checked per call to prevent cross-plan edits. Every mutation requires a
 * `reason` string and is logged to plan_adaptations with triggered_by = 'coach'.
 *
 * Plan- and block-scoped mutations set `needsApproval: true` so the SDK
 * pauses for an Approve/Reject card. Week- and day-scoped mutations run
 * immediately — per-day approvals were too cumbersome during plan
 * authoring, so the rider's approval of the block structure carries
 * through to the weekly/daily fill-in.
 */
export function createPlanCoachTools(planId: string) {
  return {
    // ── Read ──────────────────────────────────────────────────────

    listArchetypes: tool({
      description:
        "List the canonical workout archetype catalog (id, name, category, default durations / time-in-zone). Pass the `id` (e.g. 'threshold_long_reps') as the `archetype` when adding cycling items — NOT the display name.",
      inputSchema: z.object({}),
      execute: async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("workout_archetypes")
          .select(
            "id, name, category, zone_label, default_duration_min, default_duration_max, default_tiz_min, default_tiz_max",
          )
          .order("display_order", { ascending: true });
        if (error) return { error: error.message, archetypes: [] };
        return {
          count: (data ?? []).length,
          archetypes: (data ?? []).map((a) =>
            compact(a as Record<string, unknown>),
          ),
        };
      },
    }),

    // ── Plan metadata ─────────────────────────────────────────────

    updatePlanMetadata: tool({
      needsApproval: true,
      description:
        "Update plan-level fields (name, goal, philosophy, duration_weeks). Include a short reason for the adaptation log.",
      inputSchema: z.object({
        name: z.string().min(1).max(120).optional(),
        goal: z.string().max(500).nullable().optional(),
        philosophy: z.string().max(4000).nullable().optional(),
        duration_weeks: z.number().int().min(1).max(52).optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ reason, ...updates }) => {
        const supabase = await createClient();
        const patch: Record<string, unknown> = {};
        if (updates.name !== undefined) patch.name = updates.name.trim();
        if (updates.goal !== undefined) patch.goal = updates.goal;
        if (updates.philosophy !== undefined) patch.philosophy = updates.philosophy;
        if (updates.duration_weeks !== undefined) patch.duration_weeks = updates.duration_weeks;
        if (Object.keys(patch).length === 0) return { error: "No fields provided" };

        const { error } = await supabase
          .from("training_plans")
          .update(patch)
          .eq("id", planId);
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "plan",
          reason,
          details: { updates: patch },
        });
        return { success: true, updated: Object.keys(patch) };
      },
    }),

    // ── Block CRUD ────────────────────────────────────────────────

    addBlock: tool({
      needsApproval: true,
      description:
        "Append a new block (mesocycle) at the end of the plan. Use for Base / Build / Peak / Taper etc.",
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        duration_weeks: z.number().int().min(1).max(26),
        goal: z.string().max(500).nullable().optional(),
        rationale: z.string().max(1000).nullable().optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ name, duration_weeks, goal, rationale, reason }) => {
        const supabase = await createClient();
        const { data: existing } = await supabase
          .from("plan_blocks")
          .select("order_index")
          .eq("plan_id", planId)
          .order("order_index", { ascending: false })
          .limit(1);
        const nextIndex =
          existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

        const { data, error } = await supabase
          .from("plan_blocks")
          .insert({
            plan_id: planId,
            order_index: nextIndex,
            name: name.trim(),
            duration_weeks,
            goal: goal ?? null,
            rationale: rationale ?? null,
          })
          .select("id")
          .single();
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "block",
          reason,
          block_id: data.id as string,
          details: { action: "add", name, duration_weeks },
        });
        return { success: true, id: data.id as string, order_index: nextIndex };
      },
    }),

    updateBlock: tool({
      needsApproval: true,
      description:
        "Update block fields (name, duration_weeks, goal, rationale). Pass only the fields that should change.",
      inputSchema: z.object({
        block_id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        duration_weeks: z.number().int().min(1).max(26).optional(),
        goal: z.string().max(500).nullable().optional(),
        rationale: z.string().max(1000).nullable().optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ block_id, reason, ...updates }) => {
        const supabase = await createClient();
        try {
          await assertBlockInPlan(supabase, planId, block_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid block" };
        }
        const patch: Record<string, unknown> = {};
        if (updates.name !== undefined) patch.name = updates.name.trim();
        if (updates.duration_weeks !== undefined) patch.duration_weeks = updates.duration_weeks;
        if (updates.goal !== undefined) patch.goal = updates.goal;
        if (updates.rationale !== undefined) patch.rationale = updates.rationale;
        if (Object.keys(patch).length === 0) return { error: "No fields provided" };

        const { error } = await supabase.from("plan_blocks").update(patch).eq("id", block_id);
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "block",
          reason,
          block_id,
          details: { action: "update", updates: patch },
        });
        return { success: true, updated: Object.keys(patch) };
      },
    }),

    deleteBlock: tool({
      needsApproval: true,
      description:
        "Delete a block (and its weeks/days/items). Cascades. Use sparingly.",
      inputSchema: z.object({
        block_id: z.string().uuid(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ block_id, reason }) => {
        const supabase = await createClient();
        try {
          await assertBlockInPlan(supabase, planId, block_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid block" };
        }
        // Log before delete so the block_id is still valid.
        await logAdaptation(supabase, planId, {
          scope: "block",
          reason,
          block_id,
          details: { action: "delete" },
        });
        const { error } = await supabase.from("plan_blocks").delete().eq("id", block_id);
        if (error) return { error: error.message };
        return { success: true };
      },
    }),

    // ── Week CRUD ─────────────────────────────────────────────────

    addWeek: tool({
      description:
        "Append a new week to the given block. Week number within the block is set automatically.",
      inputSchema: z.object({
        block_id: z.string().uuid(),
        theme: z.string().max(120).nullable().optional(),
        target_tss: z.number().int().min(0).max(2000).nullable().optional(),
        rationale: z.string().max(1000).nullable().optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ block_id, theme, target_tss, rationale, reason }) => {
        const supabase = await createClient();
        try {
          await assertBlockInPlan(supabase, planId, block_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid block" };
        }

        const { data: existing } = await supabase
          .from("plan_weeks")
          .select("order_index")
          .eq("block_id", block_id)
          .order("order_index", { ascending: false })
          .limit(1);
        const nextIndex =
          existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

        const { data, error } = await supabase
          .from("plan_weeks")
          .insert({
            block_id,
            order_index: nextIndex,
            theme: theme ?? null,
            target_tss: target_tss ?? null,
            rationale: rationale ?? null,
          })
          .select("id")
          .single();
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "week",
          reason,
          block_id,
          week_id: data.id as string,
          details: { action: "add", theme, target_tss },
        });
        return { success: true, id: data.id as string, order_index: nextIndex };
      },
    }),

    updateWeek: tool({
      description: "Update week fields (theme, target_tss, rationale).",
      inputSchema: z.object({
        week_id: z.string().uuid(),
        theme: z.string().max(120).nullable().optional(),
        target_tss: z.number().int().min(0).max(2000).nullable().optional(),
        rationale: z.string().max(1000).nullable().optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ week_id, reason, ...updates }) => {
        const supabase = await createClient();
        let ctx;
        try {
          ctx = await assertWeekInPlan(supabase, planId, week_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid week" };
        }
        const patch: Record<string, unknown> = {};
        if (updates.theme !== undefined) patch.theme = updates.theme;
        if (updates.target_tss !== undefined) patch.target_tss = updates.target_tss;
        if (updates.rationale !== undefined) patch.rationale = updates.rationale;
        if (Object.keys(patch).length === 0) return { error: "No fields provided" };

        const { error } = await supabase.from("plan_weeks").update(patch).eq("id", week_id);
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "week",
          reason,
          block_id: ctx.blockId,
          week_id,
          details: { action: "update", updates: patch },
        });
        return { success: true, updated: Object.keys(patch) };
      },
    }),

    deleteWeek: tool({
      description: "Delete a week (and its days/items). Cascades.",
      inputSchema: z.object({
        week_id: z.string().uuid(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ week_id, reason }) => {
        const supabase = await createClient();
        let ctx;
        try {
          ctx = await assertWeekInPlan(supabase, planId, week_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid week" };
        }
        await logAdaptation(supabase, planId, {
          scope: "week",
          reason,
          block_id: ctx.blockId,
          week_id,
          details: { action: "delete" },
        });
        const { error } = await supabase.from("plan_weeks").delete().eq("id", week_id);
        if (error) return { error: error.message };
        return { success: true };
      },
    }),

    // ── Strategic week ops ───────────────────────────────────────

    duplicateWeek: tool({
      description:
        "Clone an entire week (days, notes, and items) to the slot immediately after it. Subsequent weeks shift forward by one. Use when the rider wants a repeat of a prior week.",
      inputSchema: z.object({
        week_id: z.string().uuid(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ week_id, reason }) => {
        const supabase = await createClient();
        let ctx;
        try {
          ctx = await assertWeekInPlan(supabase, planId, week_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid week" };
        }

        const { data: source, error: fetchErr } = await supabase
          .from("plan_weeks")
          .select("order_index, theme, target_tss, rationale")
          .eq("id", week_id)
          .maybeSingle();
        if (fetchErr) return { error: fetchErr.message };
        if (!source) return { error: "Source week not found" };

        const insertIndex = (source.order_index as number) + 1;
        const shiftError = await shiftWeeksForwardInline(
          supabase,
          ctx.blockId,
          insertIndex,
        );
        if (shiftError) return { error: shiftError };

        const { data: newWeek, error: insertErr } = await supabase
          .from("plan_weeks")
          .insert({
            block_id: ctx.blockId,
            order_index: insertIndex,
            theme: source.theme,
            target_tss: source.target_tss,
            rationale: source.rationale,
          })
          .select("id")
          .single();
        if (insertErr) return { error: insertErr.message };

        const { data: sourceDays } = await supabase
          .from("plan_days")
          .select("id, day_of_week, notes")
          .eq("week_id", week_id);

        let clonedItems = 0;
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
          if (newDayErr) return { error: newDayErr.message };

          const { data: srcItems } = await supabase
            .from("plan_day_items")
            .select(
              "order_index, kind, archetype, target_duration_min, target_tiz_min, notes",
            )
            .eq("day_id", srcDay.id as string)
            .order("order_index", { ascending: true });

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
            if (cloneErr) return { error: cloneErr.message };
            clonedItems += rows.length;
          }
        }

        await logAdaptation(supabase, planId, {
          scope: "week",
          reason,
          block_id: ctx.blockId,
          week_id: newWeek.id as string,
          details: {
            action: "duplicate",
            source_week_id: week_id,
            cloned_items: clonedItems,
          },
        });
        return { success: true, id: newWeek.id as string, cloned_items: clonedItems };
      },
    }),

    swapWeeks: tool({
      description:
        "Swap the order_index of two weeks inside the same block. Fails if the weeks belong to different blocks.",
      inputSchema: z.object({
        week_id_a: z.string().uuid(),
        week_id_b: z.string().uuid(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ week_id_a, week_id_b, reason }) => {
        if (week_id_a === week_id_b) return { error: "Cannot swap a week with itself" };
        const supabase = await createClient();
        try {
          await assertWeekInPlan(supabase, planId, week_id_a);
          await assertWeekInPlan(supabase, planId, week_id_b);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid week" };
        }

        const { data: rows, error } = await supabase
          .from("plan_weeks")
          .select("id, block_id, order_index")
          .in("id", [week_id_a, week_id_b]);
        if (error) return { error: error.message };
        if (!rows || rows.length !== 2) return { error: "Both weeks not found" };
        const [a, b] = rows;
        if (a.block_id !== b.block_id)
          return { error: "Cross-block swaps are not supported" };

        const parkIndex = -(Math.max(a.order_index as number, b.order_index as number) + 1);
        const { error: e1 } = await supabase
          .from("plan_weeks")
          .update({ order_index: parkIndex })
          .eq("id", a.id as string);
        if (e1) return { error: e1.message };
        const { error: e2 } = await supabase
          .from("plan_weeks")
          .update({ order_index: a.order_index as number })
          .eq("id", b.id as string);
        if (e2) return { error: e2.message };
        const { error: e3 } = await supabase
          .from("plan_weeks")
          .update({ order_index: b.order_index as number })
          .eq("id", a.id as string);
        if (e3) return { error: e3.message };

        await logAdaptation(supabase, planId, {
          scope: "week",
          reason,
          block_id: a.block_id as string,
          week_id: a.id as string,
          details: {
            action: "swap",
            other_week_id: b.id as string,
            from_index: a.order_index,
            to_index: b.order_index,
          },
        });
        return { success: true };
      },
    }),

    insertRecoveryWeek: tool({
      description:
        "Insert a blank recovery/unload week into a block at the given position. Subsequent weeks shift forward. Theme defaults to 'Recovery'.",
      inputSchema: z.object({
        block_id: z.string().uuid(),
        after_order_index: z
          .number()
          .int()
          .min(-1)
          .nullable()
          .describe(
            "Insert the recovery week immediately after this order_index. Pass null (or -1) to insert at the start of the block.",
          ),
        target_tss: z.number().int().min(0).max(2000).nullable().optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ block_id, after_order_index, target_tss, reason }) => {
        const supabase = await createClient();
        try {
          await assertBlockInPlan(supabase, planId, block_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid block" };
        }

        const insertIndex =
          after_order_index == null || after_order_index < 0
            ? 0
            : after_order_index + 1;
        const shiftError = await shiftWeeksForwardInline(supabase, block_id, insertIndex);
        if (shiftError) return { error: shiftError };

        const { data: newWeek, error: insertErr } = await supabase
          .from("plan_weeks")
          .insert({
            block_id,
            order_index: insertIndex,
            theme: "Recovery",
            target_tss: target_tss ?? null,
            rationale:
              "Unload week — reduce volume and intensity to absorb prior load.",
          })
          .select("id")
          .single();
        if (insertErr) return { error: insertErr.message };

        await logAdaptation(supabase, planId, {
          scope: "week",
          reason,
          block_id,
          week_id: newWeek.id as string,
          details: { action: "insert_recovery", at_index: insertIndex },
        });
        return { success: true, id: newWeek.id as string };
      },
    }),

    // ── Day notes + items ─────────────────────────────────────────

    setDayNotes: tool({
      description:
        "Set or clear the notes field for a specific day (by week + day_of_week 0=Mon..6=Sun). Creates the plan_days row if needed.",
      inputSchema: z.object({
        week_id: z.string().uuid(),
        day_of_week: z.number().int().min(0).max(6),
        notes: z.string().max(2000).nullable(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ week_id, day_of_week, notes, reason }) => {
        const supabase = await createClient();
        let weekCtx;
        try {
          weekCtx = await assertWeekInPlan(supabase, planId, week_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid week" };
        }
        const { data, error } = await supabase
          .from("plan_days")
          .upsert(
            { week_id, day_of_week, notes },
            { onConflict: "week_id,day_of_week" },
          )
          .select("id")
          .single();
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "day",
          reason,
          block_id: weekCtx.blockId,
          week_id,
          day_id: data.id as string,
          details: { action: "set_notes", day_of_week },
        });
        return { success: true, day_id: data.id as string };
      },
    }),

    addDayItem: tool({
      description:
        "Add a workout item to a specific day. For cycling items, pass the archetype ID from the catalog (e.g. 'threshold_long_reps', NOT the display name). Duration in minutes.",
      inputSchema: z.object({
        week_id: z.string().uuid(),
        day_of_week: z.number().int().min(0).max(6),
        kind: z.enum(PLAN_ITEM_KINDS),
        archetype: z.string().max(120).nullable().optional(),
        target_duration_min: z.number().int().min(0).max(720).nullable().optional(),
        target_tiz_min: z.number().int().min(0).max(720).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({
        week_id,
        day_of_week,
        kind,
        archetype,
        target_duration_min,
        target_tiz_min,
        notes,
        reason,
      }) => {
        const supabase = await createClient();
        let weekCtx;
        try {
          weekCtx = await assertWeekInPlan(supabase, planId, week_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid week" };
        }
        if (kind === "cycling" && !archetype) {
          return { error: "Cycling items require an archetype id" };
        }

        // Materialise the day row.
        const { data: dayRow, error: dayErr } = await supabase
          .from("plan_days")
          .upsert(
            { week_id, day_of_week },
            { onConflict: "week_id,day_of_week" },
          )
          .select("id")
          .single();
        if (dayErr) return { error: dayErr.message };
        const dayId = dayRow.id as string;

        const { data: existing } = await supabase
          .from("plan_day_items")
          .select("order_index")
          .eq("day_id", dayId)
          .order("order_index", { ascending: false })
          .limit(1);
        const nextIndex =
          existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

        const { data, error } = await supabase
          .from("plan_day_items")
          .insert({
            day_id: dayId,
            order_index: nextIndex,
            kind: kind as PlanItemKind,
            archetype: archetype ?? null,
            target_duration_min: target_duration_min ?? null,
            target_tiz_min: target_tiz_min ?? null,
            notes: notes ?? null,
          })
          .select("id")
          .single();
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "item",
          reason,
          block_id: weekCtx.blockId,
          week_id,
          day_id: dayId,
          item_id: data.id as string,
          details: {
            action: "add",
            kind,
            archetype,
            target_duration_min,
            day_of_week,
          },
        });
        return { success: true, id: data.id as string, day_id: dayId };
      },
    }),

    updateDayItem: tool({
      description: "Update fields of an existing day item (kind, archetype, durations, notes).",
      inputSchema: z.object({
        item_id: z.string().uuid(),
        kind: z.enum(PLAN_ITEM_KINDS).optional(),
        archetype: z.string().max(120).nullable().optional(),
        target_duration_min: z.number().int().min(0).max(720).nullable().optional(),
        target_tiz_min: z.number().int().min(0).max(720).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ item_id, reason, ...updates }) => {
        const supabase = await createClient();
        let ctx;
        try {
          ctx = await assertItemInPlan(supabase, planId, item_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid item" };
        }
        const patch: Record<string, unknown> = {};
        if (updates.kind !== undefined) patch.kind = updates.kind;
        if (updates.archetype !== undefined) patch.archetype = updates.archetype;
        if (updates.target_duration_min !== undefined)
          patch.target_duration_min = updates.target_duration_min;
        if (updates.target_tiz_min !== undefined) patch.target_tiz_min = updates.target_tiz_min;
        if (updates.notes !== undefined) patch.notes = updates.notes;
        if (Object.keys(patch).length === 0) return { error: "No fields provided" };

        const { error } = await supabase
          .from("plan_day_items")
          .update(patch)
          .eq("id", item_id);
        if (error) return { error: error.message };

        await logAdaptation(supabase, planId, {
          scope: "item",
          reason,
          block_id: ctx.blockId,
          week_id: ctx.weekId,
          day_id: ctx.dayId,
          item_id,
          details: { action: "update", updates: patch },
        });
        return { success: true, updated: Object.keys(patch) };
      },
    }),

    deleteDayItem: tool({
      description: "Delete a day item.",
      inputSchema: z.object({
        item_id: z.string().uuid(),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ item_id, reason }) => {
        const supabase = await createClient();
        let ctx;
        try {
          ctx = await assertItemInPlan(supabase, planId, item_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid item" };
        }
        await logAdaptation(supabase, planId, {
          scope: "item",
          reason,
          block_id: ctx.blockId,
          week_id: ctx.weekId,
          day_id: ctx.dayId,
          item_id,
          details: { action: "delete" },
        });
        const { error } = await supabase.from("plan_day_items").delete().eq("id", item_id);
        if (error) return { error: error.message };
        return { success: true };
      },
    }),

    // ── Batched structure tools (one approval per big move) ──────

    proposeBlockStructure: tool({
      needsApproval: true,
      description:
        "Create the full block skeleton in one approval. Appends each block at the end of the plan in the given order. Use ONLY in STRUCTURE phase when the plan has no blocks yet. For later tweaks, use addBlock / updateBlock.",
      inputSchema: z.object({
        blocks: z
          .array(
            z.object({
              name: z.string().min(1).max(80),
              duration_weeks: z.number().int().min(1).max(26),
              goal: z.string().max(500).nullable().optional(),
              rationale: z.string().max(1000).nullable().optional(),
            }),
          )
          .min(1)
          .max(12),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ blocks, reason }) => {
        const supabase = await createClient();
        const { data: existing } = await supabase
          .from("plan_blocks")
          .select("order_index")
          .eq("plan_id", planId)
          .order("order_index", { ascending: false })
          .limit(1);
        let nextIndex =
          existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

        const created: Array<{ id: string; name: string; order_index: number }> = [];
        for (const block of blocks) {
          const { data, error } = await supabase
            .from("plan_blocks")
            .insert({
              plan_id: planId,
              order_index: nextIndex,
              name: block.name.trim(),
              duration_weeks: block.duration_weeks,
              goal: block.goal ?? null,
              rationale: block.rationale ?? null,
            })
            .select("id")
            .single();
          if (error) {
            return { error: error.message, partial: created };
          }
          created.push({
            id: data.id as string,
            name: block.name.trim(),
            order_index: nextIndex,
          });
          nextIndex += 1;
        }

        await logAdaptation(supabase, planId, {
          scope: "plan",
          reason,
          details: {
            action: "propose_block_structure",
            block_count: created.length,
            blocks: created,
          },
        });
        return { success: true, blocks: created };
      },
    }),

    fillBlockSkeleton: tool({
      description:
        "Append a sequence of weeks (with theme + target_tss + rationale) to a block. Use during BLOCK-DRAFT phase to set up a block's week-by-week plan in one call. Does NOT add day items — call addDayItem separately afterward.",
      inputSchema: z.object({
        block_id: z.string().uuid(),
        weeks: z
          .array(
            z.object({
              theme: z.string().max(120).nullable().optional(),
              target_tss: z.number().int().min(0).max(2000).nullable().optional(),
              rationale: z.string().max(1000).nullable().optional(),
            }),
          )
          .min(1)
          .max(8),
        reason: z.string().min(3).max(400),
      }),
      execute: async ({ block_id, weeks, reason }) => {
        const supabase = await createClient();
        try {
          await assertBlockInPlan(supabase, planId, block_id);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Invalid block" };
        }

        const { data: existing } = await supabase
          .from("plan_weeks")
          .select("order_index")
          .eq("block_id", block_id)
          .order("order_index", { ascending: false })
          .limit(1);
        let nextIndex =
          existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

        const created: Array<{ id: string; order_index: number; theme: string | null }> = [];
        for (const week of weeks) {
          const { data, error } = await supabase
            .from("plan_weeks")
            .insert({
              block_id,
              order_index: nextIndex,
              theme: week.theme ?? null,
              target_tss: week.target_tss ?? null,
              rationale: week.rationale ?? null,
            })
            .select("id")
            .single();
          if (error) {
            return { error: error.message, partial: created };
          }
          created.push({
            id: data.id as string,
            order_index: nextIndex,
            theme: week.theme ?? null,
          });
          nextIndex += 1;
        }

        await logAdaptation(supabase, planId, {
          scope: "block",
          reason,
          block_id,
          details: {
            action: "fill_block_skeleton",
            week_count: created.length,
            weeks: created,
          },
        });
        return { success: true, weeks: created };
      },
    }),
  };
}

export type PlanCoachTools = ReturnType<typeof createPlanCoachTools>;
