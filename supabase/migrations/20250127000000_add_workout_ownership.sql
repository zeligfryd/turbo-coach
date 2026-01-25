-- Add user ownership and visibility columns to workouts table

-- Add new columns
ALTER TABLE public.workouts
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN is_public boolean DEFAULT false NOT NULL,
  ADD COLUMN is_preset boolean DEFAULT false NOT NULL;

-- Update existing workouts to be presets (backward compatibility)
UPDATE public.workouts
SET is_preset = true, is_public = true
WHERE user_id IS NULL;

-- Create indexes for performance
CREATE INDEX workouts_user_id_idx ON public.workouts(user_id);
CREATE INDEX workouts_is_preset_idx ON public.workouts(is_preset);
CREATE INDEX workouts_is_public_idx ON public.workouts(is_public);

-- Drop existing RLS policy
DROP POLICY IF EXISTS "Allow public read access to workouts" ON public.workouts;

-- Create new RLS policies

-- Allow users to read: presets OR public workouts OR their own workouts
CREATE POLICY "Allow read access to workouts"
  ON public.workouts
  FOR SELECT
  TO authenticated
  USING (
    is_preset = true
    OR is_public = true
    OR user_id = auth.uid()
  );

-- Allow users to insert their own workouts only
CREATE POLICY "Allow users to create their own workouts"
  ON public.workouts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_preset = false
  );

-- Allow users to update their own non-preset workouts only
CREATE POLICY "Allow users to update their own workouts"
  ON public.workouts
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND is_preset = false
  )
  WITH CHECK (
    user_id = auth.uid()
    AND is_preset = false
  );

-- Allow users to delete their own non-preset workouts only
CREATE POLICY "Allow users to delete their own workouts"
  ON public.workouts
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND is_preset = false
  );
