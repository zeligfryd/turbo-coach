-- Migration: Transform interval schema to support ramps
-- This migration updates all existing workout intervals to use the new schema format:
--   Old format: { "intensityPercent": 80 }
--   New format: { "intensityPercentStart": 80 }
--
-- The new schema supports two types of intervals:
-- 1. Constant power intervals: only intensityPercentStart is set
--    Example: { "name": "Steady", "durationSeconds": 300, "intensityPercentStart": 80 }
--
-- 2. Ramp intervals: both intensityPercentStart and intensityPercentEnd are set
--    Example: { "name": "Warmup", "durationSeconds": 600, "intensityPercentStart": 50, "intensityPercentEnd": 75 }

-- Update all workout intervals to use the new field name
UPDATE public.workouts
SET intervals = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', interval_item->>'name',
      'durationSeconds', (interval_item->>'durationSeconds')::int,
      'intensityPercentStart', (interval_item->>'intensityPercent')::numeric
    )
  )
  FROM jsonb_array_elements(intervals) AS interval_item
)
WHERE intervals IS NOT NULL;
