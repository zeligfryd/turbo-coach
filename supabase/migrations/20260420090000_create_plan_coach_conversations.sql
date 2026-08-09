-- One persistent conversation per training plan. Messages are stored as a
-- JSON array of the AI SDK's UIMessage shape — the chat UI loads this on
-- mount and the API route persists after each stream so the thread survives
-- reloads. Keyed uniquely on plan_id; cascades when the plan is deleted.

create table public.plan_coach_conversations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.training_plans(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_coach_conversations_plan_idx
  on public.plan_coach_conversations(plan_id);

alter table public.plan_coach_conversations enable row level security;

create policy "Users can view their plan coach conversations"
  on public.plan_coach_conversations for select
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_coach_conversations.plan_id and p.user_id = auth.uid()
  ));

create policy "Users can modify their plan coach conversations"
  on public.plan_coach_conversations for all
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_coach_conversations.plan_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.training_plans p
    where p.id = plan_coach_conversations.plan_id and p.user_id = auth.uid()
  ));

create trigger plan_coach_conversations_set_updated_at
  before update on public.plan_coach_conversations
  for each row execute function public.set_updated_at();

comment on table public.plan_coach_conversations is
  'Persistent chat thread between the rider and the plan coach, scoped to a single training plan. One row per plan (unique on plan_id). Messages stored as the AI SDK UIMessage JSON array.';
