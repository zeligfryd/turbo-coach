create table public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  scheduled_date date not null,
  created_at timestamp with time zone default now()
);

create index scheduled_workouts_user_date_idx on public.scheduled_workouts(user_id, scheduled_date);

alter table public.scheduled_workouts enable row level security;

create policy "Users can manage their own scheduled workouts"
  on public.scheduled_workouts for all using (auth.uid() = user_id);
