-- Phase 5 — Batch 2: Tempo & Sweet Spot archetype workouts.
--
-- 11 workouts covering tempo_continuous, sweetspot_blocks,
-- sweetspot_over_unders — 3-4 variants per archetype covering the
-- archetype's duration bracket.
--
-- Format: intervals JSONB uses BuilderItem schema:
--   { type: 'interval', data: { name?, durationSeconds, intensityPercentStart, intensityPercentEnd?, cadenceRpmMin?, cadenceRpmMax? } }
--   { type: 'repeat',   data: { count, intervals: WorkoutInterval[] } }
-- duration_seconds and avg_intensity_percent are auto-filled by the
-- workout_metrics_trigger. time_in_zone_seconds is set explicitly —
-- total seconds in the archetype's target work intensity bracket (work
-- intervals only, not warmup/cooldown/recovery).

-- ── Tempo — Continuous ─────────────────────────────────────────────
-- Target intensity 76–90% FTP; sessions built around one or two long
-- blocks. TIZ = seconds in the tempo work.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Tempo — 1×30 min (50 min)',
  'tempo',
  'One continuous 30-minute tempo block at ~82% FTP. Cadence 90–95 rpm, steady breathing. The entry-point tempo session.',
  array['tempo', 'muscular-endurance', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"interval","data":{"name":"Tempo","durationSeconds":1800,"intensityPercentStart":82,"cadenceRpmMin":90,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'tempo_continuous', 1800
),
(
  'Tempo — 2×20 min (70 min)',
  'tempo',
  '2× 20 min at ~82% FTP with 5 min recovery. Cadence 90–95 rpm. Accumulates 40 min of tempo in a standard weekday slot.',
  array['tempo', 'muscular-endurance'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Tempo","durationSeconds":1200,"intensityPercentStart":82,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'tempo_continuous', 2400
),
(
  'Tempo — 3×15 min (80 min)',
  'tempo',
  '3× 15 min at ~85% FTP with 5 min recovery. Cadence 90–95 rpm. Slightly higher target than 2×20 with shorter reps — stay disciplined on the recoveries.',
  array['tempo', 'muscular-endurance'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Tempo","durationSeconds":900,"intensityPercentStart":85,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'tempo_continuous', 2700
),
(
  'Tempo — 2×25 min (80 min)',
  'tempo',
  '2× 25 min at ~80% FTP with 5 min recovery. Cadence 90–95 rpm. Longer reps at slightly lower intensity — builds muscular endurance at the low end of the tempo band.',
  array['tempo', 'muscular-endurance', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":75}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Tempo","durationSeconds":1500,"intensityPercentStart":80,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'tempo_continuous', 3000
);

-- ── Sweet Spot — Blocks ────────────────────────────────────────────
-- Target 88–94% FTP; discrete blocks with manageable recoveries.
-- TIZ = seconds in the sweet spot work.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Sweet Spot — 2×15 min (65 min)',
  'sweet_spot',
  '2× 15 min at ~90% FTP with 5 min recovery. Cadence 90–95 rpm. Entry-level sweet spot session — good for reintroducing high-aerobic work.',
  array['sweet-spot', 'ftp-development', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Sweet spot","durationSeconds":900,"intensityPercentStart":90,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":780,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'sweetspot_blocks', 1800
),
(
  'Sweet Spot — 2×20 min (75 min)',
  'sweet_spot',
  'Classic 2× 20 min at ~90% FTP with 5 min recovery. Cadence 90–95 rpm. The staple sweet spot session — high training stimulus per unit fatigue.',
  array['sweet-spot', 'ftp-development'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Sweet spot","durationSeconds":1200,"intensityPercentStart":90,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":780,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'sweetspot_blocks', 2400
),
(
  'Sweet Spot — 3×15 min (80 min)',
  'sweet_spot',
  '3× 15 min at ~92% FTP with 5 min recovery. Cadence 90–95 rpm. Pushes the upper end of sweet spot — more time near threshold than 2×20.',
  array['sweet-spot', 'ftp-development'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Sweet spot","durationSeconds":900,"intensityPercentStart":92,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'sweetspot_blocks', 2700
),
(
  'Sweet Spot — 2×30 min (103 min)',
  'sweet_spot',
  '2× 30 min at ~88% FTP with 8 min recovery. Cadence 90–95 rpm. Long-block sweet spot for advanced base — substantial muscular endurance stimulus.',
  array['sweet-spot', 'ftp-development', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Sweet spot","durationSeconds":1800,"intensityPercentStart":88,"cadenceRpmMin":90,"cadenceRpmMax":95},
      {"name":"Recovery","durationSeconds":480,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":720,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'sweetspot_blocks', 3600
);

-- ── Sweet Spot — Over/Unders ───────────────────────────────────────
-- Alternating 88% (under) and 100% (over) inside continuous blocks.
-- TIZ = total seconds across the over/under work (under + over), since
-- the entire block sits within 88–100% FTP.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Sweet Spot Over/Unders — 2×15 min (60 min)',
  'sweet_spot',
  '2× 15 min alternating 2 min @88% / 1 min @100% FTP, 5 min recovery between blocks. Trains lactate clearance at the upper end of sweet spot.',
  array['sweet-spot', 'over-unders', 'lactate-clearance'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'sweetspot_over_unders', 1800
),
(
  'Sweet Spot Over/Unders — 3×12 min (71 min)',
  'sweet_spot',
  '3× 12 min alternating 2 min @88% / 1 min @100% FTP, 5 min recovery. Higher total TIZ than the 2×15 version — intermediate progression.',
  array['sweet-spot', 'over-unders', 'lactate-clearance'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":3,"intervals":[
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":120,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":60,"intensityPercentStart":100},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'sweetspot_over_unders', 2160
),
(
  'Sweet Spot Over/Unders — 2×20 min (82 min)',
  'sweet_spot',
  '2× 20 min alternating 3 min @88% / 2 min @100% FTP, 8 min recovery. Longer over/under blocks — substantial lactate-clearance stimulus, bridges to threshold work.',
  array['sweet-spot', 'over-unders', 'lactate-clearance', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":80}},
    {"type":"repeat","data":{"count":2,"intervals":[
      {"name":"Under","durationSeconds":180,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":180,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":180,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":100},
      {"name":"Under","durationSeconds":180,"intensityPercentStart":88},
      {"name":"Over","durationSeconds":120,"intensityPercentStart":100},
      {"name":"Recovery","durationSeconds":480,"intensityPercentStart":55}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":660,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'sweetspot_over_unders', 2400
);
