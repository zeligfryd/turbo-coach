create extension if not exists vector with schema extensions;

create table public.knowledge_chunks (
  id bigint generated always as identity primary key,
  content text not null,
  source text,
  category text,
  embedding extensions.vector(1536) not null,
  created_at timestamp with time zone default now()
);

create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 5,
  match_threshold float default 0.5
)
returns table (
  id bigint,
  content text,
  source text,
  category text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    kc.id,
    kc.content,
    kc.source,
    kc.category,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

alter table public.knowledge_chunks enable row level security;

create policy "Authenticated users can read knowledge chunks"
  on public.knowledge_chunks
  for select
  to authenticated
  using (true);
