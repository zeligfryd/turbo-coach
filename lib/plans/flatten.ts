import type {
  PlanBlockWithChildren,
  PlanDayItem,
  PlanWithTree,
} from "./types";

export type PlanDaySlot = {
  // Day-of-week index: 0 = Monday .. 6 = Sunday.
  dayOfWeek: number;
  // Calendar date for this slot when the plan has a start_date; null otherwise.
  date: string | null;
  // Populated only when the plan has a plan_day row for this slot.
  dayId: string | null;
  notes: string | null;
  items: PlanDayItem[];
};

export type PlanWeekSlot = {
  // 1-based global week number within the plan (1..duration_weeks).
  weekNumber: number;
  block: PlanBlockWithChildren | null;
  // Reference to the concrete plan_weeks row — null for unfilled weeks.
  weekId: string | null;
  theme: string | null;
  targetTss: number | null;
  rationale: string | null;
  days: PlanDaySlot[];
};

// Build an ordered list of week slots spanning the plan's full duration.
// Concatenates weeks from blocks in order. Missing weeks are returned as
// placeholders so the calendar can render the full shape of the plan.
export function flattenPlanWeeks(plan: PlanWithTree): PlanWeekSlot[] {
  const startDate = plan.start_date ? parseDateOnly(plan.start_date) : null;
  const slots: PlanWeekSlot[] = [];

  let weekNumber = 1;
  for (const block of plan.blocks) {
    const weeksByIndex = new Map(block.weeks.map((w) => [w.order_index, w]));
    for (let i = 0; i < block.duration_weeks; i++) {
      if (weekNumber > plan.duration_weeks) break;
      const week = weeksByIndex.get(i) ?? null;
      slots.push(buildWeekSlot(weekNumber, block, week, startDate));
      weekNumber++;
    }
  }

  // Pad with placeholder weeks until we reach duration_weeks, so the calendar
  // always reflects the plan's declared length — even when blocks don't fill it.
  while (weekNumber <= plan.duration_weeks) {
    slots.push(buildWeekSlot(weekNumber, null, null, startDate));
    weekNumber++;
  }

  return slots;
}

function buildWeekSlot(
  weekNumber: number,
  block: PlanBlockWithChildren | null,
  week: PlanBlockWithChildren["weeks"][number] | null,
  startDate: Date | null,
): PlanWeekSlot {
  const daysByDow = new Map(
    (week?.days ?? []).map((d) => [d.day_of_week, d]),
  );
  const days: PlanDaySlot[] = Array.from({ length: 7 }, (_, dow) => {
    const d = daysByDow.get(dow) ?? null;
    const date = startDate ? addDays(startDate, (weekNumber - 1) * 7 + dow) : null;
    return {
      dayOfWeek: dow,
      date: date ? formatDateOnly(date) : null,
      dayId: d?.id ?? null,
      notes: d?.notes ?? null,
      items: d?.items ?? [],
    };
  });

  return {
    weekNumber,
    block,
    weekId: week?.id ?? null,
    theme: week?.theme ?? null,
    targetTss: week?.target_tss ?? null,
    rationale: week?.rationale ?? null,
    days,
  };
}

function parseDateOnly(iso: string): Date {
  // YYYY-MM-DD → local midnight. Avoids timezone off-by-one.
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
