-- Intervals.icu connection credentials and sync state (one per user)
create table public.icu_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  api_key text not null,
  athlete_id text not null,
  last_synced_at timestamptz,
  sync_status text not null default 'idle'
    check (sync_status in ('idle', 'syncing', 'error')),
  sync_error text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.icu_connections enable row level security;

create policy "Users can select own icu connection"
  on public.icu_connections
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own icu connection"
  on public.icu_connections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own icu connection"
  on public.icu_connections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own icu connection"
  on public.icu_connections
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Synced activity summaries from intervals.icu
create table public.icu_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  icu_id text not null,
  type text,
  name text,
  description text,
  start_date_local timestamptz,
  activity_date date not null,
  distance numeric,
  moving_time integer,
  elapsed_time integer,
  icu_training_load numeric,
  icu_intensity numeric,
  icu_ftp integer,
  avg_power integer,
  normalized_power integer,
  max_power integer,
  avg_hr integer,
  max_hr integer,
  avg_cadence integer,
  calories integer,
  elevation_gain numeric,
  icu_atl numeric,
  icu_ctl numeric,
  raw_data jsonb,
  source text not null default 'intervals.icu',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  unique (user_id, icu_id)
);

create index icu_activities_user_date_idx on public.icu_activities(user_id, activity_date);
create index icu_activities_user_start_date_idx on public.icu_activities(user_id, start_date_local desc);

alter table public.icu_activities enable row level security;

create policy "Users can select own icu activities"
  on public.icu_activities
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own icu activities"
  on public.icu_activities
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own icu activities"
  on public.icu_activities
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own icu activities"
  on public.icu_activities
  for delete
  to authenticated
  using (auth.uid() = user_id);
