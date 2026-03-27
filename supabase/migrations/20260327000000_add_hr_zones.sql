-- Add heart rate fields to users table for HR zone-based pacing
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS max_hr integer,
  ADD COLUMN IF NOT EXISTS lthr integer;

COMMENT ON COLUMN public.users.max_hr IS 'Maximum heart rate (bpm)';
COMMENT ON COLUMN public.users.lthr IS 'Lactate threshold heart rate (bpm)';
