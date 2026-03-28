-- Link a conversation to a specific race event (optional)
-- Used to restore race context when a conversation is reopened from outside the race page
alter table public.coach_conversations
  add column if not exists race_id uuid references public.race_events(id) on delete set null;

create index if not exists coach_conversations_race_id_idx
  on public.coach_conversations(race_id)
  where race_id is not null;
