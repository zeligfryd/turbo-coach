-- A reusable week: "routine A on Monday, yoga plus routine B on Tuesday,
-- nothing Wednesday" — saved once, applied to any week in the calendar.
--
-- This is a convenience for filling a week in one action, not a planning
-- engine. Applying writes ordinary blocks, indistinguishable from ones added by
-- hand, so everything downstream — completion, coverage, load, deletion —
-- already works on them and none of it needs to know templates exist.

create table if not exists public.week_template (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists week_template_user_idx on public.week_template(user_id);

create table if not exists public.week_template_slot (
  id uuid primary key default gen_random_uuid(),
  week_template_id uuid not null references public.week_template(id) on delete cascade,
  -- 0 = Monday, matching startOfWeek() everywhere else in the app.
  weekday smallint not null check (weekday between 0 and 6),
  day_part text not null default 'am' check (day_part in ('am', 'midday', 'pm')),
  -- A slot is either a routine from the library, or a plain session such as a
  -- yoga class that has no exercise list. Exactly one of the two.
  routine_id uuid references public.routine(id) on delete cascade,
  modality text check (modality in ('strength', 'mobility', 'yoga', 'prehab')),
  name text,
  duration_min smallint check (duration_min between 1 and 600),
  area_tags text[] not null default '{}' check (is_valid_area_array(area_tags)),
  position smallint not null default 0,
  constraint week_template_slot_source_check check (
    (routine_id is not null and modality is null and name is null)
    or (routine_id is null and modality is not null and name is not null)
  )
);

create index if not exists week_template_slot_parent_idx
  on public.week_template_slot(week_template_id, weekday, position);

comment on table public.week_template is
  'A named week of off-bike sessions, applied to a calendar week to create the blocks in one action.';
comment on column public.week_template_slot.weekday is
  '0 = Monday, through 6 = Sunday. Matches startOfWeek() used throughout the app.';
comment on column public.week_template_slot.routine_id is
  'When set, the slot schedules this routine and takes its name and duration at apply time, so renaming a routine updates every template using it. Null for a plain session, which carries its own name and modality.';

alter table public.week_template enable row level security;
alter table public.week_template_slot enable row level security;

create policy "Users can manage their own week templates"
  on public.week_template for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Slots are reached only through their template, so ownership is checked there.
create policy "Users can manage slots of their own week templates"
  on public.week_template_slot for all
  to authenticated
  using (
    exists (
      select 1 from public.week_template t
       where t.id = week_template_slot.week_template_id
         and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.week_template t
       where t.id = week_template_slot.week_template_id
         and t.user_id = auth.uid()
    )
  );
