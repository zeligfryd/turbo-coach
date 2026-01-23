-- Insert one example workout to test the system
insert into public.workouts (name, category, description, tags, intervals)
values (
  'Easy Recovery Spin',
  'recovery',
  'Very easy recovery spin to promote active recovery and blood flow.',
  array['recovery', 'easy', 'short'],
  '[
    {
      "name": "Recovery Spin",
      "durationSeconds": 1800,
      "intensityPercent": 50
    }
  ]'::jsonb
);
