-- Rename icu_id to external_id for multi-source support
alter table public.icu_activities rename column icu_id to external_id;

-- Drop old unique constraint and add source-aware one
alter table public.icu_activities drop constraint if exists icu_activities_user_id_icu_id_key;
alter table public.icu_activities add constraint icu_activities_user_external_source_key
  unique (user_id, external_id, source);

-- Strava OAuth connection (one per user)
create table public.strava_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  strava_athlete_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text,
  last_synced_at timestamptz,
  sync_status text not null default 'idle'
    check (sync_status in ('idle', 'syncing', 'error')),
  sync_error text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.strava_connections enable row level security;

create policy "Users can select own strava connection"
  on public.strava_connections for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own strava connection"
  on public.strava_connections for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own strava connection"
  on public.strava_connections for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own strava connection"
  on public.strava_connections for delete to authenticated
  using (auth.uid() = user_id);

-- Daily wellness / fitness metrics from intervals.icu
create table public.wellness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ctl numeric,
  atl numeric,
  tsb numeric,
  ramp_rate numeric,
  resting_hr integer,
  hrv numeric,
  raw_data jsonb,
  source text not null default 'intervals.icu',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  unique (user_id, date, source)
);

create index wellness_user_date_idx on public.wellness(user_id, date);

alter table public.wellness enable row level security;

create policy "Users can select own wellness"
  on public.wellness for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own wellness"
  on public.wellness for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own wellness"
  on public.wellness for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own wellness"
  on public.wellness for delete to authenticated
  using (auth.uid() = user_id);
