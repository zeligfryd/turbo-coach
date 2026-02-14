create table public.ride_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  workout_id uuid references public.workouts(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  workout_completed boolean default false,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'aborted')),
  avg_power integer,
  normalized_power integer,
  max_power integer,
  avg_cadence integer,
  max_cadence integer,
  intensity_factor numeric(4,2),
  tss numeric(6,1),
  total_distance integer,
  total_work integer,
  ftp_at_time integer,
  trainer_name text,
  data_points jsonb,
  created_at timestamptz default now() not null
);

create index ride_sessions_user_id_idx on public.ride_sessions(user_id);
create index ride_sessions_started_at_idx on public.ride_sessions(started_at desc);

alter table public.ride_sessions enable row level security;

create policy "Users can read own ride sessions"
  on public.ride_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own ride sessions"
  on public.ride_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own ride sessions"
  on public.ride_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own ride sessions"
  on public.ride_sessions
  for delete
  to authenticated
  using (auth.uid() = user_id);
