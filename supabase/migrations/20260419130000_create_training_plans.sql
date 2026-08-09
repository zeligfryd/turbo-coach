-- Training plan data model: hierarchical plans that can be authored in
-- isolation (draft), activated to materialise scheduled_workouts for
-- the calendar, and edited in-flight as adaptation happens.
--
-- Hierarchy:
--   training_plans
--     └── plan_blocks (mesocycle, e.g. "Base 1")
--           └── plan_weeks (microcycle)
--                 └── plan_days (one calendar day in the plan)
--                       └── plan_day_items (one or more workouts/items)
--
-- plan_adaptations captures the audit trail: why something changed.
-- scheduled_workouts remains the concrete calendar layer; activation
-- walks plan_day_items, runs the archetype matcher, and inserts rows.
-- plan_day_items.scheduled_workout_id links back so edits to future
-- items can be re-synced without touching completed sessions.

-- ── training_plans ─────────────────────────────────────────────────

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  goal text,
  philosophy text,
  duration_weeks smallint not null check (duration_weeks between 1 and 52),
  target_event_id uuid references public.race_events(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  start_date date,                       -- null until activated
  activated_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  -- A plan cannot be active without a start date.
  constraint active_requires_start_date
    check (status != 'active' or start_date is not null)
);

create index training_plans_user_idx
  on public.training_plans(user_id, status, start_date);

alter table public.training_plans enable row level security;

create policy "Users can view own training plans"
  on public.training_plans for select
  using (auth.uid() = user_id);

create policy "Users can insert own training plans"
  on public.training_plans for insert
  with check (auth.uid() = user_id);

create policy "Users can update own training plans"
  on public.training_plans for update
  using (auth.uid() = user_id);

create policy "Users can delete own training plans"
  on public.training_plans for delete
  using (auth.uid() = user_id);

comment on table public.training_plans is
  'Top-level training plan. Draft plans are edited in isolation; activation materialises scheduled_workouts for the calendar. duration_weeks is always set (1-52). target_event_id is optional — plans can be open-ended.';

-- ── plan_blocks ────────────────────────────────────────────────────

create table public.plan_blocks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  order_index smallint not null,
  name text not null,                    -- e.g. "Base 1", "Build 2", "Peak"
  duration_weeks smallint not null check (duration_weeks between 1 and 26),
  goal text,
  rationale text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (plan_id, order_index)
);

create index plan_blocks_plan_idx on public.plan_blocks(plan_id, order_index);

alter table public.plan_blocks enable row level security;

create policy "Users can view own plan blocks"
  on public.plan_blocks for select
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_blocks.plan_id and p.user_id = auth.uid()
  ));

create policy "Users can modify own plan blocks"
  on public.plan_blocks for all
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_blocks.plan_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.training_plans p
    where p.id = plan_blocks.plan_id and p.user_id = auth.uid()
  ));

-- ── plan_weeks ─────────────────────────────────────────────────────

create table public.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.plan_blocks(id) on delete cascade,
  order_index smallint not null,         -- 0-based within the block
  theme text,                            -- e.g. "build", "recovery", "race week"
  target_tss integer,
  rationale text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (block_id, order_index)
);

create index plan_weeks_block_idx on public.plan_weeks(block_id, order_index);

alter table public.plan_weeks enable row level security;

create policy "Users can view own plan weeks"
  on public.plan_weeks for select
  using (exists (
    select 1 from public.plan_blocks b
    join public.training_plans p on p.id = b.plan_id
    where b.id = plan_weeks.block_id and p.user_id = auth.uid()
  ));

create policy "Users can modify own plan weeks"
  on public.plan_weeks for all
  using (exists (
    select 1 from public.plan_blocks b
    join public.training_plans p on p.id = b.plan_id
    where b.id = plan_weeks.block_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plan_blocks b
    join public.training_plans p on p.id = b.plan_id
    where b.id = plan_weeks.block_id and p.user_id = auth.uid()
  ));

-- ── plan_days ──────────────────────────────────────────────────────

create table public.plan_days (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.plan_weeks(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Monday
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (week_id, day_of_week)
);

create index plan_days_week_idx on public.plan_days(week_id);

alter table public.plan_days enable row level security;

create policy "Users can view own plan days"
  on public.plan_days for select
  using (exists (
    select 1 from public.plan_weeks w
    join public.plan_blocks b on b.id = w.block_id
    join public.training_plans p on p.id = b.plan_id
    where w.id = plan_days.week_id and p.user_id = auth.uid()
  ));

create policy "Users can modify own plan days"
  on public.plan_days for all
  using (exists (
    select 1 from public.plan_weeks w
    join public.plan_blocks b on b.id = w.block_id
    join public.training_plans p on p.id = b.plan_id
    where w.id = plan_days.week_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plan_weeks w
    join public.plan_blocks b on b.id = w.block_id
    join public.training_plans p on p.id = b.plan_id
    where w.id = plan_days.week_id and p.user_id = auth.uid()
  ));

-- ── plan_day_items ─────────────────────────────────────────────────

create table public.plan_day_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.plan_days(id) on delete cascade,
  order_index smallint not null default 0,
  kind text not null default 'cycling'
    check (kind in ('cycling', 'strength', 'other')),
  archetype text references public.workout_archetypes(id) on delete set null,
  target_duration_min smallint,
  target_tiz_min smallint,
  notes text,
  -- Populated when the parent plan is activated and the item is
  -- materialised via the archetype matcher. Null for items on
  -- not-yet-activated plans, non-cycling items, or items whose
  -- scheduled session has been manually unlinked.
  scheduled_workout_id uuid references public.scheduled_workouts(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (day_id, order_index),
  -- Cycling items must have an archetype and duration; other kinds don't.
  constraint cycling_requires_archetype
    check (kind != 'cycling' or (archetype is not null and target_duration_min is not null))
);

create index plan_day_items_day_idx
  on public.plan_day_items(day_id, order_index);
create index plan_day_items_scheduled_idx
  on public.plan_day_items(scheduled_workout_id)
  where scheduled_workout_id is not null;

alter table public.plan_day_items enable row level security;

create policy "Users can view own plan day items"
  on public.plan_day_items for select
  using (exists (
    select 1 from public.plan_days d
    join public.plan_weeks w on w.id = d.week_id
    join public.plan_blocks b on b.id = w.block_id
    join public.training_plans p on p.id = b.plan_id
    where d.id = plan_day_items.day_id and p.user_id = auth.uid()
  ));

create policy "Users can modify own plan day items"
  on public.plan_day_items for all
  using (exists (
    select 1 from public.plan_days d
    join public.plan_weeks w on w.id = d.week_id
    join public.plan_blocks b on b.id = w.block_id
    join public.training_plans p on p.id = b.plan_id
    where d.id = plan_day_items.day_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plan_days d
    join public.plan_weeks w on w.id = d.week_id
    join public.plan_blocks b on b.id = w.block_id
    join public.training_plans p on p.id = b.plan_id
    where d.id = plan_day_items.day_id and p.user_id = auth.uid()
  ));

comment on table public.plan_day_items is
  'A planned workout/activity inside a plan_day. Multiple items per day allowed (e.g. main session + evening recovery spin). kind=cycling requires archetype+duration (resolved to a concrete workout via the matcher on activation). kind=strength reserved for future use.';

-- ── plan_adaptations ───────────────────────────────────────────────
-- Audit log for in-flight plan edits. Captures scope + reason so the
-- coach can reference past adaptations when making future decisions,
-- and the rider can see why things changed.

create table public.plan_adaptations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  -- The smallest unit affected by this adaptation. Higher-level scopes
  -- (week, block, whole plan) set the coarser FK and leave finer ones null.
  block_id uuid references public.plan_blocks(id) on delete set null,
  week_id uuid references public.plan_weeks(id) on delete set null,
  day_id uuid references public.plan_days(id) on delete set null,
  item_id uuid references public.plan_day_items(id) on delete set null,
  scope text not null
    check (scope in ('plan', 'block', 'week', 'day', 'item')),
  reason text not null,          -- "rider reported illness", "inserted opener for new race"
  triggered_by text not null default 'user'
    check (triggered_by in ('user', 'coach', 'auto')),
  details jsonb,                 -- optional before/after snapshot
  created_at timestamptz default now() not null
);

create index plan_adaptations_plan_idx
  on public.plan_adaptations(plan_id, created_at desc);

alter table public.plan_adaptations enable row level security;

create policy "Users can view own plan adaptations"
  on public.plan_adaptations for select
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_adaptations.plan_id and p.user_id = auth.uid()
  ));

create policy "Users can insert own plan adaptations"
  on public.plan_adaptations for insert
  with check (exists (
    select 1 from public.training_plans p
    where p.id = plan_adaptations.plan_id and p.user_id = auth.uid()
  ));

comment on table public.plan_adaptations is
  'Audit log of in-flight plan edits. Records why a plan, block, week, day, or item changed. Used by the coach to maintain rationale continuity across adaptations and by the UI to show the rider what changed and why.';

-- ── updated_at triggers ────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger training_plans_set_updated_at
  before update on public.training_plans
  for each row execute function public.set_updated_at();

create trigger plan_blocks_set_updated_at
  before update on public.plan_blocks
  for each row execute function public.set_updated_at();

create trigger plan_weeks_set_updated_at
  before update on public.plan_weeks
  for each row execute function public.set_updated_at();

create trigger plan_days_set_updated_at
  before update on public.plan_days
  for each row execute function public.set_updated_at();

create trigger plan_day_items_set_updated_at
  before update on public.plan_day_items
  for each row execute function public.set_updated_at();

-- ── scheduled_workouts linkage ─────────────────────────────────────
-- Tag each scheduled workout with the plan (and specific plan_day_item)
-- that produced it. Enables:
--   • Filtering "show only plan sessions" in the calendar UI.
--   • Deactivation: delete future rows WHERE plan_id = :id, preserving
--     completed rows as history.
--   • Analytics joining past work back to its plan of origin.
-- Both columns are nullable — manually-added calendar workouts stay
-- unlinked. on delete set null on plan_id so deleting a plan doesn't
-- cascade away the historical scheduled_workouts records.

alter table public.scheduled_workouts
  add column plan_id uuid references public.training_plans(id) on delete set null,
  add column plan_day_item_id uuid references public.plan_day_items(id) on delete set null;

create index scheduled_workouts_plan_idx
  on public.scheduled_workouts(plan_id, scheduled_date)
  where plan_id is not null;

comment on column public.scheduled_workouts.plan_id is
  'Training plan this scheduled session was materialised from. Null for ad-hoc workouts. Set to null (not cascaded) if the plan is deleted so historical records survive.';
comment on column public.scheduled_workouts.plan_day_item_id is
  'Specific plan_day_item that generated this scheduled workout. Used by the re-sync flow to identify which items have already materialised and by the UI to jump back to the plan item.';
