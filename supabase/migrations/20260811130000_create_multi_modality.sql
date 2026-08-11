-- Multi-modality training planner — foundation schema (v0).
-- See docs/multi-modality-plan-2026-08-09.md for the decisions behind this.
--
-- Shape of the thing:
--   • Non-bike sessions are `block` rows. Bike sessions stay in
--     `scheduled_workouts` and gain the two shared columns; the two are unioned
--     at read time in lib/training/read.ts (D1). There is no bike `block`.
--   • Vocabularies are text + check constraints, never Postgres enums (D2),
--     mirroring lib/training/taxonomy.ts. Change one, change the other.
--   • Coverage goals are per focus AREA — six rows, not seventy cells (D8).
--     Exercises keep region-level tags; areas are a roll-up.
--   • `exercise` and `routine` carry the same two-tier ownership as
--     public.workouts: seeded presets are global and read-only, users own
--     their own rows (D7).
--
-- The exercise/routine tables are created here even though their UI lands in
-- v1, so `block.routine_id` can be a real foreign key from the first commit
-- rather than a bare uuid patched up later.

-- ── Reference vocabularies (kept in one place for the checks below) ──
-- areas:    hips_glutes, posterior_chain, trunk, thoracic, neck_shoulders, extremities
-- regions:  14, see lib/training/taxonomy.ts BODY_REGIONS
-- stimulus: mobility, isometric, eccentric, motor_control, activation

create or replace function public.is_valid_area_array(tags text[])
returns boolean language sql immutable as $$
  select tags is null or tags <@ array[
    'hips_glutes','posterior_chain','trunk','thoracic','neck_shoulders','extremities'
  ]::text[];
$$;

create or replace function public.is_valid_region_array(tags text[])
returns boolean language sql immutable as $$
  select tags is null or tags <@ array[
    'glute_med','adductors','hip_flexors','hamstrings','calf_achilles','ankle_mobility',
    'foot_arch','thoracic_spine','lumbar','anti_rotation_core','shoulder_cuff',
    'scap_stability','neck','wrists_forearms'
  ]::text[];
$$;

-- ── exercise ────────────────────────────────────────────────────────

create table public.exercise (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,  -- null = seeded preset
  name text not null,
  regions text[] not null default '{}' check (public.is_valid_region_array(regions)),
  stimulus text not null check (stimulus in
    ('mobility','isometric','eccentric','motor_control','activation')),
  default_dose jsonb,
  equipment text[] not null default '{}',
  difficulty smallint check (difficulty between 1 and 3),
  cues text,
  notes text,
  media_url text,
  scope text not null default 'prehab' check (scope in ('prehab','strength')),
  is_preset boolean not null default false,
  is_public boolean not null default false,
  -- Set when a user duplicates a preset to edit it (D7). The copy shadows the
  -- original in the bank list.
  derived_from uuid references public.exercise(id) on delete set null,
  -- Retire, never delete: routine_item and historical completions point here,
  -- and coverage history is the product's value.
  archived_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  -- An exercise with no region contributes nothing to coverage and cannot be
  -- ranked; it would be invisible to the two features the bank exists for.
  -- cardinality(), not array_length(): array_length('{}', 1) is NULL, and a
  -- CHECK passes on NULL, so the array_length form accepts an empty array.
  constraint exercise_needs_a_region check (cardinality(regions) >= 1),
  -- Presets are global and unowned; user rows are owned and never presets.
  constraint exercise_ownership check (
    (is_preset and user_id is null) or (not is_preset and user_id is not null)
  )
);

create index exercise_user_idx on public.exercise(user_id) where user_id is not null;
create index exercise_scope_idx on public.exercise(scope) where archived_at is null;
create index exercise_regions_idx on public.exercise using gin(regions);

alter table public.exercise enable row level security;

create policy "Allow read access to exercises"
  on public.exercise for select to authenticated
  using (is_preset = true or is_public = true or user_id = auth.uid());

create policy "Allow users to create their own exercises"
  on public.exercise for insert to authenticated
  with check (user_id = auth.uid() and is_preset = false);

create policy "Allow users to update their own exercises"
  on public.exercise for update to authenticated
  using (user_id = auth.uid() and is_preset = false)
  with check (user_id = auth.uid() and is_preset = false);

create policy "Allow users to delete their own exercises"
  on public.exercise for delete to authenticated
  using (user_id = auth.uid() and is_preset = false);

comment on table public.exercise is
  'The exercise bank. Seeded rows are presets (user_id null, is_preset true) and are read-only; users create and own their own. Editing a preset duplicates it with derived_from set. Removal sets archived_at rather than deleting, because routine_item and completion history reference these rows.';

-- ── routine ─────────────────────────────────────────────────────────

create table public.routine (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,  -- null = seeded preset
  name text not null,
  est_duration_min smallint,
  -- { area: { loaded: bool } } — derived on save, read by the coverage view.
  coverage_vector jsonb not null default '{}'::jsonb,
  is_preset boolean not null default false,
  is_public boolean not null default false,
  derived_from uuid references public.routine(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint routine_ownership check (
    (is_preset and user_id is null) or (not is_preset and user_id is not null)
  )
);

create index routine_user_idx on public.routine(user_id) where user_id is not null;

alter table public.routine enable row level security;

create policy "Allow read access to routines"
  on public.routine for select to authenticated
  using (is_preset = true or is_public = true or user_id = auth.uid());

create policy "Allow users to create their own routines"
  on public.routine for insert to authenticated
  with check (user_id = auth.uid() and is_preset = false);

create policy "Allow users to update their own routines"
  on public.routine for update to authenticated
  using (user_id = auth.uid() and is_preset = false)
  with check (user_id = auth.uid() and is_preset = false);

create policy "Allow users to delete their own routines"
  on public.routine for delete to authenticated
  using (user_id = auth.uid() and is_preset = false);

comment on table public.routine is
  'An ordered prehab routine. The four seeded named routines (Post-ride 10, Hips & glutes 12, Upper 8, Tendon & trunk 10) ship as presets and are the default path (D8) — the user starts the stalest one rather than composing from scratch.';

-- ── routine_item ────────────────────────────────────────────────────

create table public.routine_item (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routine(id) on delete cascade,
  position smallint not null,
  exercise_id uuid not null references public.exercise(id) on delete restrict,
  dose jsonb,
  repeat_group smallint,
  unique (routine_id, position)
);

create index routine_item_routine_idx on public.routine_item(routine_id, position);

alter table public.routine_item enable row level security;

create policy "Users can read routine items they can read the routine for"
  on public.routine_item for select to authenticated
  using (exists (
    select 1 from public.routine r
    where r.id = routine_item.routine_id
      and (r.is_preset = true or r.is_public = true or r.user_id = auth.uid())
  ));

create policy "Users can modify items on their own routines"
  on public.routine_item for all to authenticated
  using (exists (
    select 1 from public.routine r
    where r.id = routine_item.routine_id and r.user_id = auth.uid() and r.is_preset = false
  ))
  with check (exists (
    select 1 from public.routine r
    where r.id = routine_item.routine_id and r.user_id = auth.uid() and r.is_preset = false
  ));

-- ── block_template ──────────────────────────────────────────────────

create table public.block_template (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  modality text not null check (modality in ('strength','mobility','yoga','prehab')),
  name text not null,
  duration_min smallint,
  -- Coarse things tag AREAS (six checkboxes), fine things tag regions (D8).
  area_tags text[] not null default '{}' check (public.is_valid_area_array(area_tags)),
  default_rpe numeric check (default_rpe between 1 and 10),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index block_template_user_idx on public.block_template(user_id);

alter table public.block_template enable row level security;

create policy "Users can manage their own block templates"
  on public.block_template for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.block_template is
  'A named, reusable plain block — e.g. "Legs hypertrophy, 55 min, [hips_glutes, posterior_chain, trunk]". This is what makes coverage correct before a per-exercise strength tool exists: ticking one feeds area recency at zero marginal effort.';

-- ── block ───────────────────────────────────────────────────────────

create table public.block (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  -- Day-parts, not clock times: no drag-to-resize, no overlap resolution,
  -- no timezone handling, and it matches how a training day is actually thought about.
  day_part text not null default 'am' check (day_part in ('am','midday','pm')),
  -- Bike is deliberately absent: it lives in scheduled_workouts (D1).
  modality text not null check (modality in ('strength','mobility','yoga','prehab')),
  name text not null,
  planned_duration_min smallint,
  planned_rpe numeric check (planned_rpe between 1 and 10),
  area_tags text[] not null default '{}' check (public.is_valid_area_array(area_tags)),
  routine_id uuid references public.routine(id) on delete set null,
  series_id uuid,          -- FK added with the series table in v2
  template_id uuid references public.block_template(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned','ghost','done','partial','skipped')),
  -- Provenance (D4). A coach can only ever produce a ghost: created_by='coach'
  -- with a null accepted_at, confirmed or dismissed by the user like any other.
  created_by text not null default 'user' check (created_by in ('user','rule','coach')),
  accepted_at timestamptz,
  detached_from_series boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  -- A ghost is by definition unaccepted; accepting one changes its status.
  constraint ghost_is_unaccepted check (status <> 'ghost' or accepted_at is null)
);

create index block_user_date_idx on public.block(user_id, date);
create index block_routine_idx on public.block(routine_id) where routine_id is not null;
create index block_series_idx on public.block(series_id) where series_id is not null;

alter table public.block enable row level security;

create policy "Users can manage their own blocks"
  on public.block for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.block is
  'A scheduled non-bike session. Bike sessions are not blocks — they remain in scheduled_workouts and are unioned in at read time (D1), so nothing about the cycling flow changes. Ghost blocks are proposals: visibly distinct, excluded from planned load, confirmed or dismissed in one tap.';

-- ── completion ──────────────────────────────────────────────────────
-- Manual ticks only. Bike session load is derived from the imported activity
-- (moving_time × rpe) inside read.ts; a completion row for a scheduled_workout
-- exists only when a ride is ticked that never imported. Two sources for the
-- same number would eventually disagree and double-count.

create table public.completion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  block_id uuid references public.block(id) on delete cascade,
  scheduled_workout_id uuid references public.scheduled_workouts(id) on delete cascade,
  -- Constrained from day one though only 'manual' is implemented: cheap
  -- future-proofing for the Whoop replacement and the strength tool.
  source text not null default 'manual'
    check (source in ('manual','whoop','strength-tool','intervals')),
  status text not null check (status in ('done','partial','skipped')),
  actual_duration_min smallint,
  srpe numeric check (srpe between 1 and 10),
  exercises jsonb,
  completed_at timestamptz default now() not null,
  constraint completion_targets_exactly_one
    check (num_nonnulls(block_id, scheduled_workout_id) = 1)
);

create unique index completion_block_idx on public.completion(block_id)
  where block_id is not null;
create unique index completion_scheduled_idx on public.completion(scheduled_workout_id)
  where scheduled_workout_id is not null;
create index completion_user_date_idx on public.completion(user_id, completed_at desc);

alter table public.completion enable row level security;

create policy "Users can manage their own completions"
  on public.completion for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.completion is
  'The shared completion contract: {source, status, actual_duration_min, srpe, exercises}. Any tool writes it; the planner reads it. sRPE x minutes is the ecosystem-wide load currency and the only number that sums across a strength session and a ride.';

-- ── coverage_goal ───────────────────────────────────────────────────
-- Six rows maximum per user, and only for areas the user has overridden:
-- absence means "use the default", which is resolved in resolveGoals().

create table public.coverage_goal (
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in
    ('hips_glutes','posterior_chain','trunk','thoracic','neck_shoulders','extremities')),
  target_days smallint not null check (target_days between 1 and 60),
  is_default boolean not null default false,
  updated_at timestamptz default now() not null,
  primary key (user_id, area)
);

alter table public.coverage_goal enable row level security;

create policy "Users can manage their own coverage goals"
  on public.coverage_goal for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.coverage_goal is
  'Target interval per focus area, in days. Six areas, not 70 region x stimulus cells (D8): the spec profile demanded ~29 stimuli/week, which no realistic routine rotation delivers, so the map went red and stayed red. Rows exist only where the user has overridden a default.';

-- ── scheduled_workouts: the two shared columns (D1) ─────────────────
-- Bike gains day_part and status so the union in read.ts produces one shape.
-- No ghost state: ghosts are a non-bike scheduling mechanic.

alter table public.scheduled_workouts
  add column day_part text not null default 'am'
    check (day_part in ('am','midday','pm')),
  add column status text not null default 'planned'
    check (status in ('planned','done','partial','skipped'));

comment on column public.scheduled_workouts.day_part is
  'Which part of the day this session sits in. Ordering within a day-part is enough; clock times are deliberately not modelled.';
comment on column public.scheduled_workouts.status is
  'Explicit status for a planned ride. Historically "done" was inferred from an activity landing on the same date; that inference still runs, and this column records an explicit tick.';

-- ── activities: bike sRPE (D3) ──────────────────────────────────────
-- Session load needs an RPE for rides. intervals.icu already exposes one
-- (rpe, falling back to feel); where absent it is estimated from intensity
-- factor and flagged, so an inferred number never passes for a reported one.

alter table public.activities
  add column rpe numeric check (rpe between 1 and 10),
  add column rpe_estimated boolean not null default false;

comment on column public.activities.rpe is
  'Session RPE for the ride. Populated from the intervals.icu rpe field (or feel) on sync; otherwise estimated from icu_intensity and marked in rpe_estimated.';
comment on column public.activities.rpe_estimated is
  'True when rpe was derived from intensity factor rather than reported by the rider. Estimated values must be visually distinguishable wherever load is shown.';

-- ── updated_at triggers (function created by the training plans migration) ──

create trigger exercise_set_updated_at
  before update on public.exercise
  for each row execute function public.set_updated_at();

create trigger routine_set_updated_at
  before update on public.routine
  for each row execute function public.set_updated_at();

create trigger block_template_set_updated_at
  before update on public.block_template
  for each row execute function public.set_updated_at();

create trigger block_set_updated_at
  before update on public.block
  for each row execute function public.set_updated_at();

create trigger coverage_goal_set_updated_at
  before update on public.coverage_goal
  for each row execute function public.set_updated_at();
