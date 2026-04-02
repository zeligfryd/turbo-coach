-- Track when the readiness score was last computed so the UI can detect staleness.
alter table public.race_events add column readiness_computed_at timestamptz;
