-- Add a test workout with ramp intervals
-- This workout demonstrates the new ramp functionality where intervals can gradually
-- transition from one intensity to another

insert into public.workouts (name, category, description, tags, intervals)
values (
  'Recovery Ramp',
  'recovery',
  'Gentle recovery ride with gradual intensity changes. Perfect for active recovery days.',
  array['recovery'],
  '[
    {
      "name": "Ramp Up",
      "durationSeconds": 900,
      "intensityPercentStart": 40,
      "intensityPercentEnd": 60
    },
    {
      "name": "Ramp Down",
      "durationSeconds": 900,
      "intensityPercentStart": 60,
      "intensityPercentEnd": 40
    }
  ]'::jsonb
);
