-- Coach conversations (messages stored as JSONB array)
create table public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index coach_conversations_user_updated_idx
  on public.coach_conversations(user_id, updated_at desc);

alter table public.coach_conversations enable row level security;

create policy "Users can select own coach conversations"
  on public.coach_conversations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own coach conversations"
  on public.coach_conversations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own coach conversations"
  on public.coach_conversations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own coach conversations"
  on public.coach_conversations
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Coach memories (persistent athlete facts across conversations)
create table public.coach_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in ('goals', 'preferences', 'limitations', 'training_patterns', 'insights', 'biographical')),
  content text not null,
  source_conversation_id uuid references public.coach_conversations(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index coach_memories_user_category_idx
  on public.coach_memories(user_id, category);

alter table public.coach_memories enable row level security;

create policy "Users can select own coach memories"
  on public.coach_memories
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own coach memories"
  on public.coach_memories
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own coach memories"
  on public.coach_memories
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own coach memories"
  on public.coach_memories
  for delete
  to authenticated
  using (auth.uid() = user_id);
