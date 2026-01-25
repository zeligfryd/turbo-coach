-- Migrate existing workouts to new structure
-- Wrap each interval in { type: "interval", data: {...} }
UPDATE public.workouts
SET intervals = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', 'interval',
      'data', interval
    )
  )
  FROM jsonb_array_elements(intervals) AS interval
)
WHERE jsonb_typeof(intervals) = 'array'
  AND intervals @> '[{}]'::jsonb  -- Has at least one element
  AND NOT (intervals->0 ? 'type'); -- Not already migrated

-- Add comment explaining the new structure
COMMENT ON COLUMN public.workouts.intervals IS 
'JSONB array of BuilderItems. Each item has a "type" field:
- type="interval": Single interval with "data" containing interval fields
- type="repeat": Repeat group with "data" containing {count: number, intervals: BuilderInterval[]}';
