-- Create workout_protocols table for structured workout templates
CREATE TABLE workout_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  protocol_type TEXT NOT NULL,
  
  -- Base structure definition (JSONB)
  structure JSONB NOT NULL,
  
  -- Customizable parameters (JSONB array)
  parameters JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  intensity_level INTEGER CHECK (intensity_level >= 1 AND intensity_level <= 10),
  tags TEXT[] DEFAULT '{}',
  
  is_preset BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Create indexes for common queries
CREATE INDEX idx_workout_protocols_category ON workout_protocols(category);
CREATE INDEX idx_workout_protocols_intensity ON workout_protocols(intensity_level);
CREATE INDEX idx_workout_protocols_tags ON workout_protocols USING GIN(tags);
-- Enable RLS
ALTER TABLE workout_protocols ENABLE ROW LEVEL SECURITY;
-- Allow all users to read preset protocols
CREATE POLICY "Allow read access to preset protocols"
  ON workout_protocols
  FOR SELECT
  TO authenticated
  USING (is_preset = true);
-- Seed initial protocols
-- VO2 MAX PROTOCOLS
-- 30/30 Billat Intervals
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '30/30 Billat VO2 Max',
  'Classic high-intensity intervals alternating 30 seconds hard with 30 seconds recovery. Designed to maximize VO2 max development.',
  'vo2max',
  'billat_30_30',
  '{
    "warmup": {"duration_seconds": 600, "type": "ramp", "start": 50, "end": 75},
    "main_work": {
      "type": "repeating_intervals",
      "pattern": [
        {"duration_seconds": 30, "intensity_percent": 120, "type": "work"},
        {"duration_seconds": 30, "intensity_percent": 50, "type": "rest"}
      ],
      "sets": "{{sets}}",
      "reps_per_set": "{{reps}}",
      "rest_between_sets": 300
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 60, "end": 40}
  }',
  '[
    {"id": "sets", "label": "Number of Sets", "type": "number", "default": 3, "min": 1, "max": 5, "step": 1},
    {"id": "reps", "label": "Reps per Set", "type": "number", "default": 10, "min": 5, "max": 15, "step": 1}
  ]',
  9,
  ARRAY['vo2max', 'intervals', 'high-intensity']
);
-- Tabata Intervals
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Tabata Intervals',
  'Ultra-high intensity protocol: 20 seconds all-out effort followed by 10 seconds rest. Classic 8-rep format (4 minutes total) with optional sets.',
  'vo2max',
  'tabata',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "repeating_intervals",
      "pattern": [
        {"duration_seconds": 20, "intensity_percent": 150, "type": "work"},
        {"duration_seconds": 10, "intensity_percent": 40, "type": "rest"}
      ],
      "sets": "{{sets}}",
      "reps_per_set": 8,
      "rest_between_sets": 300
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 60, "end": 40}
  }',
  '[
    {"id": "sets", "label": "Number of Sets", "type": "number", "default": 3, "min": 1, "max": 5, "step": 1}
  ]',
  10,
  ARRAY['vo2max', 'tabata', 'sprint', 'high-intensity']
);
-- Classic 5x5 VO2 Max
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Classic 5x5 VO2 Max',
  'Traditional VO2 max intervals with customizable work duration (typically 3-5 minutes) at high intensity.',
  'vo2max',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": "{{work_duration}}", "intensity_percent": 110},
      "rest": {"duration_seconds": "{{rest_duration}}", "intensity_percent": 50},
      "count": "{{count}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "count", "label": "Number of Intervals", "type": "number", "default": 5, "min": 3, "max": 8, "step": 1},
    {"id": "work_duration", "label": "Work Duration (seconds)", "type": "number", "default": 300, "min": 180, "max": 360, "step": 30},
    {"id": "rest_duration", "label": "Rest Duration (seconds)", "type": "number", "default": 300, "min": 120, "max": 420, "step": 30}
  ]',
  9,
  ARRAY['vo2max', 'intervals']
);
-- 4x4 Norwegian Intervals
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '4x4 Norwegian Intervals',
  'Research-backed protocol: 4 minutes at high intensity with 3 minutes active recovery. Proven for VO2 max gains.',
  'vo2max',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 600, "type": "ramp", "start": 50, "end": 75},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": 240, "intensity_percent": 110},
      "rest": {"duration_seconds": 180, "intensity_percent": 60},
      "count": 4
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[]',
  9,
  ARRAY['vo2max', 'intervals', 'norwegian']
);
-- THRESHOLD PROTOCOLS
-- 2x20 Threshold
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '2x20 Threshold',
  'Classic threshold workout: two 20-minute efforts near FTP. Gold standard for building sustainable power.',
  'threshold',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": "{{interval_duration}}", "intensity_percent": 95},
      "rest": {"duration_seconds": 600, "intensity_percent": 55},
      "count": "{{count}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "count", "label": "Number of Intervals", "type": "number", "default": 2, "min": 1, "max": 4, "step": 1},
    {"id": "interval_duration", "label": "Interval Duration (seconds)", "type": "number", "default": 1200, "min": 600, "max": 1800, "step": 60}
  ]',
  8,
  ARRAY['threshold', 'ftp', 'endurance']
);
-- 3x10 Threshold
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '3x10 Threshold',
  'Moderate-duration threshold intervals. Easier to complete than 2x20 while still building FTP.',
  'threshold',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": 600, "intensity_percent": 95},
      "rest": {"duration_seconds": 300, "intensity_percent": 55},
      "count": "{{count}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "count", "label": "Number of Intervals", "type": "number", "default": 3, "min": 2, "max": 5, "step": 1}
  ]',
  8,
  ARRAY['threshold', 'ftp']
);
-- Over-Under Intervals
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Over-Under Intervals',
  'Surge training: alternate between slightly below and above threshold. Teaches metabolic control and race pacing.',
  'threshold',
  'over_under',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "over_under",
      "pattern": [
        {"duration_seconds": 120, "intensity_percent": 95, "type": "under"},
        {"duration_seconds": 60, "intensity_percent": 105, "type": "over"}
      ],
      "sets": "{{sets}}",
      "reps_per_set": "{{reps}}",
      "rest_between_sets": 300
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "sets", "label": "Number of Sets", "type": "number", "default": 3, "min": 2, "max": 5, "step": 1},
    {"id": "reps", "label": "Reps per Set (over-under cycles)", "type": "number", "default": 3, "min": 2, "max": 6, "step": 1}
  ]',
  8,
  ARRAY['threshold', 'over-under', 'race-specific']
);
-- SWEET SPOT PROTOCOLS
-- 2x20 Sweet Spot
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '2x20 Sweet Spot',
  'Long steady efforts in the "sweet spot" zone (88-94% FTP). High training benefit with manageable recovery cost.',
  'sweet_spot',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 75},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": "{{interval_duration}}", "intensity_percent": 90},
      "rest": {"duration_seconds": 600, "intensity_percent": 55},
      "count": "{{count}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "count", "label": "Number of Intervals", "type": "number", "default": 2, "min": 1, "max": 4, "step": 1},
    {"id": "interval_duration", "label": "Interval Duration (seconds)", "type": "number", "default": 1200, "min": 900, "max": 1800, "step": 60}
  ]',
  7,
  ARRAY['sweet-spot', 'endurance']
);
-- 3x15 Sweet Spot
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '3x15 Sweet Spot',
  'Medium-length sweet spot intervals. Perfect for mid-week training sessions.',
  'sweet_spot',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 75},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": 900, "intensity_percent": 90},
      "rest": {"duration_seconds": 420, "intensity_percent": 55},
      "count": "{{count}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "count", "label": "Number of Intervals", "type": "number", "default": 3, "min": 2, "max": 5, "step": 1}
  ]',
  7,
  ARRAY['sweet-spot', 'endurance']
);
-- TEMPO PROTOCOLS
-- 3x15 Tempo
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '3x15 Tempo',
  '3x 15 minutes in the tempo zone with 5 minutes of recovery in between. Try to keep the cadence around 90 rpm.',
  'tempo',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 75},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": 900, "intensity_percent": 78},
      "rest": {"duration_seconds": 300, "intensity_percent": 55},
      "count": "{{count}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "count", "label": "Number of Intervals", "type": "number", "default": 3, "min": 2, "max": 5, "step": 1}
  ]',
  6,
  ARRAY['tempo', 'intervals', 'aerobic']
);
-- Sweet Spot Tempo
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Sweet Spot Tempo',
  'One block of 40 minutes high in the tempo zone. Every 5 minutes the intensity changes slightly. This workout gives you the best of both worlds as both the fat and carb energy supplies are employed.',
  'sweet_spot',
  'steady_block',
  '{
    "warmup": {"duration_seconds": 600, "type": "ramp", "start": 50, "end": 75},
    "main_work": {
      "type": "steady_block",
      "duration_seconds": "{{duration}}",
      "intensity_percent": 85
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 75, "end": 40}
  }',
  '[
    {"id": "duration", "label": "Main Block Duration (seconds)", "type": "number", "default": 2400, "min": 1800, "max": 3600, "step": 300}
  ]',
  7,
  ARRAY['tempo', 'sweet-spot', 'aerobic']
);
-- 4x10 Tempo
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  '4x10 Tempo',
  '4x 10 minutes in the tempo zone with 5 minutes of recovery in between. Try to keep the cadence around 90 rpm.',
  'tempo',
  'steady_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 75},
    "main_work": {
      "type": "repeating_steady",
      "work": {"duration_seconds": 600, "intensity_percent": 78},
      "rest": {"duration_seconds": 300, "intensity_percent": 55},
      "count": "{{count}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "count", "label": "Number of Intervals", "type": "number", "default": 4, "min": 2, "max": 6, "step": 1}
  ]',
  6,
  ARRAY['tempo', 'intervals', 'aerobic']
);
-- ENDURANCE PROTOCOLS
-- Endurance Steady Ride
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Endurance Steady Ride',
  'Long, steady endurance effort. Foundation training for aerobic base building.',
  'endurance',
  'steady_block',
  '{
    "warmup": {"duration_seconds": 600, "type": "ramp", "start": 45, "end": 65},
    "main_work": {
      "type": "steady_block",
      "duration_seconds": "{{duration}}",
      "intensity_percent": 65
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 65, "end": 45}
  }',
  '[
    {"id": "duration", "label": "Endurance Duration (seconds)", "type": "number", "default": 3600, "min": 1800, "max": 7200, "step": 600}
  ]',
  4,
  ARRAY['endurance', 'aerobic', 'zone2']
);
-- ANAEROBIC / SPRINT PROTOCOLS
-- Sprint Intervals
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Sprint Intervals',
  'Short, maximal efforts for developing neuromuscular power and anaerobic capacity.',
  'anaerobic',
  'sprint_intervals',
  '{
    "warmup": {"duration_seconds": 1200, "type": "ramp", "start": 50, "end": 90},
    "main_work": {
      "type": "repeating_intervals",
      "pattern": [
        {"duration_seconds": "{{sprint_duration}}", "intensity_percent": 200, "type": "work"},
        {"duration_seconds": "{{rest_duration}}", "intensity_percent": 45, "type": "rest"}
      ],
      "sets": "{{sets}}",
      "reps_per_set": "{{reps}}",
      "rest_between_sets": 600
    },
    "cooldown": {"duration_seconds": 900, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "sets", "label": "Number of Sets", "type": "number", "default": 3, "min": 1, "max": 4, "step": 1},
    {"id": "reps", "label": "Sprints per Set", "type": "number", "default": 5, "min": 3, "max": 10, "step": 1},
    {"id": "sprint_duration", "label": "Sprint Duration (seconds)", "type": "number", "default": 30, "min": 10, "max": 60, "step": 5},
    {"id": "rest_duration", "label": "Rest Duration (seconds)", "type": "number", "default": 120, "min": 60, "max": 300, "step": 30}
  ]',
  10,
  ARRAY['anaerobic', 'sprint', 'power']
);
-- Pyramid Intervals
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Pyramid Intervals',
  'Progressive then regressive interval durations (e.g., 1-2-3-2-1 min). Builds mental toughness and varied energy system adaptation.',
  'anaerobic',
  'pyramid',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "pyramid",
      "steps": [
        {"duration_seconds": 60, "intensity_percent": 130},
        {"duration_seconds": 120, "intensity_percent": 125},
        {"duration_seconds": 180, "intensity_percent": 120},
        {"duration_seconds": 120, "intensity_percent": 125},
        {"duration_seconds": 60, "intensity_percent": 130}
      ],
      "rest_duration": 120,
      "sets": "{{sets}}"
    },
    "cooldown": {"duration_seconds": 600, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "sets", "label": "Number of Pyramid Sets", "type": "number", "default": 2, "min": 1, "max": 3, "step": 1}
  ]',
  9,
  ARRAY['anaerobic', 'pyramid', 'intervals']
);
-- RACE SIMULATION PROTOCOLS
-- Race Simulation
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Race Simulation',
  'Simulates race conditions with repeated attacks off a tempo base. Perfect for preparing for criteriums or aggressive group rides.',
  'race_simulation',
  'sprint_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "sprint_intervals",
      "pattern": [
        {"duration_seconds": 15, "intensity_percent": 140, "type": "work"},
        {"duration_seconds": 285, "intensity_percent": 78, "type": "rest"}
      ],
      "sets": 1,
      "reps_per_set": "{{attacks}}",
      "rest_between_sets": 0
    },
    "cooldown": {"duration_seconds": 900, "type": "ramp", "start": 75, "end": 40}
  }',
  '[
    {"id": "attacks", "label": "Number of Attacks", "type": "number", "default": 15, "min": 8, "max": 20, "step": 1}
  ]',
  9,
  ARRAY['race-simulation', 'attacks', 'criterium']
);
-- Full Race Simulation
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Full Race Simulation',
  'Extended race simulation with a long endurance base and mid-race attack sequence. Mimics the demands of a full road race.',
  'race_simulation',
  'sprint_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 70},
    "main_work": {
      "type": "sprint_intervals",
      "pattern": [
        {"duration_seconds": 20, "intensity_percent": 145, "type": "work"},
        {"duration_seconds": 280, "intensity_percent": 70, "type": "rest"}
      ],
      "sets": 1,
      "reps_per_set": "{{attacks}}",
      "rest_between_sets": 0
    },
    "cooldown": {"duration_seconds": 1800, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "attacks", "label": "Number of Attacks", "type": "number", "default": 12, "min": 6, "max": 18, "step": 1}
  ]',
  8,
  ARRAY['race-simulation', 'endurance', 'road-race']
);
-- CX-Specific Race Blocks
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'CX-Specific Race Blocks',
  'Cyclocross race simulation with repeated short, hard efforts mimicking race accelerations out of corners and technical sections.',
  'anaerobic',
  'sprint_intervals',
  '{
    "warmup": {"duration_seconds": 900, "type": "ramp", "start": 50, "end": 80},
    "main_work": {
      "type": "sprint_intervals",
      "pattern": [
        {"duration_seconds": 20, "intensity_percent": 140, "type": "work"},
        {"duration_seconds": 40, "intensity_percent": 80, "type": "rest"}
      ],
      "sets": "{{sets}}",
      "reps_per_set": 3,
      "rest_between_sets": 600
    },
    "cooldown": {"duration_seconds": 900, "type": "ramp", "start": 70, "end": 40}
  }',
  '[
    {"id": "sets", "label": "Number of Blocks", "type": "number", "default": 3, "min": 2, "max": 5, "step": 1}
  ]',
  9,
  ARRAY['cyclocross', 'race-simulation', 'cx']
);
-- RECOVERY PROTOCOL
-- Recovery Ride
INSERT INTO workout_protocols (name, description, category, protocol_type, structure, parameters, intensity_level, tags) VALUES (
  'Recovery Ride',
  'Easy spinning for active recovery. Keep intensity low to promote recovery while maintaining training consistency.',
  'recovery',
  'steady_block',
  '{
    "warmup": {"duration_seconds": 300, "type": "ramp", "start": 40, "end": 50},
    "main_work": {
      "type": "steady_block",
      "duration_seconds": "{{duration}}",
      "intensity_percent": 50
    },
    "cooldown": {"duration_seconds": 300, "type": "ramp", "start": 50, "end": 40}
  }',
  '[
    {"id": "duration", "label": "Recovery Duration (seconds)", "type": "number", "default": 1800, "min": 900, "max": 3600, "step": 300}
  ]',
  2,
  ARRAY['recovery', 'easy', 'zone1']
);
