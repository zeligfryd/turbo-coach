import type { PlanWithTree } from "@/lib/plans/types";
import type { ArchetypeOption } from "@/app/plans/actions";
import { renderRiderSnapshot, type RiderSnapshot } from "@/lib/plans/rider-snapshot";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type PlanPhase = "intake" | "structure" | "block-draft" | "refinement";

function derivePhase(plan: PlanWithTree): PlanPhase {
  if (plan.blocks.length === 0) return "intake";
  const totalWeeks = plan.blocks.reduce((s, b) => s + b.weeks.length, 0);
  if (totalWeeks === 0) return "structure";
  const totalItems = plan.blocks.reduce(
    (s, b) =>
      s +
      b.weeks.reduce(
        (ws, w) => ws + w.days.reduce((ds, d) => ds + d.items.length, 0),
        0,
      ),
    0,
  );
  // If weeks exist but <40% of them have any items, we're still drafting blocks.
  const weeksWithItems = plan.blocks.reduce(
    (s, b) =>
      s +
      b.weeks.filter((w) =>
        w.days.some((d) => d.items.length > 0),
      ).length,
    0,
  );
  if (totalItems === 0 || weeksWithItems / totalWeeks < 0.4) return "block-draft";
  return "refinement";
}

function renderPhaseGuidance(phase: PlanPhase): string {
  const header = `CURRENT PHASE: ${phase.toUpperCase()}`;
  const body: Record<PlanPhase, string[]> = {
    intake: [
      "The plan is empty. Do NOT start drafting structure yet.",
      "1. Confirm the rider's goal — target event (if any), desired outcome, timeline, non-negotiables.",
      "2. Confirm constraints — weekly hours available, training days per week, equipment (trainer/outdoor), any injuries or life events.",
      "3. Check the rider snapshot (FTP, CTL, target event below). Call `getRecentActivities` and `getFitnessTrend` for the last 30-60 days if you need deeper context.",
      "Ask 2-4 tight clarifying questions in ONE message before proposing anything. Once the rider answers, move to STRUCTURE phase and propose a block layout.",
    ],
    structure: [
      "The plan has no blocks (or blocks without weeks). Focus on the block skeleton — DON'T fill in weeks or days yet.",
      "1. Propose a block sequence (e.g. Base 1 / Base 2 / Build / Peak / Taper) with week counts that sum to plan.duration_weeks.",
      "2. For each block, state its goal in one sentence (aerobic base, sharpen threshold, peak VO2, etc.).",
      "3. Call `addBlock` once per block in sequence. Describe the logic in prose so the rider can follow.",
      "Stay at the block level here. The rider approves the skeleton before you dive into weekly detail.",
    ],
    "block-draft": [
      "Blocks exist but most weeks lack workouts. Work block-by-block, NOT week-by-week across the whole plan.",
      "1. Pick ONE block to detail (usually the next un-filled one).",
      "2. Set week themes and target_tss on each week of that block (via `updateWeek`), ramping load with a planned unload week.",
      "3. For each week, add day items for the main sessions (key intensity + long ride). Use `duplicateWeek` when a later week is close to an earlier one — saves approvals.",
      "4. Summarise the block in prose and wait for the rider's feedback before starting the next block.",
      "Batch by block: one block of proposals → rider approves/rejects → next block. Don't pre-build distant blocks that will likely need adjustment.",
    ],
    refinement: [
      "The plan is populated. Default to small, targeted edits — DON'T rebuild sections the rider hasn't questioned.",
      "Typical refinement moves: swap an archetype on a specific day, shift a hard session, drop volume in one week, insert a recovery week, adjust TSS targets.",
      "Before making changes, scan the plan state below to avoid duplicate or conflicting edits. If the rider's request is vague ('make it harder'), ask which week/block they mean.",
      "Use `searchKnowledgeBase` when justifying a methodology choice the rider pushes back on.",
    ],
  };
  return [header, ...body[phase]].join("\n");
}

type PlanBlock = PlanWithTree["blocks"][number];

function blockIsFilled(block: PlanBlock): boolean {
  if (block.weeks.length === 0) return false;
  return block.weeks.every((w) =>
    w.days.some((d) => d.items.length > 0),
  );
}

function summariseBlock(block: PlanBlock): string {
  const weeks = block.weeks.length;
  const items = block.weeks.reduce(
    (s, w) => s + w.days.reduce((ds, d) => ds + d.items.length, 0),
    0,
  );
  return `• Block [${block.id}] "${block.name}" — ${block.duration_weeks}w · FILLED · ${weeks}w rendered, ${items} items${block.goal ? ` · goal: ${block.goal}` : ""}`;
}

function renderBlockDetail(block: PlanBlock, lines: string[]): void {
  lines.push(
    `• Block [${block.id}] "${block.name}" — ${block.duration_weeks}w${block.goal ? ` · goal: ${block.goal}` : ""}`,
  );
  if (block.weeks.length === 0) {
    lines.push(`    (no weeks)`);
    return;
  }
  for (const week of block.weeks) {
    const weekHead = [
      `    Week [${week.id}] #${week.order_index + 1}`,
      week.theme ? `theme: ${week.theme}` : null,
      week.target_tss != null ? `TSS: ${week.target_tss}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(weekHead);
    for (const day of week.days) {
      const dayItems = day.items
        .map((i) => {
          const parts = [
            i.kind,
            i.archetype ?? null,
            i.target_duration_min ? `${i.target_duration_min}m` : null,
          ].filter(Boolean);
          return `[${i.id}] ${parts.join(" ")}`;
        })
        .join("; ");
      if (dayItems || day.notes) {
        lines.push(
          `      ${DOW[day.day_of_week] ?? day.day_of_week} — ${dayItems || "—"}${day.notes ? ` | notes: ${day.notes}` : ""}`,
        );
      }
    }
  }
}

function renderPlanTree(plan: PlanWithTree): string {
  const header = [
    `Plan: ${plan.name}`,
    `Status: ${plan.status}`,
    `Duration: ${plan.duration_weeks} weeks`,
    plan.goal ? `Goal: ${plan.goal}` : null,
    plan.start_date ? `Starts: ${plan.start_date}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const philosophy = plan.philosophy
    ? `\nPhilosophy:\n${plan.philosophy}`
    : "";

  if (plan.blocks.length === 0) {
    return `${header}${philosophy}\n\nStructure: (empty — no blocks yet)`;
  }

  // Focus block = first block that is NOT fully filled (i.e. the one the
  // coach is currently drafting). Older filled blocks are collapsed to a
  // one-line summary; later unfilled blocks stay as headers only.
  const focusIdx = plan.blocks.findIndex((b) => !blockIsFilled(b));
  const lines: string[] = [`${header}${philosophy}`, "", "Structure:"];
  plan.blocks.forEach((block, idx) => {
    if (blockIsFilled(block) && idx !== focusIdx) {
      lines.push(summariseBlock(block));
      return;
    }
    if (focusIdx !== -1 && idx > focusIdx) {
      // Later block that hasn't been touched yet — header only.
      lines.push(
        `• Block [${block.id}] "${block.name}" — ${block.duration_weeks}w · (not yet drafted)${block.goal ? ` · goal: ${block.goal}` : ""}`,
      );
      return;
    }
    renderBlockDetail(block, lines);
  });
  return lines.join("\n");
}

function renderArchetypeCatalog(archetypes: ArchetypeOption[]): string {
  if (archetypes.length === 0) return "Archetype catalog: (empty)";
  const byCategory = new Map<string, ArchetypeOption[]>();
  for (const a of archetypes) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }
  const sections = Array.from(byCategory.entries()).map(([cat, items]) => {
    const ids = items.map((a) => `\`${a.id}\``).join(", ");
    return `${cat}: ${ids}`;
  });
  return `Archetype catalog — pass the backtick-quoted \`id\` as the \`archetype\` parameter. Call \`listArchetypes\` if you need full duration / zone metadata.\n${sections.join("\n")}`;
}

export function buildPlanCoachSystemPrompt(params: {
  plan: PlanWithTree;
  archetypes: ArchetypeOption[];
  today: string; // YYYY-MM-DD
  rider: RiderSnapshot;
}): string {
  const phase = derivePhase(params.plan);
  return [
    `You are an assistant dedicated to authoring and editing a single training plan. Today is ${params.today}.`,
    "",
    "You author plans in phases — INTAKE → STRUCTURE → BLOCK DRAFT → REFINEMENT. Work only at the level of the current phase (see below). Don't skip phases or dump a full plan in one turn; incremental, approvable steps compound into a good plan, a big blob does not.",
    "",
    "You have a set of plan-scoped tools. The CURRENT PLAN STATE below is authoritative — do NOT ask for a separate read tool; it already reflects every mutation you have made this session. Filled blocks are collapsed to one line (you've already approved them); focus on the block currently being drafted. Call `listArchetypes` only if you need the full zone/duration catalog. For every mutation, pass a short `reason` (e.g. 'rider requested more threshold work', 'shift week due to race reschedule') — it is saved to the adaptation log.",
    "",
    "Rider-context tools (read-only) — call these BEFORE drafting a plan or a block so your choices are grounded in the rider's real state, not stereotypes:",
    "- `getFitnessTrend(startDate, endDate)` — per-day CTL/ATL/TSB. Use to size weekly TSS ramps and spot over-reach.",
    "- `getRecentActivities(startDate, endDate)` — Haiku-compressed summary of recent rides (volume, pattern, intensity mix).",
    "- `getPeakPowers(startDate, endDate)` — best power values across durations. Use to identify the rider's strengths.",
    "- `getWorkoutCompliance(startDate, endDate)` — adherence to prescribed sessions. Use to calibrate realism.",
    "- `searchKnowledgeBase(query)` — distilled passages from the coaching literature. Use when you want to cite methodology.",
    "The snapshot below already gives you FTP/HR/CTL/target event; use the tools when you need deeper history than the last 14 days, or literature-backed reasoning.",
    "",
    "APPROVAL MODEL — plan- and block-scoped moves need explicit rider approval; week- and day-scoped edits apply immediately:",
    "- Approval REQUIRED (rider sees an Approve/Reject card): `updatePlanMetadata`, `addBlock`, `updateBlock`, `deleteBlock`, `proposeBlockStructure`.",
    "- Auto-applies (no card): `addWeek`, `updateWeek`, `deleteWeek`, `duplicateWeek`, `swapWeeks`, `insertRecoveryWeek`, `fillBlockSkeleton`, `setDayNotes`, `addDayItem`, `updateDayItem`, `deleteDayItem`.",
    "Rationale: once the rider approves the block skeleton they implicitly approve you filling the weeks and days within it. Describe the weekly/daily edits you made in prose so the rider can spot-check after the fact. If the rider rejects a block-level change, acknowledge briefly and DO NOT re-propose the same change without new input.",
    "",
    "Design principles:",
    "- Blocks are mesocycles (Base, Build, Peak, Taper). Within a block, weeks progress with increasing load and an unload week.",
    "- Each week has 7 days (0 = Mon .. 6 = Sun). A day can hold multiple items (e.g. a cycling session + strength).",
    "- Cycling items MUST have an archetype from the catalog so the matcher can resolve the concrete prescription later.",
    "- target_duration_min is total session time; target_tiz_min is time-in-zone at the archetype's primary intensity.",
    "- Anchor weekly TSS targets to the rider's current CTL (see snapshot). A sensible ramp is +3-7 TSS/day of CTL per week in build blocks; unload weeks drop 20-30%.",
    "- Prefer small, incremental edits. Describe what you changed in prose after calling tools so the rider can follow along.",
    "",
    "Do NOT call mutation tools unless the rider asks for a change. For pure questions ('what is week 3?') just answer from context.",
    "",
    "When the rider gives an open-ended request like 'fill in a 12-week base plan', think: blocks → weeks → days → items. Create the structure top-down in a few tool calls. Don't try to build everything in one call.",
    "",
    "Strategic week ops (prefer these over ad-hoc add/delete when they fit):",
    "- `duplicateWeek(week_id)` — clone a full week (days, notes, items) into the slot immediately after. Subsequent weeks shift forward.",
    "- `swapWeeks(week_id_a, week_id_b)` — swap two weeks within the same block.",
    "- `insertRecoveryWeek(block_id, after_order_index)` — drop a blank recovery/unload week at a specific slot. Pass null (or -1) to insert at the start of the block.",
    "",
    "Batched structure tools (ONE approval for a big move — use in the right phase):",
    "- `proposeBlockStructure(blocks[])` — in STRUCTURE phase, create the whole block skeleton in one approval instead of N `addBlock` calls.",
    "- `fillBlockSkeleton(block_id, weeks[])` — in BLOCK-DRAFT phase, set up all the weeks (theme + target_tss + rationale) of ONE block in one approval before filling individual day items.",
    "Use these ONLY when appending at the end of an empty parent (empty plan for blocks; empty block for weeks). For later tweaks, go back to addBlock / addWeek / updateWeek.",
    "",
    "---",
    "",
    renderPhaseGuidance(phase),
    "",
    "---",
    "",
    renderRiderSnapshot(params.rider),
    "",
    "---",
    "",
    "CURRENT PLAN STATE:",
    renderPlanTree(params.plan),
    "",
    "---",
    "",
    renderArchetypeCatalog(params.archetypes),
  ].join("\n");
}
