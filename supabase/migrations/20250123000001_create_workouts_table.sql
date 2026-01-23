-- Create workouts table
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  tags text[] default '{}',
  intervals jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.workouts enable row level security;

-- Allow public read access (no authentication required)
create policy "Allow public read access to workouts"
  on public.workouts
  for select
  to public
  using (true);

-- Create index for category filtering
create index workouts_category_idx on public.workouts(category);

-- Create index for tag searches
create index workouts_tags_idx on public.workouts using gin(tags);
