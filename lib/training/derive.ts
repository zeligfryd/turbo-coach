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
  RoutineCoverage,
  SessionLoadRow,
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
  /** The sRPE was inferred from intensity, not reported by the rider. */
  srpeEstimated?: boolean;
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
  let estimatedLoad = 0;
  const sessions: SessionLoadRow[] = [];

  for (const input of inputs) {
    const { item } = input;
    if (item.date < weekStart || item.date > weekEnd) continue;
    if (!isCompleted(item.status)) continue;

    const minutes = input.actualDurationMin ?? item.plannedDurationMin ?? 0;
    const srpe = input.srpe ?? item.plannedRpe ?? null;
    const entry = byModality.get(item.modality)!;

    const load = sessionLoad(minutes, srpe);
    entry.minutes += minutes;
    entry.load += load;
    if (input.srpeEstimated) estimatedLoad += load;

    if (item.modality === "bike" && item.plannedTss != null) {
      bikeTss += item.plannedTss;
      entry.tss = (entry.tss ?? 0) + item.plannedTss;
    }

    sessions.push({
      id: item.id,
      date: item.date,
      name: item.name,
      modality: item.modality,
      minutes,
      srpe,
      load,
      srpeEstimated: input.srpeEstimated === true,
      tss: item.modality === "bike" ? item.plannedTss : null,
    });
  }

  // Chronological, so a week reads Monday first the way it is trained and the
  // way the calendar shows it. Heaviest first within a day.
  sessions.sort((a, b) => (a.date === b.date ? b.load - a.load : a.date.localeCompare(b.date)));

  const modalityLoads = MODALITIES.map((m) => byModality.get(m)!);

  return {
    weekStart,
    totalLoad: modalityLoads.reduce((sum, m) => sum + m.load, 0),
    totalMinutes: modalityLoads.reduce((sum, m) => sum + m.minutes, 0),
    byModality: modalityLoads,
    sessions,
    bikeTss,
    estimatedLoad,
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

// ── Routine rotation (D8) ───────────────────────────────────────────

export type RankedRoutine<T extends { coverageVector: RoutineCoverage }> = T & {
  /** Areas this routine covers that are currently due or overdue. */
  fixesAreas: FocusArea[];
  /** Staleness of the worst area it addresses; higher means more urgent. */
  urgency: number;
};

/**
 * Order the routines by how much of the current backlog each one clears.
 *
 * This is the default path: rather than composing a session against a grid,
 * the user answers one question with four possible answers. Scoring on the
 * *worst* area a routine touches (not the sum) keeps the answer explainable —
 * "Upper 8, because neck and shoulders is nine days overdue" — instead of
 * producing a number nobody can argue with.
 *
 * An area that has never been covered is treated as maximally urgent, since
 * there is no ratio to compare and it is the most actionable thing available.
 */
export function rankRoutines<T extends { coverageVector: RoutineCoverage }>(
  routines: T[],
  coverage: AreaCoverage[],
): RankedRoutine<T>[] {
  const byArea = new Map(coverage.map((c) => [c.area, c]));
  const NEVER_URGENCY = 99;

  return routines
    .map((routine) => {
      const areas = Object.keys(routine.coverageVector) as FocusArea[];
      let urgency = 0;
      const fixesAreas: FocusArea[] = [];

      for (const area of areas) {
        const state = byArea.get(area);
        if (!state) continue;
        const areaUrgency = state.ratio === null ? NEVER_URGENCY : state.ratio;
        urgency = Math.max(urgency, areaUrgency);

        const isBehind =
          state.status === "due" || state.status === "overdue" || state.status === "never";
        // An area that has only ever been stretched still needs loading, and
        // this routine can supply it. Counted as something the routine fixes,
        // but deliberately not as urgency — otherwise "stretched but never
        // loaded" would need its own target interval, which is the two-axis
        // complexity the six-area model exists to avoid.
        const suppliesMissingLoad = state.stretchOnly && Boolean(routine.coverageVector[area]?.loaded);

        if (isBehind || suppliesMissingLoad) fixesAreas.push(area);
      }

      return { ...routine, fixesAreas, urgency: Math.round(urgency * 100) / 100 };
    })
    .sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      // Ties are the normal case on a fresh account, where every area is
      // equally "never covered". Break toward the routine that clears the most
      // backlog, so the first suggestion is the one covering the most ground.
      return b.fixesAreas.length - a.fixesAreas.length;
    });
}
