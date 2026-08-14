import { findBestWorkout } from "@/lib/workouts/archetype-matcher";
import type { Workout } from "@/lib/workouts/types";
import type { PlanItemKind, PlanWithTree } from "./types";

export type ScheduledEntry = {
  itemId: string;
  weekNumber: number; // 1-based within the plan
  dayOfWeek: number; // 0 = Monday .. 6 = Sunday
  date: string; // YYYY-MM-DD
  kind: PlanItemKind;
  archetype: string | null;
  targetDurationMin: number | null;
  targetTizMin: number | null;
  notes: string | null;
  /** Set when the item names an exact workout, as the manual composer does. */
  workoutId: string | null;
};

export type ResolvedEntry = ScheduledEntry & {
  workoutId: string | null;
  workoutName: string | null;
  unresolved: boolean;
  unresolvedReason: string | null;
};

export type ActivationPreview = {
  startDate: string;
  endDate: string;
  entries: ResolvedEntry[];
  totalItems: number;
  cyclingItems: number;
  resolvedCycling: number;
  unresolvedCycling: number;
  nonCyclingSkipped: number;
  perWeek: { weekNumber: number; scheduled: number; unresolved: number }[];
};

/**
 * Build the ordered list of plan_day_items with computed calendar dates,
 * respecting the plan's block ordering and duration_weeks cap.
 */
export function computeSchedule(
  plan: PlanWithTree,
  startDate: string,
): ScheduledEntry[] {
  const entries: ScheduledEntry[] = [];
  const start = parseDateOnly(startDate);

  let weekNumber = 1;
  for (const block of plan.blocks) {
    const weeksByIndex = new Map(block.weeks.map((w) => [w.order_index, w]));
    for (let i = 0; i < block.duration_weeks; i++) {
      if (weekNumber > plan.duration_weeks) break;
      const week = weeksByIndex.get(i);
      if (!week) {
        weekNumber++;
        continue;
      }
      for (const day of week.days) {
        const date = formatDateOnly(
          addDays(start, (weekNumber - 1) * 7 + day.day_of_week),
        );
        for (const item of day.items) {
          entries.push({
            itemId: item.id,
            weekNumber,
            dayOfWeek: day.day_of_week,
            date,
            kind: item.kind,
            archetype: item.archetype,
            targetDurationMin: item.target_duration_min,
            targetTizMin: item.target_tiz_min,
            workoutId: item.workout_id ?? null,
            notes: item.notes,
          });
        }
      }
      weekNumber++;
    }
  }
  return entries;
}

/**
 * Resolve each entry to a concrete workout using the archetype matcher.
 * Non-cycling entries are marked unresolved with a skip reason — the current
 * scheduled_workouts schema only supports linking to a cycling workout.
 */
export function resolveEntries(
  entries: ScheduledEntry[],
  candidates: Workout[],
): ResolvedEntry[] {
  const byId = new Map(candidates.map((workout) => [workout.id, workout]));

  return entries.map((entry) => {
    // An item that names a workout is already resolved. Running it through the
    // matcher would swap a workout you chose for whichever one currently scores
    // best against its archetype — and a derived workout has no archetype to
    // match on at all.
    if (entry.workoutId) {
      const named = byId.get(entry.workoutId);
      return {
        ...entry,
        workoutId: entry.workoutId,
        workoutName: named?.name ?? null,
        unresolved: false,
        unresolvedReason: null,
      };
    }

    if (entry.kind !== "cycling") {
      return {
        ...entry,
        workoutId: null,
        workoutName: null,
        unresolved: true,
        unresolvedReason: `${entry.kind} items cannot be scheduled yet`,
      };
    }
    if (!entry.archetype) {
      return {
        ...entry,
        workoutId: null,
        workoutName: null,
        unresolved: true,
        unresolvedReason: "No archetype set",
      };
    }
    if (!entry.targetDurationMin) {
      return {
        ...entry,
        workoutId: null,
        workoutName: null,
        unresolved: true,
        unresolvedReason: "No target duration",
      };
    }

    const best = findBestWorkout(
      {
        archetype: entry.archetype,
        targetDurationMin: entry.targetDurationMin,
        targetTizMin: entry.targetTizMin ?? undefined,
      },
      candidates,
    );
    if (!best) {
      return {
        ...entry,
        workoutId: null,
        workoutName: null,
        unresolved: true,
        unresolvedReason: `No matching workout for archetype "${entry.archetype}"`,
      };
    }
    return {
      ...entry,
      workoutId: best.id,
      workoutName: best.name,
      unresolved: false,
      unresolvedReason: null,
    };
  });
}

export function buildActivationPreview(
  plan: PlanWithTree,
  startDate: string,
  candidates: Workout[],
): ActivationPreview {
  const entries = resolveEntries(computeSchedule(plan, startDate), candidates);

  const start = parseDateOnly(startDate);
  const end = addDays(start, plan.duration_weeks * 7 - 1);

  const cyclingItems = entries.filter((e) => e.kind === "cycling").length;
  const resolvedCycling = entries.filter(
    (e) => e.kind === "cycling" && !e.unresolved,
  ).length;
  const unresolvedCycling = cyclingItems - resolvedCycling;
  const nonCyclingSkipped = entries.length - cyclingItems;

  const perWeekMap = new Map<number, { scheduled: number; unresolved: number }>();
  for (const e of entries) {
    const bucket = perWeekMap.get(e.weekNumber) ?? { scheduled: 0, unresolved: 0 };
    if (!e.unresolved) bucket.scheduled++;
    else if (e.kind === "cycling") bucket.unresolved++;
    perWeekMap.set(e.weekNumber, bucket);
  }
  const perWeek = Array.from(perWeekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([weekNumber, v]) => ({ weekNumber, ...v }));

  return {
    startDate,
    endDate: formatDateOnly(end),
    entries,
    totalItems: entries.length,
    cyclingItems,
    resolvedCycling,
    unresolvedCycling,
    nonCyclingSkipped,
    perWeek,
  };
}

// ── Date helpers ───────────────────────────────────────────────────

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
