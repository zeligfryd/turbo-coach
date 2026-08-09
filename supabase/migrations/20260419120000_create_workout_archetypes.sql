-- Phase 1 of training plans system:
-- 1. Create workout_archetypes table — canonical workout types used by the coach
--    to prescribe sessions without specifying interval-level detail.
-- 2. Snapshot existing presets to workouts_legacy (backup for later review;
--    presets remain in the main workouts table so existing scheduled_workouts
--    are not orphaned).
-- 3. Add archetype + time_in_zone_seconds columns to workouts. The matcher will
--    only consider workouts WHERE archetype IS NOT NULL — untagged legacy presets
--    stay visible in the library UI but are excluded from coach prescriptions.

-- ── 1. workout_archetypes ────────────────────────────────────────────

create table public.workout_archetypes (
  id text primary key,                        -- e.g. 'threshold_long_reps'
  name text not null,                         -- "Threshold — Long Reps"
  category text not null,                     -- broad bucket: endurance, threshold, vo2max, etc.
  zone_label text not null,                   -- human-readable zone: "95-105% FTP"
  default_intensity_min smallint,             -- 95
  default_intensity_max smallint,             -- 105
  default_duration_min smallint,              -- minutes
  default_duration_max smallint,              -- minutes
  default_tiz_min smallint,                   -- target time-in-zone (minutes)
  default_tiz_max smallint,
  description text,                           -- short coach-facing summary
  rationale text,                             -- physiological rationale (book-grounded)
  examples text[] default '{}',               -- ["Friel 2×20 at LT", "Coggan L4 ladders"]
  sources text[] default '{}',                -- ["Friel ch.9", "Allen/Coggan ch.7"]
  display_order smallint default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.workout_archetypes enable row level security;

create policy "Allow read access to workout archetypes"
  on public.workout_archetypes
  for select
  to authenticated
  using (true);

create index workout_archetypes_category_idx on public.workout_archetypes(category);
create index workout_archetypes_display_order_idx on public.workout_archetypes(display_order);

comment on table public.workout_archetypes is
  'Canonical workout types used by the coach to prescribe sessions. Each archetype defines an intensity bracket, duration bracket, and target time-in-zone. The matcher resolves a {archetype, duration} prescription to a concrete workout from the workouts table.';

-- ── 2. workouts_legacy: snapshot presets for later review ───────────

create table public.workouts_legacy (like public.workouts including all);

insert into public.workouts_legacy
select * from public.workouts where is_preset = true;

alter table public.workouts_legacy enable row level security;

create policy "Allow read access to legacy workouts"
  on public.workouts_legacy
  for select
  to authenticated
  using (true);

comment on table public.workouts_legacy is
  'Snapshot of public.workouts presets as of the archetype migration. Read-only reference for evaluating which existing workouts (if any) should be re-introduced with archetype tags. Presets remain in the live workouts table; this is purely a backup for our review. Drop this table once the cleanup pass is complete.';

-- ── 3. extend workouts with archetype + time_in_zone ────────────────

alter table public.workouts
  add column archetype text references public.workout_archetypes(id) on delete set null,
  add column time_in_zone_seconds integer;

create index workouts_archetype_idx on public.workouts(archetype);
create index workouts_archetype_duration_idx
  on public.workouts(archetype, duration_seconds)
  where archetype is not null;

comment on column public.workouts.archetype is
  'Workout archetype this session implements (FK to workout_archetypes.id). Used by the matcher when the coach prescribes a {archetype, duration} pair.';
comment on column public.workouts.time_in_zone_seconds is
  'Total time accumulated in the archetype''s target intensity bracket. Computed when the workout is seeded; used for matcher ranking when a prescription specifies target TIZ.';
