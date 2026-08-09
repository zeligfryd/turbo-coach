// TypeScript types mirroring the training_plans hierarchy defined in
// supabase/migrations/20260419130000_create_training_plans.sql.

export const PLAN_STATUSES = ["draft", "active", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

export const PLAN_ITEM_KINDS = ["cycling", "strength", "other"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const ADAPTATION_SCOPES = ["plan", "block", "week", "day", "item"] as const;
export type AdaptationScope = (typeof ADAPTATION_SCOPES)[number];

export const ADAPTATION_TRIGGERS = ["user", "coach", "auto"] as const;
export type AdaptationTrigger = (typeof ADAPTATION_TRIGGERS)[number];

export type TrainingPlan = {
  id: string;
  user_id: string;
  name: string;
  goal: string | null;
  philosophy: string | null;
  duration_weeks: number;
  target_event_id: string | null;
  status: PlanStatus;
  start_date: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanBlock = {
  id: string;
  plan_id: string;
  order_index: number;
  name: string;
  duration_weeks: number;
  goal: string | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanWeek = {
  id: string;
  block_id: string;
  order_index: number;
  theme: string | null;
  target_tss: number | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanDay = {
  id: string;
  week_id: string;
  day_of_week: number; // 0 = Monday .. 6 = Sunday
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanDayItem = {
  id: string;
  day_id: string;
  order_index: number;
  kind: PlanItemKind;
  archetype: string | null;
  target_duration_min: number | null;
  target_tiz_min: number | null;
  notes: string | null;
  scheduled_workout_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanAdaptation = {
  id: string;
  plan_id: string;
  block_id: string | null;
  week_id: string | null;
  day_id: string | null;
  item_id: string | null;
  scope: AdaptationScope;
  reason: string;
  triggered_by: AdaptationTrigger;
  details: unknown;
  created_at: string;
};

// Fully hydrated plan tree used by the editor. Each level carries its children.
export type PlanWeekWithChildren = PlanWeek & {
  days: (PlanDay & { items: PlanDayItem[] })[];
};

export type PlanBlockWithChildren = PlanBlock & {
  weeks: PlanWeekWithChildren[];
};

export type PlanWithTree = TrainingPlan & {
  blocks: PlanBlockWithChildren[];
};

// Lightweight row used by the plans list page.
export type PlanListRow = Pick<
  TrainingPlan,
  "id" | "name" | "goal" | "duration_weeks" | "status" | "start_date" | "target_event_id" | "updated_at"
>;
