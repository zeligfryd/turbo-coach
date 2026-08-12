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
  FOCUS_AREAS,
  MODALITIES,
  isCompleted,
  type FocusArea,
  type Modality,
} from "./taxonomy";
import type {
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

// ── Choosing what to do next ────────────────────────────────────────

export type RankedRoutine<T> = T & { daysSinceDone: number | null };

/**
 * Routines, least recently done first.
 *
 * This used to rank by how overdue a *body area* was, against a target
 * interval per area. That worked, but it asked you to choose six intervals
 * before the ranking meant anything, and then explained itself in terms of
 * those numbers — "posterior chain is at 1.4× its interval" — which is a
 * sentence about a model rather than about training. Nobody set the intervals,
 * so the ranking was measuring against numbers the app had picked for itself.
 *
 * Rotating the routines themselves gives the same thing that actually mattered
 * — you do not repeat one routine while another goes untouched — and explains
 * itself without a vocabulary: you have not done this one in nine days.
 *
 * What it gives up: nothing notices if an area is missing from every routine
 * you own. That is a property of your routines, and it is visible where it can
 * be acted on, in the composer as you build them.
 */
export function rankRoutines<T extends { daysSinceDone: number | null }>(
  routines: T[],
): RankedRoutine<T>[] {
  const NEVER = Number.MAX_SAFE_INTEGER;
  return routines
    .map((routine) => ({ ...routine, daysSinceDone: routine.daysSinceDone }))
    .sort((a, b) => (b.daysSinceDone ?? NEVER) - (a.daysSinceDone ?? NEVER));
}
