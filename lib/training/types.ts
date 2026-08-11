// TypeScript types mirroring the multi-modality tables. See
// docs/multi-modality-plan-2026-08-09.md §4 and the migration that follows it.

import type {
  BlockModality,
  BlockStatus,
  BodyRegion,
  CompletionSource,
  DayPart,
  Equipment,
  ExerciseScope,
  FocusArea,
  Modality,
  Provenance,
  StimulusType,
} from "./taxonomy";

// ── Row types ───────────────────────────────────────────────────────

export type BlockRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  day_part: DayPart;
  modality: BlockModality;
  name: string;
  planned_duration_min: number | null;
  planned_rpe: number | null;
  area_tags: FocusArea[];
  routine_id: string | null;
  series_id: string | null;
  template_id: string | null;
  status: BlockStatus;
  created_by: Provenance;
  accepted_at: string | null;
  detached_from_series: boolean;
  created_at: string;
  updated_at: string;
};

export type BlockTemplateRow = {
  id: string;
  user_id: string;
  modality: BlockModality;
  name: string;
  duration_min: number | null;
  area_tags: FocusArea[];
  default_rpe: number | null;
  created_at: string;
  updated_at: string;
};

export type ExerciseRow = {
  id: string;
  user_id: string | null; // null for seeded presets
  name: string;
  regions: BodyRegion[];
  stimulus: StimulusType;
  default_dose: unknown;
  equipment: Equipment[];
  difficulty: number | null;
  cues: string | null;
  /** Fuller "how to perform" text, shown when a card is expanded. */
  description: string | null;
  notes: string | null;
  media_url: string | null;
  scope: ExerciseScope;
  is_preset: boolean;
  is_public: boolean;
  derived_from: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoutineRow = {
  id: string;
  user_id: string | null; // null for the seeded named routines
  name: string;
  est_duration_min: number | null;
  /** Areas the routine touches, and whether anything loaded touches them. */
  coverage_vector: RoutineCoverage;
  is_preset: boolean;
  is_public: boolean;
  derived_from: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoutineItemRow = {
  id: string;
  routine_id: string;
  position: number;
  exercise_id: string;
  dose: unknown;
  repeat_group: number | null;
};

export type CompletionRow = {
  id: string;
  user_id: string;
  block_id: string | null;
  scheduled_workout_id: string | null;
  source: CompletionSource;
  status: BlockStatus;
  actual_duration_min: number | null;
  srpe: number | null;
  exercises: unknown;
  completed_at: string;
};

export type CoverageGoalRow = {
  user_id: string;
  area: FocusArea;
  target_days: number;
  is_default: boolean;
};

/** Per-area: touched at all, and touched by something loaded (D8). */
export type RoutineCoverage = Partial<Record<FocusArea, { loaded: boolean }>>;

// ── The union shape (D1) ────────────────────────────────────────────

/**
 * One planned or completed thing on a day, regardless of which table it came
 * from. Bike sessions live in `scheduled_workouts`; everything else lives in
 * `block`. `lib/training/read.ts` is the ONLY place that knows the difference —
 * no component or view may branch on `source`.
 */
export type PlannedItem = {
  id: string;
  source: "block" | "scheduled_workout";
  date: string; // YYYY-MM-DD
  dayPart: DayPart;
  modality: Modality;
  name: string;
  plannedDurationMin: number | null;
  plannedRpe: number | null;
  areaTags: FocusArea[];
  routineId: string | null;
  seriesId: string | null;
  templateId: string | null;
  status: BlockStatus;
  createdBy: Provenance;
  acceptedAt: string | null;
  /**
   * False for bike: it contributes load and position but is created and edited
   * only through the existing cycling flow.
   */
  editableHere: boolean;
  /** Bike only — the workout behind the session, and its planned TSS. */
  workoutId: string | null;
  plannedTss: number | null;
};

// ── Derived shapes (all produced by derive.ts, never by components) ──

/**
 * One stimulus landing on one area on one day. Produced by read.ts from
 * completed blocks (via routine coverage or area tags) and fed to derive.ts.
 */
export type CoverageEvent = {
  date: string; // YYYY-MM-DD
  area: FocusArea;
  /** False when only mobility work touched the area — drives "stretch only". */
  loaded: boolean;
};

export type AreaCoverage = {
  area: FocusArea;
  targetDays: number;
  isDefault: boolean;
  /** Null when the area has never been covered. */
  lastCoveredDate: string | null;
  daysSince: number | null;
  /** daysSince / targetDays. Null when never covered. */
  ratio: number | null;
  status: CoverageStatus;
  /** True when the area has been touched, but never by anything loaded. */
  stretchOnly: boolean;
};

export const COVERAGE_STATUSES = ["fresh", "due", "overdue", "never"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export type ModalityLoad = {
  modality: Modality;
  /** sRPE × minutes. The only currency that sums across modalities. */
  load: number;
  minutes: number;
  /** Bike only; null elsewhere. Never mixed into `load`. */
  tss: number | null;
};

export type WeekLoad = {
  weekStart: string; // Monday, YYYY-MM-DD
  totalLoad: number;
  totalMinutes: number;
  byModality: ModalityLoad[];
  /** Bike TSS, kept separate from session load on purpose (P4). */
  bikeTss: number;
};
