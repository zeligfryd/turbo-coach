-- Phase 5 — Batch 5: Anaerobic, Neuromuscular, Test, Race, Opener.
--
-- Completes the archetype workout library. 14 workouts covering
-- anaerobic_capacity, anaerobic_repeats, neuromuscular_sprints,
-- ftp_test, race_simulation, and opener.
--
-- duration_seconds / avg_intensity_percent auto-filled by
-- workout_metrics_trigger. time_in_zone_seconds is set explicitly and
-- counts seconds at the archetype's target work intensity only.

-- ── Anaerobic Capacity ─────────────────────────────────────────────
-- 30s–2 min reps at 120–150% FTP. Develops glycolytic capacity.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Anaerobic Capacity — 8×1 min (48 min)',
  'anaerobic',
  '8× 1 min at 135% FTP with 2 min recovery. Cadence 100–110 rpm. Develops lactate tolerance and glycolytic capacity. Stop the set if avg drops below ~125%.',
  array['anaerobic', 'lactate-tolerance', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":8,"intervals":[
      {"name":"AC effort","durationSeconds":60,"intensityPercentStart":135,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Recovery","durationSeconds":120,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":540,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'anaerobic_capacity', 480
),
(
  'Anaerobic Capacity — 8×2 min (56 min)',
  'anaerobic',
  '8× 2 min at 125% FTP with 2 min recovery. Cadence 95–105 rpm. Longer anaerobic reps — heavy lactate load. Stop the set if avg drops below ~115%.',
  array['anaerobic', 'lactate-tolerance'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":8,"intervals":[
      {"name":"AC effort","durationSeconds":120,"intensityPercentStart":125,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Recovery","durationSeconds":120,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":540,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'anaerobic_capacity', 960
),
(
  'Anaerobic Descending — 6×2 + 6×1 (65 min)',
  'anaerobic',
  '6× 2 min at 125% then 6× 1 min at 135% FTP, 2 min recovery. Cadence 95–110 rpm. Allen/Coggan-style descending set — builds capacity then tops it with harder short reps.',
  array['anaerobic', 'lactate-tolerance', 'descending'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":6,"intervals":[
      {"name":"AC long","durationSeconds":120,"intensityPercentStart":125,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Recovery","durationSeconds":120,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Between-sets","durationSeconds":180,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":6,"intervals":[
      {"name":"AC short","durationSeconds":60,"intensityPercentStart":135,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Recovery","durationSeconds":120,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":300,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'anaerobic_capacity', 1080
);

-- ── Anaerobic Repeats ──────────────────────────────────────────────
-- 30–60s above 130% FTP. Race-specific surges, attacks, bridges.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Anaerobic Repeats — 10×30s (50 min)',
  'anaerobic',
  '10× 30s at 150% FTP with 2 min recovery. Cadence 100–115 rpm. Race-winning surges — simulates attacks and bridges.',
  array['anaerobic', 'race-specific', 'surges', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"Surge","durationSeconds":30,"intensityPercentStart":150,"cadenceRpmMin":100,"cadenceRpmMax":115},
      {"name":"Recovery","durationSeconds":120,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'anaerobic_repeats', 300
),
(
  'Anaerobic Repeats — 8×45s (50 min)',
  'anaerobic',
  '8× 45s at 140% FTP with 2:15 recovery. Cadence 100–110 rpm. Slightly longer race-surge reps — harder per effort than 30s.',
  array['anaerobic', 'race-specific', 'surges'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":8,"intervals":[
      {"name":"Surge","durationSeconds":45,"intensityPercentStart":140,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Recovery","durationSeconds":135,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":660,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'anaerobic_repeats', 360
),
(
  'Anaerobic Repeats — 10×1 min (55 min)',
  'anaerobic',
  '10× 1 min at 135% FTP with 2 min recovery. Cadence 100–110 rpm. Race-winning one-minute accelerations — stay strong through the last rep.',
  array['anaerobic', 'race-specific', 'surges', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"Surge","durationSeconds":60,"intensityPercentStart":135,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Recovery","durationSeconds":120,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'anaerobic_repeats', 600
);

-- ── Neuromuscular Sprints ──────────────────────────────────────────
-- 10–15s maximal sprints with full recovery. Peak power and rate of
-- force development. Heart rate irrelevant; full recovery essential.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Neuromuscular Sprints — 10×10s (52 min)',
  'anaerobic',
  '10× 10s maximal sprints with 3 min full recovery. Cadence 110+ rpm. Heart rate does not matter — the goal is peak power. Stop if power drops across reps.',
  array['sprints', 'neuromuscular', 'peak-power'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"Sprint","durationSeconds":10,"intensityPercentStart":200,"cadenceRpmMin":110,"cadenceRpmMax":130},
      {"name":"Full recovery","durationSeconds":180,"intensityPercentStart":45}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":330,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'neuromuscular_sprints', 100
),
(
  'Small/Big Ring Sprints — 6+6 (64 min)',
  'anaerobic',
  '6× 10s small-ring sprints (high cadence) then 6× 15s big-ring sprints (high force), 3 min full recovery. Allen/Coggan NP-W7 pattern — develops both cadence and force components of sprint power.',
  array['sprints', 'neuromuscular', 'peak-power'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":6,"intervals":[
      {"name":"Small ring sprint","durationSeconds":10,"intensityPercentStart":200,"cadenceRpmMin":115,"cadenceRpmMax":130},
      {"name":"Full recovery","durationSeconds":180,"intensityPercentStart":45}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":300,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":6,"intervals":[
      {"name":"Big ring sprint","durationSeconds":15,"intensityPercentStart":190,"cadenceRpmMin":95,"cadenceRpmMax":110},
      {"name":"Full recovery","durationSeconds":165,"intensityPercentStart":45}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":450,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'neuromuscular_sprints', 150
),
(
  'Sprint Ladder — 3×(8s+12s+15s) (58 min)',
  'anaerobic',
  '3 sets of (8s + 12s + 15s) max sprints, 3 min full recovery between sprints, 5 min between sets. Cadence >110 rpm. Full recovery is mandatory — fatigue ruins the stimulus.',
  array['sprints', 'neuromuscular', 'peak-power', 'ladder'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Sprint 8s","durationSeconds":8,"intensityPercentStart":220,"cadenceRpmMin":110,"cadenceRpmMax":130},
      {"name":"Recovery","durationSeconds":180,"intensityPercentStart":45},
      {"name":"Sprint 12s","durationSeconds":12,"intensityPercentStart":200,"cadenceRpmMin":110,"cadenceRpmMax":125},
      {"name":"Recovery","durationSeconds":180,"intensityPercentStart":45},
      {"name":"Sprint 15s","durationSeconds":15,"intensityPercentStart":180,"cadenceRpmMin":105,"cadenceRpmMax":120},
      {"name":"Set recovery","durationSeconds":300,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":495,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'neuromuscular_sprints', 105
);

-- ── FTP Test ───────────────────────────────────────────────────────
-- Field tests to recalibrate FTP. TIZ set to 0 — these are tests,
-- not training, and TIZ doesn't have a meaningful interpretation.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'FTP Test — 20 min protocol (75 min)',
  'race_simulation',
  'Coggan 20-min FTP protocol: warm-up, 5-min all-out opener, 10-min easy, 20-min maximum effort. FTP ≈ 20-min avg × 0.95. Pace the 20-min evenly; do not start too hard.',
  array['test', 'ftp', 'protocol'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"interval","data":{"name":"3× 1-min fast (opener)","durationSeconds":180,"intensityPercentStart":110,"cadenceRpmMin":100,"cadenceRpmMax":110}},
    {"type":"interval","data":{"name":"Easy spin","durationSeconds":300,"intensityPercentStart":55}},
    {"type":"interval","data":{"name":"5-min all-out","durationSeconds":300,"intensityPercentStart":130}},
    {"type":"interval","data":{"name":"Recovery","durationSeconds":600,"intensityPercentStart":50}},
    {"type":"interval","data":{"name":"20-min TT","durationSeconds":1200,"intensityPercentStart":105,"cadenceRpmMin":90,"cadenceRpmMax":100}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":1020,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'ftp_test', 0
),
(
  'FTP Test — Ramp test (60 min)',
  'race_simulation',
  'Ramp test: 5 min easy then step up power by 20W every minute until failure. FTP ≈ best 1-min × 0.75. Easier to self-administer than the 20-min protocol.',
  array['test', 'ftp', 'ramp'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":70}},
    {"type":"interval","data":{"name":"Ramp (step up to failure)","durationSeconds":1500,"intensityPercentStart":60,"intensityPercentEnd":150,"cadenceRpmMin":85,"cadenceRpmMax":100}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":1500,"intensityPercentStart":55,"intensityPercentEnd":40}}
  ]'::jsonb,
  true, true, true, 'ftp_test', 0
);

-- ── Race Simulation ────────────────────────────────────────────────
-- Varied-intensity race-like sessions. Use in final weeks of build.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Race Winning — 3×15 min SS + sprints (85 min)',
  'race_simulation',
  'Allen/Coggan-style race-winning session: 3× 15 min Sweet Spot bookended by 30s sprints, 5 min recovery. Mimics attacking out of and closing down a breakaway.',
  array['race-specific', 'sprints', 'sweet-spot'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Opening sprint","durationSeconds":30,"intensityPercentStart":160,"cadenceRpmMin":105,"cadenceRpmMax":120},
      {"name":"Sweet spot","durationSeconds":900,"intensityPercentStart":90,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Closing sprint","durationSeconds":30,"intensityPercentStart":160,"cadenceRpmMin":105,"cadenceRpmMax":120},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":540,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'race_simulation', 2700
),
(
  'Crit Sim — Z2 base + 10× 45s surges (60 min)',
  'race_simulation',
  '45 min Z2 base with 10× 45s surges at 140% FTP every 4 min. Simulates the repeated attacks of a criterium.',
  array['race-specific', 'crit', 'surges'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"Z2 base","durationSeconds":195,"intensityPercentStart":68},
      {"name":"Surge","durationSeconds":45,"intensityPercentStart":140,"cadenceRpmMin":100,"cadenceRpmMax":110}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'race_simulation', 450
),
(
  'Fondo Sim — 3hr mixed (180 min)',
  'race_simulation',
  '3-hour ride mixing Z2, Tempo, and 2× 10 min Sweet Spot climbs. Race-like pacing and fueling for gran fondo and gravel events.',
  array['race-specific', 'fondo', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":70}},
    {"type":"interval","data":{"name":"Z2 block 1","durationSeconds":2400,"intensityPercentStart":68}},
    {"type":"interval","data":{"name":"Sweet spot climb 1","durationSeconds":600,"intensityPercentStart":90,"cadenceRpmMin":85,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Z2 block 2","durationSeconds":2400,"intensityPercentStart":68}},
    {"type":"interval","data":{"name":"Tempo block","durationSeconds":1800,"intensityPercentStart":80,"cadenceRpmMin":90,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Z2 block 3","durationSeconds":1800,"intensityPercentStart":65}},
    {"type":"interval","data":{"name":"Sweet spot climb 2","durationSeconds":600,"intensityPercentStart":90,"cadenceRpmMin":85,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'race_simulation', 3000
);

-- ── Opener ─────────────────────────────────────────────────────────
-- Pre-race sharpening — wake up the legs without adding fatigue.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Opener — 45 min + 3×1 min race-pace',
  'race_simulation',
  '45 min with 3× 1 min at race intensity (~105% FTP), full recovery. Short, sharp stimulus to prime the legs the day before a race.',
  array['opener', 'pre-race', 'taper'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Race-pace","durationSeconds":60,"intensityPercentStart":105,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Full recovery","durationSeconds":180,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Easy spin","durationSeconds":900,"intensityPercentStart":55}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":55,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'opener', 180
),
(
  'Opener — 60 min + 3×30s VO2 + 2×15s sprint',
  'race_simulation',
  '60 min Z2 with 3× 30s at VO2max and 2× 15s sprints. Slightly longer opener with both aerobic and neuromuscular priming — good two days before a race.',
  array['opener', 'pre-race', 'taper'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"interval","data":{"name":"Z2","durationSeconds":1200,"intensityPercentStart":68}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"VO2 effort","durationSeconds":30,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Recovery","durationSeconds":150,"intensityPercentStart":55}
    ]}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Sprint","durationSeconds":15,"intensityPercentStart":180,"cadenceRpmMin":110,"cadenceRpmMax":125},
      {"name":"Full recovery","durationSeconds":180,"intensityPercentStart":45}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":750,"intensityPercentStart":55,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'opener', 120
);
