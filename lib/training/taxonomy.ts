/**
 * Multi-modality training taxonomy — the single source of truth.
 *
 * Every vocabulary here is mirrored by a `text ... check (... in (...))`
 * constraint in the migration (see D2 in docs/multi-modality-plan-2026-08-09.md:
 * this repo uses check constraints, not Postgres enums). When a list changes
 * here, the constraint changes with it.
 *
 * Two granularities coexist deliberately (D8):
 *   • FOCUS_AREAS (6)   — what the user sees, sets targets against, and tags
 *                         coarse objects (blocks, block templates) with.
 *   • BODY_REGIONS (14) — what exercises are tagged with, and what the future
 *                         strength tool shares. Rolls up into areas for display.
 *
 * Adding a region, a stimulus type or an area is a design decision, not an
 * implementation detail. All three lists are hard-capped.
 */

import { z } from "zod";

// ── Scheduling vocabulary ───────────────────────────────────────────

export const MODALITIES = ["bike", "strength", "mobility", "yoga", "prehab"] as const;
export type Modality = (typeof MODALITIES)[number];

/**
 * Modalities that live in the `block` table. Bike stays in `scheduled_workouts`
 * and is unioned in at read time (D1) — it is never a `block` row.
 */
export const BLOCK_MODALITIES = ["strength", "mobility", "yoga", "prehab"] as const;
export type BlockModality = (typeof BLOCK_MODALITIES)[number];

export const MODALITY_LABELS: Record<Modality, string> = {
  bike: "Bike",
  strength: "Strength",
  mobility: "Mobility",
  yoga: "Yoga",
  prehab: "Prehab",
};

export const DAY_PARTS = ["am", "midday", "pm"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

export const DAY_PART_LABELS: Record<DayPart, string> = {
  am: "AM",
  midday: "Midday",
  pm: "PM",
};

/** Ordering within a day. Day-parts replace clock times entirely. */
export const DAY_PART_ORDER: Record<DayPart, number> = { am: 0, midday: 1, pm: 2 };

export const BLOCK_STATUSES = ["planned", "ghost", "done", "partial", "skipped"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

/** Bike sessions have no ghost state — ghosts are a non-bike scheduling mechanic. */
export const SCHEDULED_STATUSES = ["planned", "done", "partial", "skipped"] as const;
export type ScheduledStatus = (typeof SCHEDULED_STATUSES)[number];

/** Statuses that mean "this actually happened" for coverage and load purposes. */
export const COMPLETED_STATUSES = ["done", "partial"] as const;
export type CompletedStatus = (typeof COMPLETED_STATUSES)[number];

export function isCompleted(status: BlockStatus): boolean {
  return status === "done" || status === "partial";
}

/**
 * Provenance (D4). `rule` covers carry-over ghosts and archetype scaffolding;
 * `coach` is reserved for an AI coach, which can only ever produce ghosts.
 * `plan_adaptations.triggered_by` uses `auto` where this uses `rule`.
 */
export const PROVENANCE = ["user", "rule", "coach"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const COMPLETION_SOURCES = ["manual", "whoop", "strength-tool", "intervals"] as const;
export type CompletionSource = (typeof COMPLETION_SOURCES)[number];

// ── Coverage vocabulary ─────────────────────────────────────────────

export const BODY_REGIONS = [
  "glute_med",
  "adductors",
  "hip_flexors",
  "hamstrings",
  "calf_achilles",
  "ankle_mobility",
  "foot_arch",
  "thoracic_spine",
  "lumbar",
  "anti_rotation_core",
  "shoulder_cuff",
  "scap_stability",
  "neck",
  "wrists_forearms",
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export const REGION_LABELS: Record<BodyRegion, string> = {
  glute_med: "Glute medius",
  adductors: "Adductors",
  hip_flexors: "Hip flexors",
  hamstrings: "Hamstrings",
  calf_achilles: "Calf / Achilles",
  ankle_mobility: "Ankle",
  foot_arch: "Foot arch",
  thoracic_spine: "Thoracic spine",
  lumbar: "Lumbar",
  anti_rotation_core: "Anti-rotation core",
  shoulder_cuff: "Shoulder cuff",
  scap_stability: "Scapular stability",
  neck: "Neck",
  wrists_forearms: "Wrists / forearms",
};

export const STIMULUS_TYPES = [
  "mobility",
  "isometric",
  "eccentric",
  "motor_control",
  "activation",
] as const;
export type StimulusType = (typeof STIMULUS_TYPES)[number];

export const STIMULUS_LABELS: Record<StimulusType, string> = {
  mobility: "Mobility",
  isometric: "Isometric",
  eccentric: "Eccentric",
  motor_control: "Motor control",
  activation: "Activation",
};

/**
 * The spec's five-way stimulus axis collapses to one bit for tracking (D8):
 * did the tissue get loaded, or only lengthened? A calf stretch and a
 * heavy-slow calf raise both touch `calf_achilles`; only one loads the tendon.
 * The distinction survives on the exercise; it is not a tracking axis.
 */
export function isLoaded(stimulus: StimulusType): boolean {
  return stimulus !== "mobility";
}

// ── Focus areas (the user-facing granularity) ───────────────────────

export const FOCUS_AREAS = [
  "hips_glutes",
  "posterior_chain",
  "trunk",
  "thoracic",
  "neck_shoulders",
  "extremities",
] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const AREA_LABELS: Record<FocusArea, string> = {
  hips_glutes: "Hips & glutes",
  posterior_chain: "Posterior chain",
  trunk: "Trunk",
  thoracic: "Thoracic spine",
  neck_shoulders: "Neck & shoulders",
  extremities: "Feet, ankles & hands",
};

/** Every region belongs to exactly one area; every area has at least one region. */
export const AREA_REGIONS: Record<FocusArea, readonly BodyRegion[]> = {
  hips_glutes: ["glute_med", "hip_flexors", "adductors"],
  posterior_chain: ["hamstrings", "calf_achilles"],
  trunk: ["lumbar", "anti_rotation_core"],
  thoracic: ["thoracic_spine"],
  neck_shoulders: ["neck", "shoulder_cuff", "scap_stability"],
  extremities: ["ankle_mobility", "foot_arch", "wrists_forearms"],
};

const REGION_TO_AREA: Record<BodyRegion, FocusArea> = (() => {
  const map = {} as Record<BodyRegion, FocusArea>;
  for (const area of FOCUS_AREAS) {
    for (const region of AREA_REGIONS[area]) map[region] = area;
  }
  return map;
})();

export function areaOfRegion(region: BodyRegion): FocusArea {
  return REGION_TO_AREA[region];
}

/** Distinct areas touched by a set of regions, in canonical area order. */
export function areasOfRegions(regions: readonly BodyRegion[]): FocusArea[] {
  const seen = new Set(regions.map(areaOfRegion));
  return FOCUS_AREAS.filter((a) => seen.has(a));
}

/**
 * Default target intervals, in days (D8).
 *
 * Chosen so the profile is satisfiable *with margin*: Σ(1/target) ≈ 1.21/day
 * ≈ 8.5 stimuli per week, against ~14 area-hits from four rotating routines.
 * The spec's 24-cell profile demanded ≈29/week, which is why it went red and
 * stayed red. A goal profile that can only be met perfectly is a broken one.
 *
 * These are defaults, not prescriptions — fully editable per area, and marked
 * as defaults in the UI until edited.
 */

// ── Exercise bank vocabulary ────────────────────────────────────────

export const EQUIPMENT = [
  "none",
  "band",
  "dumbbell",
  "barbell",
  "kettlebell",
  "bench",
  "wall",
  "mat",
  "step",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_SCOPES = ["prehab", "strength"] as const;
export type ExerciseScope = (typeof EXERCISE_SCOPES)[number];

// ── Zod schemas (validation at IO boundaries) ───────────────────────

export const ModalitySchema = z.enum(MODALITIES);
export const BlockModalitySchema = z.enum(BLOCK_MODALITIES);
export const DayPartSchema = z.enum(DAY_PARTS);
export const BlockStatusSchema = z.enum(BLOCK_STATUSES);
export const ProvenanceSchema = z.enum(PROVENANCE);
export const CompletionSourceSchema = z.enum(COMPLETION_SOURCES);
export const BodyRegionSchema = z.enum(BODY_REGIONS);
export const StimulusTypeSchema = z.enum(STIMULUS_TYPES);
export const FocusAreaSchema = z.enum(FOCUS_AREAS);
export const EquipmentSchema = z.enum(EQUIPMENT);
export const ExerciseScopeSchema = z.enum(EXERCISE_SCOPES);
