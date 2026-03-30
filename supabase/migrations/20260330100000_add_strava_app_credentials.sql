-- Per-user Strava OAuth app credentials.
-- Used when NEXT_PUBLIC_STRAVA_USER_CREDENTIALS_MODE=true, which forces every
-- user to supply their own Strava client ID and secret instead of the
-- application-level environment variables.
create table public.strava_app_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_id text not null,
  client_secret text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.strava_app_credentials enable row level security;

create policy "Users can select own strava app credentials"
  on public.strava_app_credentials for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own strava app credentials"
  on public.strava_app_credentials for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own strava app credentials"
  on public.strava_app_credentials for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own strava app credentials"
  on public.strava_app_credentials for delete to authenticated
  using (auth.uid() = user_id);
