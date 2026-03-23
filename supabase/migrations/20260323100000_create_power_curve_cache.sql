-- Power curve cache: aggregated best efforts across all activities
create table public.power_curve_cache (
  user_id uuid primary key references auth.users(id) on delete cascade,
  all_time jsonb not null default '[]',
  last_42d jsonb not null default '[]',
  profile jsonb,
  updated_at timestamptz default now() not null
);

alter table public.power_curve_cache enable row level security;

create policy "Users can select own power curve cache"
  on public.power_curve_cache
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own power curve cache"
  on public.power_curve_cache
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own power curve cache"
  on public.power_curve_cache
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Add gender to users for Coggan reference table selection
alter table public.users add column if not exists gender text
  check (gender in ('male', 'female'));

-- Per-activity peak power cache (avoids re-fetching from external APIs)
alter table public.icu_activities add column if not exists peak_powers jsonb;
