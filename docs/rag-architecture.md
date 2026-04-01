# RAG Architecture

## Overview

The RAG (Retrieval-Augmented Generation) system enriches the coaching LLM with knowledge from cycling training books. It has two pipelines: an offline ingestion pipeline that preprocesses source material into searchable chunks, and a live query pipeline that retrieves relevant chunks at request time.

```
                        INGESTION (offline)
                        ==================

  +-----------------+     +----------------+     +------------------+
  | Markdown source |---->| Section split  |---->| Chunk by         |
  | (data/books/)   |     | (split on # )  |     | paragraph,       |
  +-----------------+     +----------------+     | max 1800 chars   |
                                                 +--------+---------+
                                                          |
                                                          v
                                                 +------------------+
                                                 | Embed each chunk |
                                                 | (OpenAI text-    |
                                                 |  embedding-3-    |
                                                 |  small, 1536d)   |
                                                 +--------+---------+
                                                          |
                                                          v
                                                 +------------------+
                                                 | Store in         |
                                                 | knowledge_chunks |
                                                 | (Supabase/       |
                                                 |  pgvector, HNSW) |
                                                 +------------------+


                        QUERY (live, per request)
                        =========================

  +---------------+     +------------------+     +------------------+
  | User message  |---->| Generate 1-3     |---->| Embed each query |
  | + athlete     |     | search queries   |     | (text-embedding- |
  |   context     |     | (LLM: qwen2.5   |     |  3-small, 1536d) |
  |   (FTP, wt,   |     |  or anthropic)   |     +--------+---------+
  |   workouts)   |     +------------------+              |
  +---------------+                                       v
                                                 +------------------+
                                                 | Vector search    |
                                                 | match_knowledge_ |
                                                 | chunks()         |
                                                 | cosine sim       |
                                                 | threshold: 0.45  |
                                                 | top 5 per query  |
                                                 +--------+---------+
                                                          |
                                                          v
                                                 +------------------+
                                                 | Deduplicate by   |
                                                 | chunk ID, keep   |
                                                 | highest sim,     |
                                                 | return top 8     |
                                                 +--------+---------+
                                                          |
                                                          v
  +---------------+     +------------------+     +------------------+
  | Coaching      |<----| System prompt +  |<----| Format chunks as |
  | response      |     | athlete context  |     | numbered refs    |
  | (streamed)    |     | + RAG chunks     |     | [1] Source: ...   |
  +---------------+     +------------------+     +------------------+
```

## Ingestion Pipeline

**Script:** `scripts/ingest-knowledge/ingest.ts`

**Steps:**
1. Read markdown source file
2. Split on `#` headings into sections
3. Split sections into chunks by paragraph (`\n\n`), max 1800 chars each
4. Embed each chunk with OpenAI `text-embedding-3-small` (1536 dimensions)
5. Batch insert into `knowledge_chunks` table (batches of 100)

**Configuration (env vars):**
| Variable | Default | Description |
|---|---|---|
| `INGEST_SOURCE` | `./data/book/source.md` | Path to markdown file |
| `INGEST_SOURCE_LABEL` | `"Cycling source"` | Source label stored with chunks |
| `INGEST_CATEGORY` | `null` | Optional category tag |
| `INGEST_MAX_CHARS_PER_CHUNK` | `1800` | Max characters per chunk |

**Current sources:**
- `data/books/training-bible.md` — *The Cyclist's Training Bible* (Friel)
- `data/books/power-meter.md` — *Training and Racing with a Power Meter* (Allen, Coggan & McGregor)

## Query Pipeline

**Entry point:** `lib/ai/rag.ts`

**Steps:**
1. **Query generation** (`generateSearchQueries`) — LLM generates 1-3 focused search queries from the user message + athlete context (FTP, weight, recent/upcoming workouts). Falls back to raw user message on failure.
2. **Embedding** — Each query embedded with OpenAI `text-embedding-3-small` (same model as ingestion).
3. **Vector search** — Supabase RPC `match_knowledge_chunks()` performs cosine similarity search per query. Returns top 5 results per query above similarity threshold 0.45.
4. **Deduplication** — Results deduplicated by chunk ID (keeping highest similarity score), sorted by similarity, limited to top 8 chunks.
5. **Prompt injection** — Chunks formatted as numbered references and injected into the coaching system prompt.

## Storage

**Table:** `public.knowledge_chunks`

| Column | Type | Description |
|---|---|---|
| `id` | bigint (auto) | Primary key |
| `content` | text | Chunk text |
| `source` | text | Source label (e.g. "Power Meter") |
| `category` | text | Optional category tag |
| `embedding` | vector(1536) | OpenAI embedding |
| `created_at` | timestamp | Insertion time |

**Index:** HNSW on `embedding` using cosine distance (`vector_cosine_ops`)

**RLS:** Authenticated users can read all chunks (no row-level filtering).
