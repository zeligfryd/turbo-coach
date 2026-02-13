# Knowledge Ingestion (Phase A)

This folder contains a skeleton ingestion script for loading cycling knowledge into `knowledge_chunks`.

The app's query-time RAG pipeline is already wired. You only need to run ingestion when adding/updating source material.

## Goal

Convert a long-form source (book, notes, references) into semantic chunks:

1. Read source markdown
2. Split into chunks (about 300-500 tokens with small overlap)
3. Embed each chunk with OpenAI embeddings
4. Insert chunks into `public.knowledge_chunks`

## Prerequisites

- Supabase database running with migrations applied (including `knowledge_chunks`)
- OpenAI API key
- Source content as markdown

Environment variables required for the script:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Optional:

- `INGEST_SOURCE` (path to markdown file)
- `INGEST_SOURCE_LABEL` (source name to store in DB)
- `INGEST_CATEGORY` (category tag, e.g. `vo2max`)
- `INGEST_MAX_CHARS_PER_CHUNK` (default `1800`)

## Source preparation

1. Convert your book/PDF to markdown (`.md`).
2. Keep headings (`#`, `##`, `###`) because they improve chunk context.
3. Clean noisy pages (footers, table-of-contents duplicates, legal boilerplate if not useful).
4. Save to a local path (example: `data/book/cycling-training.md`).

## Run

The repository does not currently include a TypeScript script runner. You can run with one of:

- `npx tsx scripts/ingest-knowledge/ingest.ts`
- or add your preferred runner and run the script through npm.

Example:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=... \
OPENAI_API_KEY=... \
INGEST_SOURCE=./data/book/cycling-training.md \
INGEST_SOURCE_LABEL="Cycling Training Book" \
INGEST_CATEGORY=general_training \
npx tsx scripts/ingest-knowledge/ingest.ts
```

## Verify data

You can quickly verify in SQL:

```sql
select count(*) from public.knowledge_chunks;

select id, source, category, left(content, 120) as preview
from public.knowledge_chunks
order by id desc
limit 10;
```

## Notes on chunking strategy

- Start simple (heading + paragraph windows), then refine.
- Target chunks that are self-contained and answerable.
- Use overlap to preserve continuity between adjacent chunks.
- Prefer semantic boundaries over strict fixed-length chunks.

## Typical tuning pass

After first ingestion:

1. Ask 10-20 realistic coach questions.
2. Log generated retrieval queries and returned chunks.
3. Identify misses and over-retrieval.
4. Adjust chunk size, overlap, and source cleanup.
5. Re-ingest.
