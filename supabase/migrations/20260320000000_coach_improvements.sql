-- Add coach feature settings to users table
alter table users
  add column if not exists weekly_summary_enabled boolean not null default false,
  add column if not exists auto_analysis_enabled boolean not null default false;

-- Table for proactive coach insights (weekly summaries + post-ride analyses)
create table if not exists coach_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('weekly_summary', 'post_ride_analysis')),
  content text not null,
  metadata jsonb default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_coach_insights_user_unread
  on coach_insights (user_id, read, created_at desc);

-- RLS for coach_insights
alter table coach_insights enable row level security;

create policy "Users can read own insights"
  on coach_insights for select using (auth.uid() = user_id);

create policy "Users can update own insights"
  on coach_insights for update using (auth.uid() = user_id);

create policy "Service can insert insights"
  on coach_insights for insert with check (auth.uid() = user_id);

create policy "Users can delete own insights"
  on coach_insights for delete using (auth.uid() = user_id);
