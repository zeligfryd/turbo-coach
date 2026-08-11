-- Make completion's unique indexes usable as ON CONFLICT targets.
--
-- create_multi_modality created these as partial indexes (`where ... is not null`).
-- Postgres will not infer a partial unique index as an ON CONFLICT target
-- unless the statement repeats its predicate, and PostgREST's upsert cannot
-- express one — so `recordBlockCompletion` failed outright with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification", meaning ticking a session off never worked at all.
--
-- The predicate was never needed. Postgres treats NULLs as distinct in a
-- unique index by default, so a plain unique index on a nullable column still
-- permits any number of rows with NULL there: rides (block_id null) and blocks
-- (scheduled_workout_id null) coexist exactly as before, and each id can still
-- only be completed once.

drop index if exists public.completion_block_idx;
drop index if exists public.completion_scheduled_idx;

create unique index completion_block_idx on public.completion(block_id);
create unique index completion_scheduled_idx on public.completion(scheduled_workout_id);
