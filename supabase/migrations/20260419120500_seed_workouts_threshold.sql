-- Phase 5 — Batch 3: Threshold archetype workouts.
--
-- 11 workouts covering threshold_long_reps, threshold_short_reps,
-- threshold_over_unders. 3-4 variants per archetype across each
-- archetype's duration bracket.
--
-- duration_seconds / avg_intensity_percent auto-filled by
-- workout_metrics_trigger. time_in_zone_seconds is set explicitly and
-- counts seconds in the archetype's target work bracket only (work
-- intervals, not warmup/cooldown/rest).

-- ── Threshold — Long Reps ──────────────────────────────────────────
-- 95–105% FTP work segments (typically 2-3 reps of 15-20 min).

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Threshold — 2×15 min (65 min)',
  'threshold',
  '2× 15 min at 100% FTP with 5 min recovery. Cadence 90–100 rpm. Entry-level threshold session — good for reintroducing FTP work.',
  array['threshold', 'ftp', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Threshold","durationSeconds":900,"intensityPercentStart":100,"cadenceRpmMin":90,"cadenceRpmMax":100},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":720,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_long_reps', 1800
),
(
  'Threshold — 2×20 min (76 min)',
  'threshold',
  'Classic 2× 20 min at 100% FTP with 6 min recovery. Cadence 90–100 rpm. The canonical FTP-development session.',
  array['threshold', 'ftp'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Threshold","durationSeconds":1200,"intensityPercentStart":100,"cadenceRpmMin":90,"cadenceRpmMax":100},
      {"name":"Recovery","durationSeconds":360,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":660,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_long_reps', 2400
),
(
  'Threshold — 3×15 min (86 min)',
  'threshold',
  '3× 15 min at 100% FTP with 6 min recovery. Cadence 90–100 rpm. Higher total TIZ than 2×20 — substantial FTP-development stimulus.',
  array['threshold', 'ftp', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Threshold","durationSeconds":900,"intensityPercentStart":100,"cadenceRpmMin":90,"cadenceRpmMax":100},
      {"name":"Recovery","durationSeconds":360,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_long_reps', 2700
),
(
  'Threshold — 2×25 min (86 min)',
  'threshold',
  '2× 25 min at 98% FTP with 7 min recovery. Cadence 90–100 rpm. Longer-rep threshold — high muscular and metabolic load.',
  array['threshold', 'ftp', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Threshold","durationSeconds":1500,"intensityPercentStart":98,"cadenceRpmMin":90,"cadenceRpmMax":100},
      {"name":"Recovery","durationSeconds":420,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":540,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_long_reps', 3000
);

-- ── Threshold — Short Reps ─────────────────────────────────────────
-- 100–105% FTP in shorter reps (6–10 min). Higher target than long reps
-- because each effort is more manageable.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Threshold Short — 4×6 min (60 min)',
  'threshold',
  '4× 6 min at 105% FTP with 3 min recovery. Cadence 90–100 rpm. Short, high-intensity threshold reps — works the top end of FTP.',
  array['threshold', 'ftp', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":4,"intervals":[
      {"name":"Threshold","durationSeconds":360,"intensityPercentStart":105,"cadenceRpmMin":90,"cadenceRpmMax":100},
      {"name":"Recovery","durationSeconds":180,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":720,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_short_reps', 1440
),
(
  'Threshold Short — 5×8 min (75 min)',
  'threshold',
  '5× 8 min at 103% FTP with 3 min recovery. Cadence 90–100 rpm. Mid-length short-rep threshold — substantial TIZ with tight recoveries.',
  array['threshold', 'ftp'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":5,"intervals":[
      {"name":"Threshold","durationSeconds":480,"intensityPercentStart":103,"cadenceRpmMin":90,"cadenceRpmMax":100},
      {"name":"Recovery","durationSeconds":180,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_short_reps', 2400
),
(
  'Threshold Short — 4×10 min (79 min)',
  'threshold',
  '4× 10 min at 102% FTP with 4 min recovery. Cadence 90–100 rpm. Upper end of short-rep threshold — substantial volume near FTP.',
  array['threshold', 'ftp', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":4,"intervals":[
      {"name":"Threshold","durationSeconds":600,"intensityPercentStart":102,"cadenceRpmMin":90,"cadenceRpmMax":100},
      {"name":"Recovery","durationSeconds":240,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_short_reps', 2400
);

-- ── Threshold — Over/Unders ────────────────────────────────────────
-- Alternating 95% (under) and 105% (over) FTP in continuous blocks.
-- Develops lactate clearance under repeated threshold-range loading.
-- TIZ = total seconds in the over/under work (under + over).

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Threshold Over/Unders — 2×15 min (60 min)',
  'threshold',
  '2× 15 min alternating 2 min @95% / 1 min @105% FTP, 5 min recovery between blocks. Race-specific — handles the surges of a fast group or crit.',
  array['threshold', 'over-unders', 'lactate-clearance'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":420,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_over_unders', 1800
),
(
  'Threshold Over/Unders — 3×12 min (72 min)',
  'threshold',
  '3× 12 min alternating 2 min @95% / 1 min @105% FTP, 5 min recovery. More total TIZ than the 2×15 version — progression from entry-level over/unders.',
  array['threshold', 'over-unders', 'lactate-clearance'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":105},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_over_unders', 2160
),
(
  'Threshold Over/Unders — 2×20 min (82 min)',
  'threshold',
  '2× 20 min alternating 3 min @95% / 2 min @105% FTP, 8 min recovery. Long over/under blocks — heavy lactate-clearance stimulus.',
  array['threshold', 'over-unders', 'lactate-clearance', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Under","durationSeconds":180,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":180,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":180,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":105},
      {"name":"Under","durationSeconds":180,"intensityPercentStart":95},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":105},
      {"name":"Recovery","durationSeconds":480,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":660,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'threshold_over_unders', 2400
);
