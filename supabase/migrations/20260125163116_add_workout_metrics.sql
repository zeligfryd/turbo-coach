-- Add workout metrics columns and auto-calculation functions
-- This migration adds FTP-independent metrics (duration, avg intensity) that are auto-calculated
-- from the intervals JSONB column using PostgreSQL functions and triggers

-- Add new columns to workouts table
ALTER TABLE public.workouts 
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
ADD COLUMN IF NOT EXISTS avg_intensity_percent INTEGER;

-- Function to calculate total duration from BuilderItems JSONB
-- Handles both single intervals and repeat groups
CREATE OR REPLACE FUNCTION calculate_workout_duration(intervals jsonb)
RETURNS INTEGER AS $$
DECLARE
  total_duration INTEGER := 0;
  item jsonb;
  repeat_count INTEGER;
  repeat_interval jsonb;
BEGIN
  -- Loop through each BuilderItem
  FOR item IN SELECT * FROM jsonb_array_elements(intervals)
  LOOP
    IF item->>'type' = 'interval' THEN
      -- Single interval: add its duration
      total_duration := total_duration + (item->'data'->>'durationSeconds')::INTEGER;
    ELSIF item->>'type' = 'repeat' THEN
      -- Repeat group: multiply interval durations by repeat count
      repeat_count := (item->'data'->>'count')::INTEGER;
      FOR repeat_interval IN SELECT * FROM jsonb_array_elements(item->'data'->'intervals')
      LOOP
        total_duration := total_duration + 
          ((repeat_interval->>'durationSeconds')::INTEGER * repeat_count);
      END LOOP;
    END IF;
  END LOOP;
  
  RETURN total_duration;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate weighted average intensity
-- Handles constant intervals, ramps, and free rides (default to 50%)
CREATE OR REPLACE FUNCTION calculate_workout_avg_intensity(intervals jsonb)
RETURNS INTEGER AS $$
DECLARE
  weighted_sum NUMERIC := 0;
  total_duration NUMERIC := 0;
  item jsonb;
  repeat_count INTEGER;
  repeat_interval jsonb;
  intensity_start NUMERIC;
  intensity_end NUMERIC;
  avg_intensity NUMERIC;
  duration INTEGER;
BEGIN
  -- Loop through each BuilderItem
  FOR item IN SELECT * FROM jsonb_array_elements(intervals)
  LOOP
    IF item->>'type' = 'interval' THEN
      -- Single interval
      intensity_start := COALESCE((item->'data'->>'intensityPercentStart')::NUMERIC, 50);
      intensity_end := COALESCE((item->'data'->>'intensityPercentEnd')::NUMERIC, intensity_start);
      avg_intensity := (intensity_start + intensity_end) / 2;
      duration := (item->'data'->>'durationSeconds')::INTEGER;
      
      weighted_sum := weighted_sum + (avg_intensity * duration);
      total_duration := total_duration + duration;
      
    ELSIF item->>'type' = 'repeat' THEN
      -- Repeat group
      repeat_count := (item->'data'->>'count')::INTEGER;
      FOR repeat_interval IN SELECT * FROM jsonb_array_elements(item->'data'->'intervals')
      LOOP
        intensity_start := COALESCE((repeat_interval->>'intensityPercentStart')::NUMERIC, 50);
        intensity_end := COALESCE((repeat_interval->>'intensityPercentEnd')::NUMERIC, intensity_start);
        avg_intensity := (intensity_start + intensity_end) / 2;
        duration := (repeat_interval->>'durationSeconds')::INTEGER * repeat_count;
        
        weighted_sum := weighted_sum + (avg_intensity * duration);
        total_duration := total_duration + duration;
      END LOOP;
    END IF;
  END LOOP;
  
  IF total_duration > 0 THEN
    RETURN ROUND(weighted_sum / total_duration);
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill existing workouts with calculated values
UPDATE public.workouts
SET 
  duration_seconds = calculate_workout_duration(intervals),
  avg_intensity_percent = calculate_workout_avg_intensity(intervals)
WHERE duration_seconds IS NULL OR avg_intensity_percent IS NULL;

-- Create trigger function to auto-calculate on insert/update
CREATE OR REPLACE FUNCTION update_workout_metrics()
RETURNS TRIGGER AS $$
BEGIN
  NEW.duration_seconds := calculate_workout_duration(NEW.intervals);
  NEW.avg_intensity_percent := calculate_workout_avg_intensity(NEW.intervals);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires before insert or update
CREATE TRIGGER workout_metrics_trigger
  BEFORE INSERT OR UPDATE OF intervals
  ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION update_workout_metrics();

-- Create indexes for efficient filtering and sorting
CREATE INDEX IF NOT EXISTS workouts_duration_idx 
  ON public.workouts(duration_seconds);
CREATE INDEX IF NOT EXISTS workouts_avg_intensity_idx 
  ON public.workouts(avg_intensity_percent);

-- Add documentation
COMMENT ON COLUMN public.workouts.duration_seconds IS 
  'Total workout duration in seconds (auto-calculated from intervals, flattens repeat groups)';
COMMENT ON COLUMN public.workouts.avg_intensity_percent IS 
  'Weighted average intensity as percentage of FTP (auto-calculated from intervals)';
