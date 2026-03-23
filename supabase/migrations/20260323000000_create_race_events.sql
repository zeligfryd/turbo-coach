-- Race events table
create table if not exists race_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  race_date date not null,
  event_type text not null default 'road_race'
    check (event_type in (
      'crit', 'gran_fondo', 'time_trial', 'road_race',
      'gravel', 'cyclocross', 'hill_climb', 'sportive', 'other'
    )),
  distance_km numeric,
  elevation_m numeric,
  notes text,
  gpx_data jsonb,          -- processed GPX: { points[], segments[], totalDistanceKm, totalElevationM }
  pacing_plan jsonb,       -- AI-generated pacing plan
  readiness_score integer, -- cached 0-100
  readiness_interpretation text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists race_events_user_date_idx
  on race_events (user_id, race_date desc);

-- RLS
alter table race_events enable row level security;

create policy "Users can view own race events"
  on race_events for select
  using (auth.uid() = user_id);

create policy "Users can insert own race events"
  on race_events for insert
  with check (auth.uid() = user_id);

create policy "Users can update own race events"
  on race_events for update
  using (auth.uid() = user_id);

create policy "Users can delete own race events"
  on race_events for delete
  using (auth.uid() = user_id);
