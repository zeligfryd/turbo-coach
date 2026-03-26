-- Rename icu_activities -> activities (table holds activities from multiple sources)

-- 1. Rename the table
ALTER TABLE public.icu_activities RENAME TO activities;

-- 2. Rename indexes
ALTER INDEX icu_activities_user_date_idx RENAME TO activities_user_date_idx;
ALTER INDEX icu_activities_user_start_date_idx RENAME TO activities_user_start_date_idx;

-- 3. Rename constraints
ALTER TABLE public.activities RENAME CONSTRAINT icu_activities_pkey TO activities_pkey;
ALTER TABLE public.activities RENAME CONSTRAINT icu_activities_user_external_source_key TO activities_user_external_source_key;

-- 4. Recreate RLS policies with updated names
--    (policies cannot be renamed, so we drop and recreate)
DROP POLICY "Users can select own icu activities" ON public.activities;
DROP POLICY "Users can insert own icu activities" ON public.activities;
DROP POLICY "Users can update own icu activities" ON public.activities;
DROP POLICY "Users can delete own icu activities" ON public.activities;

CREATE POLICY "Users can select own activities"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activities"
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activities"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own activities"
  ON public.activities
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
