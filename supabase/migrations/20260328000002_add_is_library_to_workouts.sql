alter table public.workouts
  add column if not exists is_library boolean not null default true;

-- Coach-scheduled workouts (not presets, created after this migration)
-- will be inserted with is_library = false.
-- Existing user-created workouts keep is_library = true.
