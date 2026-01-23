-- Create user_favorite_workouts junction table
create table public.user_favorite_workouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, workout_id)
);

-- Enable Row Level Security
alter table public.user_favorite_workouts enable row level security;

-- Allow users to read their own favorites
create policy "Users can read own favorites"
  on public.user_favorite_workouts
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Allow users to insert their own favorites
create policy "Users can insert own favorites"
  on public.user_favorite_workouts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Allow users to delete their own favorites
create policy "Users can delete own favorites"
  on public.user_favorite_workouts
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Create indexes for efficient lookups
create index user_favorite_workouts_user_id_idx on public.user_favorite_workouts(user_id);
create index user_favorite_workouts_workout_id_idx on public.user_favorite_workouts(workout_id);
