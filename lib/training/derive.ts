/**
 * Derived training state — the single place any of this is computed.
 *
 * Everything here is pure: it takes already-fetched rows and returns values.
 * No Supabase, no IO, no React. Components consume the output; they never
 * recompute staleness or load locally (§7.2 of the plan). The existing
 * `getWorkoutMetrics` in components/calendar/utils.ts is the pattern this
 * deliberately does not follow.
 */

import {
  DEFAULT_AREA_TARGET_DAYS,
  FOCUS_AREAS,
  MODALITIES,
  isCompleted,
  type FocusArea,
  type Modality,
} from "./taxonomy";
import type {
  AreaCoverage,
  CoverageEvent,
  CoverageGoalRow,
  CoverageStatus,
  ModalityLoad,
  PlannedItem,
  WeekLoad,
} from "./types";

// ── Date helpers (UTC-safe string arithmetic, as in lib/fitness/pmc.ts) ──

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, amount: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. Weeks start Monday throughout. */
export function startOfWeek(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7; // Sunday(0) → 6, Monday(1) → 0
  return addDays(date, -shift);
}

// ── Session load ────────────────────────────────────────────────────

/**
 * Session load = sRPE × minutes.
 *
 * The only number that legitimately sums across a strength session and a ride.
 * It is deliberately NOT comparable with bike TSS and never feeds the PMC (P4).
 * Returns 0 when either input is missing — an unrated session contributes
 * nothing rather than a guess.
 */
export function sessionLoad(
  minutes: number | null | undefined,
  srpe: number | null | undefined,
): number {
  if (!minutes || !srpe) return 0;
  return Math.round(minutes * srpe);
}

/**
 * Estimate an RPE from a ride's intensity factor, for rides that never carried
 * one (D3). Flagged as estimated wherever it is shown, so an inferred number
 * never passes for a reported one.
 *
 * IF 0.55 (recovery) → ~3, 0.75 (endurance) → ~5, 0.85 (tempo) → ~7,
 * 1.0 (threshold) → ~9. Clamped to 1–10.
 */
export function estimateRpeFromIntensity(intensityFactor: number | null): number | null {
  if (!intensityFactor || intensityFactor <= 0) return null;
  const rpe = 1 + (intensityFactor - 0.4) * 13.3;
  return Math.max(1, Math.min(10, Math.round(rpe * 10) / 10));
}

// ── Weekly load by modality ─────────────────────────────────────────

type LoadInput = {
  item: PlannedItem;
  /** Actual minutes and sRPE where completed; falls back to planned. */
  actualDurationMin?: number | null;
  srpe?: number | null;
};

/**
 * Weekly totals, split by modality, with bike TSS kept in its own field.
 *
 * Only completed work counts toward load — planned-but-not-done would make the
 * acute:chronic ratio measure intent rather than training. Ghosts never count.
 */
export function computeWeekLoad(inputs: LoadInput[], weekStartDate: string): WeekLoad {
  const weekStart = startOfWeek(weekStartDate);
  const weekEnd = addDays(weekStart, 6);

  const byModality = new Map<Modality, ModalityLoad>();
  for (const modality of MODALITIES) {
    byModality.set(modality, { modality, load: 0, minutes: 0, tss: modality === "bike" ? 0 : null });
  }

  let bikeTss = 0;

  for (const input of inputs) {
    const { item } = input;
    if (item.date < weekStart || item.date > weekEnd) continue;
    if (!isCompleted(item.status)) continue;

    const minutes = input.actualDurationMin ?? item.plannedDurationMin ?? 0;
    const srpe = input.srpe ?? item.plannedRpe ?? null;
    const entry = byModality.get(item.modality)!;

    entry.minutes += minutes;
    entry.load += sessionLoad(minutes, srpe);

    if (item.modality === "bike" && item.plannedTss != null) {
      bikeTss += item.plannedTss;
      entry.tss = (entry.tss ?? 0) + item.plannedTss;
    }
  }

  const modalityLoads = MODALITIES.map((m) => byModality.get(m)!);

  return {
    weekStart,
    totalLoad: modalityLoads.reduce((sum, m) => sum + m.load, 0),
    totalMinutes: modalityLoads.reduce((sum, m) => sum + m.minutes, 0),
    byModality: modalityLoads,
    bikeTss,
  };
}

/**
 * Acute:chronic ratio on total session load — 7-day mean over 28-day mean.
 * Null until there is a full 28 days of history to divide by.
 */
export function acuteChronicRatio(weeks: WeekLoad[]): number | null {
  if (weeks.length < 4) return null;
  const recent = weeks.slice(-4);
  const acute = recent[recent.length - 1].totalLoad;
  const chronic = recent.reduce((sum, w) => sum + w.totalLoad, 0) / 4;
  if (chronic === 0) return null;
  return Math.round((acute / chronic) * 100) / 100;
}

// ── Coverage ────────────────────────────────────────────────────────

/**
 * Status thresholds. `never` is distinct from `overdue`: an area with no
 * history has nothing to be late for, and should not be shown as a failure.
 */
export function coverageStatus(ratio: number | null): CoverageStatus {
  if (ratio === null) return "never";
  if (ratio < 0.6) return "fresh";
  if (ratio <= 1) return "due";
  return "overdue";
}

/**
 * Resolve the six targets, falling back to the cyclist defaults for any area
 * the user has not overridden. Always returns all six areas.
 */
export function resolveGoals(
  goals: Pick<CoverageGoalRow, "area" | "target_days" | "is_default">[],
): Record<FocusArea, { targetDays: number; isDefault: boolean }> {
  const resolved = {} as Record<FocusArea, { targetDays: number; isDefault: boolean }>;
  for (const area of FOCUS_AREAS) {
    const override = goals.find((g) => g.area === area && !g.is_default);
    resolved[area] = override
      ? { targetDays: override.target_days, isDefault: false }
      : { targetDays: DEFAULT_AREA_TARGET_DAYS[area], isDefault: true };
  }
  return resolved;
}

/**
 * Current coverage for all six areas, as of `today`.
 *
 * `stretchOnly` marks an area that has been touched but never by anything
 * loaded — the one-bit replacement for the spec's five-way stimulus axis (D8).
 * It is computed over the whole history window passed in, not just the most
 * recent event, so a single stretch does not mask months of loaded work.
 *
 * Events dated after `today` are ignored, so the function is safe to call with
 * a window that includes planned future work.
 */
export function computeAreaCoverage(
  events: CoverageEvent[],
  goals: Pick<CoverageGoalRow, "area" | "target_days" | "is_default">[],
  today: string,
): AreaCoverage[] {
  const resolved = resolveGoals(goals);

  return FOCUS_AREAS.map((area) => {
    const { targetDays, isDefault } = resolved[area];
    const relevant = events.filter((e) => e.area === area && e.date <= today);

    if (relevant.length === 0) {
      return {
        area,
        targetDays,
        isDefault,
        lastCoveredDate: null,
        daysSince: null,
        ratio: null,
        status: "never" as CoverageStatus,
        stretchOnly: false,
      };
    }

    const lastCoveredDate = relevant.reduce((max, e) => (e.date > max ? e.date : max), relevant[0].date);
    const daysSince = daysBetween(lastCoveredDate, today);
    const ratio = targetDays > 0 ? Math.round((daysSince / targetDays) * 100) / 100 : null;

    return {
      area,
      targetDays,
      isDefault,
      lastCoveredDate,
      daysSince,
      ratio,
      status: coverageStatus(ratio),
      stretchOnly: !relevant.some((e) => e.loaded),
    };
  });
}

/**
 * Rank areas by how overdue they are, stalest first. Areas never covered sort
 * to the top — an untouched area is the most actionable thing on the list.
 * Drives the composer's ordering and the "which routine next" suggestion.
 */
export function rankByStaleness(coverage: AreaCoverage[]): AreaCoverage[] {
  return coverage.slice().sort((a, b) => {
    if (a.ratio === null && b.ratio === null) return 0;
    if (a.ratio === null) return -1;
    if (b.ratio === null) return 1;
    return b.ratio - a.ratio;
  });
}
