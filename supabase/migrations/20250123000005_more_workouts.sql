-- Add 5 common workouts covering different training categories
-- Endurance, Tempo, Sweet Spot, VO2 Max, and Sprint

-- 1. Endurance: Easy Endurance (90 minutes)
INSERT INTO public.workouts (name, category, description, tags, intervals)
VALUES (
  'Easy Endurance',
  'endurance',
  'Easy endurance ride to build aerobic base and promote recovery.',
  ARRAY['endurance', 'z2', 'base-building'],
  '[
    {
      "name": "Warmup",
      "durationSeconds": 600,
      "intensityPercent": 55
    },
    {
      "name": "Endurance",
      "durationSeconds": 4200,
      "intensityPercent": 70
    },
    {
      "name": "Cooldown",
      "durationSeconds": 600,
      "intensityPercent": 55
    }
  ]'::jsonb
);

-- 2. Tempo: 3x10min Tempo (65 minutes)
INSERT INTO public.workouts (name, category, description, tags, intervals)
VALUES (
  '3x10min Tempo',
  'tempo',
  'Tempo intervals at 85% FTP to build aerobic power and endurance.',
  ARRAY['intervals', 'tempo', 'moderate'],
  '[
    {
      "name": "Warmup",
      "durationSeconds": 225,
      "intensityPercent": 50
    },
    {
      "name": "Warmup 2",
      "durationSeconds": 225,
      "intensityPercent": 56
    },
    {
      "name": "Warmup 3",
      "durationSeconds": 225,
      "intensityPercent": 63
    },
    {
      "name": "Warmup 4",
      "durationSeconds": 225,
      "intensityPercent": 70
    },
    {
      "name": "Work 1",
      "durationSeconds": 600,
      "intensityPercent": 85
    },
    {
      "name": "Recovery 1",
      "durationSeconds": 300,
      "intensityPercent": 60
    },
    {
      "name": "Work 2",
      "durationSeconds": 600,
      "intensityPercent": 85
    },
    {
      "name": "Recovery 2",
      "durationSeconds": 300,
      "intensityPercent": 60
    },
    {
      "name": "Work 3",
      "durationSeconds": 600,
      "intensityPercent": 85
    },
    {
      "name": "Cooldown",
      "durationSeconds": 200,
      "intensityPercent": 60
    },
    {
      "name": "Cooldown 2",
      "durationSeconds": 200,
      "intensityPercent": 55
    },
    {
      "name": "Cooldown 3",
      "durationSeconds": 200,
      "intensityPercent": 50
    }
  ]'::jsonb
);

-- 3. Sweet Spot: 2x10min Sweet Spot (55 minutes)
INSERT INTO public.workouts (name, category, description, tags, intervals)
VALUES (
  '2x10min Sweet Spot',
  'sweet_spot',
  'Sweet spot intervals at 90% FTP to build aerobic power and efficiency.',
  ARRAY['intervals', 'sweet-spot', 'moderate'],
  '[
    {
      "name": "Warmup",
      "durationSeconds": 225,
      "intensityPercent": 50
    },
    {
      "name": "Warmup 2",
      "durationSeconds": 225,
      "intensityPercent": 56
    },
    {
      "name": "Warmup 3",
      "durationSeconds": 225,
      "intensityPercent": 63
    },
    {
      "name": "Warmup 4",
      "durationSeconds": 225,
      "intensityPercent": 70
    },
    {
      "name": "Work 1",
      "durationSeconds": 600,
      "intensityPercent": 90
    },
    {
      "name": "Recovery 1",
      "durationSeconds": 300,
      "intensityPercent": 55
    },
    {
      "name": "Work 2",
      "durationSeconds": 600,
      "intensityPercent": 90
    },
    {
      "name": "Cooldown",
      "durationSeconds": 300,
      "intensityPercent": 55
    },
    {
      "name": "Cooldown 2",
      "durationSeconds": 300,
      "intensityPercent": 52
    },
    {
      "name": "Cooldown 3",
      "durationSeconds": 300,
      "intensityPercent": 50
    }
  ]'::jsonb
);

-- 4. VO2 Max: 5x3min VO2 Max (52 minutes)
INSERT INTO public.workouts (name, category, description, tags, intervals)
VALUES (
  '5x3min VO2 Max',
  'vo2max',
  'VO2 max intervals at 115% FTP to build aerobic power.',
  ARRAY['intervals', 'vo2max', 'high-intensity'],
  '[
    {
      "name": "Warmup",
      "durationSeconds": 225,
      "intensityPercent": 50
    },
    {
      "name": "Warmup 2",
      "durationSeconds": 225,
      "intensityPercent": 56
    },
    {
      "name": "Warmup 3",
      "durationSeconds": 225,
      "intensityPercent": 63
    },
    {
      "name": "Warmup 4",
      "durationSeconds": 225,
      "intensityPercent": 70
    },
    {
      "name": "Work 1",
      "durationSeconds": 180,
      "intensityPercent": 115
    },
    {
      "name": "Recovery 1",
      "durationSeconds": 180,
      "intensityPercent": 50
    },
    {
      "name": "Work 2",
      "durationSeconds": 180,
      "intensityPercent": 115
    },
    {
      "name": "Recovery 2",
      "durationSeconds": 180,
      "intensityPercent": 50
    },
    {
      "name": "Work 3",
      "durationSeconds": 180,
      "intensityPercent": 115
    },
    {
      "name": "Recovery 3",
      "durationSeconds": 180,
      "intensityPercent": 50
    },
    {
      "name": "Work 4",
      "durationSeconds": 180,
      "intensityPercent": 115
    },
    {
      "name": "Recovery 4",
      "durationSeconds": 180,
      "intensityPercent": 50
    },
    {
      "name": "Work 5",
      "durationSeconds": 180,
      "intensityPercent": 115
    },
    {
      "name": "Cooldown",
      "durationSeconds": 200,
      "intensityPercent": 55
    },
    {
      "name": "Cooldown 2",
      "durationSeconds": 200,
      "intensityPercent": 52
    },
    {
      "name": "Cooldown 3",
      "durationSeconds": 200,
      "intensityPercent": 50
    }
  ]'::jsonb
);

-- 5. Sprint: Sprint Intervals 10x30s (58 minutes)
INSERT INTO public.workouts (name, category, description, tags, intervals)
VALUES (
  'Sprint Intervals 10x30s',
  'sprint',
  'Sprint intervals at 150% FTP to build neuromuscular power.',
  ARRAY['intervals', 'sprint', 'very-high-intensity'],
  '[
    {
      "name": "Warmup",
      "durationSeconds": 300,
      "intensityPercent": 50
    },
    {
      "name": "Warmup 2",
      "durationSeconds": 300,
      "intensityPercent": 56
    },
    {
      "name": "Warmup 3",
      "durationSeconds": 300,
      "intensityPercent": 63
    },
    {
      "name": "Warmup 4",
      "durationSeconds": 300,
      "intensityPercent": 70
    },
    {
      "name": "Work 1",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 1",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 2",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 2",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 3",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 3",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 4",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 4",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 5",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 5",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 6",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 6",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 7",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 7",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 8",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 8",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 9",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Recovery 9",
      "durationSeconds": 150,
      "intensityPercent": 55
    },
    {
      "name": "Work 10",
      "durationSeconds": 30,
      "intensityPercent": 150
    },
    {
      "name": "Cooldown",
      "durationSeconds": 200,
      "intensityPercent": 55
    },
    {
      "name": "Cooldown 2",
      "durationSeconds": 200,
      "intensityPercent": 52
    },
    {
      "name": "Cooldown 3",
      "durationSeconds": 200,
      "intensityPercent": 50
    }
  ]'::jsonb
);
