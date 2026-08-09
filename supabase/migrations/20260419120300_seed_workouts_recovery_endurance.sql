-- Phase 5 — Batch 1: Recovery & Endurance archetype workouts.
--
-- 16 workouts covering recovery, endurance_z2, endurance_long,
-- endurance_with_surges, force_endurance — 3-4 duration variants per
-- archetype.
--
-- Format: intervals JSONB uses BuilderItem schema:
--   { type: 'interval', data: { name?, durationSeconds, intensityPercentStart, intensityPercentEnd?, cadenceRpmMin?, cadenceRpmMax? } }
--   { type: 'repeat',   data: { count, intervals: WorkoutInterval[] } }
-- The workout_metrics_trigger auto-fills duration_seconds and
-- avg_intensity_percent. time_in_zone_seconds is set explicitly per
-- workout (no trigger): seconds spent in the archetype's target work
-- intensity bracket — for surges/force this is the *interval* zone, not
-- the underlying base.
-- Cadence is set only where it is prescriptive (low-cadence force work,
-- spinning recoveries, standard Z2). Warmups, cooldowns, and surges are
-- left free.

-- ── Recovery ───────────────────────────────────────────────────────

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Recovery Spin — 30 min',
  'recovery',
  'Easy 30-minute recovery spin at ~50% FTP. Cadence 85–95 rpm, no force on the pedals. Use the day after a hard session to flush the legs.',
  array['recovery', 'easy', 'short'],
  '[
    {"type":"interval","data":{"name":"Recovery spin","durationSeconds":1800,"intensityPercentStart":50,"cadenceRpmMin":85,"cadenceRpmMax":95}}
  ]'::jsonb,
  true, true, true, 'recovery', 1800
),
(
  'Recovery Spin — 45 min',
  'recovery',
  'Easy 45-minute recovery spin at ~50% FTP. Cadence 85–95 rpm. Slightly longer than a 30-minute spin without adding training stress.',
  array['recovery', 'easy'],
  '[
    {"type":"interval","data":{"name":"Recovery spin","durationSeconds":2700,"intensityPercentStart":50,"cadenceRpmMin":85,"cadenceRpmMax":95}}
  ]'::jsonb,
  true, true, true, 'recovery', 2700
),
(
  'Recovery Spin — 60 min',
  'recovery',
  'Easy 60-minute recovery spin at ~50% FTP. Cadence 85–95 rpm, easier gear on any hill. Long-form recovery for after big efforts.',
  array['recovery', 'easy'],
  '[
    {"type":"interval","data":{"name":"Recovery spin","durationSeconds":3600,"intensityPercentStart":50,"cadenceRpmMin":85,"cadenceRpmMax":95}}
  ]'::jsonb,
  true, true, true, 'recovery', 3600
);

-- ── Endurance Z2 ───────────────────────────────────────────────────

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Endurance Z2 — 60 min',
  'endurance',
  'One hour of steady Z2 (~68% FTP). Conversational pace, cadence 85–95 rpm. The bread-and-butter session for aerobic base.',
  array['endurance', 'z2', 'aerobic'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":300,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"interval","data":{"name":"Endurance","durationSeconds":3000,"intensityPercentStart":68,"cadenceRpmMin":85,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":300,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_z2', 3000
),
(
  'Endurance Z2 — 90 min',
  'endurance',
  '90 minutes of steady Z2 (~68% FTP). Conversational pace, cadence 85–95 rpm. Steady aerobic block for base.',
  array['endurance', 'z2', 'aerobic'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":480,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"interval","data":{"name":"Endurance","durationSeconds":4500,"intensityPercentStart":68,"cadenceRpmMin":85,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":420,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_z2', 4500
),
(
  'Endurance Z2 — 120 min',
  'endurance',
  'Two hours of steady Z2 (~68% FTP). Cadence 85–95 rpm, occasional hill spikes ok but keep the pressure off.',
  array['endurance', 'z2', 'aerobic'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"interval","data":{"name":"Endurance","durationSeconds":6000,"intensityPercentStart":68,"cadenceRpmMin":85,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_z2', 6000
),
(
  'Endurance Z2 — 150 min',
  'endurance',
  '2.5 hours of steady Z2 (~68% FTP). Cadence 85–95 rpm. Pushes durability without crossing into tempo.',
  array['endurance', 'z2', 'aerobic'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"interval","data":{"name":"Endurance","durationSeconds":7800,"intensityPercentStart":68,"cadenceRpmMin":85,"cadenceRpmMax":95}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_z2', 7800
);

-- ── Endurance Long ─────────────────────────────────────────────────

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Long Ride — 3 hr',
  'endurance',
  'Three-hour long ride at ~65% FTP. The classic weekend long ride — builds durability and metabolic efficiency.',
  array['endurance', 'long', 'weekend', 'durability'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"interval","data":{"name":"Long endurance","durationSeconds":9600,"intensityPercentStart":65}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_long', 9600
),
(
  'Long Ride — 4 hr',
  'endurance',
  'Four-hour long ride at ~65% FTP. Pushes the upper end of weekly long-ride duration. Fueling and hydration matter.',
  array['endurance', 'long', 'weekend', 'durability'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"interval","data":{"name":"Long endurance","durationSeconds":13200,"intensityPercentStart":65}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_long', 13200
),
(
  'Long Ride — 5 hr',
  'endurance',
  'Five-hour long ride at ~65% FTP. Stage-race or fondo prep — practise eating on the bike and pacing the back half.',
  array['endurance', 'long', 'weekend', 'durability', 'fondo'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"interval","data":{"name":"Long endurance","durationSeconds":16800,"intensityPercentStart":65}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_long', 16800
);

-- ── Endurance with Surges ──────────────────────────────────────────
-- TIZ here = total seconds at the surge intensity (~115% FTP), not the
-- Z2 base. Matches the 5-15 min target on the archetype.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Z2 with Surges — 90 min',
  'endurance',
  'Z2 base with 8× 1-minute surges at ~115% FTP every 8 minutes. Adds race-specific neuromuscular work without compromising the aerobic ride.',
  array['endurance', 'z2', 'surges', 'race-specific'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"repeat","data":{"count":8,"intervals":[
      {"name":"Z2 base","durationSeconds":480,"intensityPercentStart":68},
      {"name":"Surge","durationSeconds":60,"intensityPercentStart":115}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_with_surges', 480
),
(
  'Z2 with Surges — 120 min',
  'endurance',
  'Z2 base with 10× 1-minute surges at ~115% FTP. Two-hour version of the standard surge ride.',
  array['endurance', 'z2', 'surges', 'race-specific'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"Z2 base","durationSeconds":540,"intensityPercentStart":68},
      {"name":"Surge","durationSeconds":60,"intensityPercentStart":115}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_with_surges', 600
),
(
  'Z2 with Surges — 150 min',
  'endurance',
  '2.5-hour Z2 base with 13× 1-minute surges at ~115% FTP. Extended version — good for fondo and road race prep.',
  array['endurance', 'z2', 'surges', 'race-specific', 'fondo'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":65}},
    {"type":"repeat","data":{"count":13,"intervals":[
      {"name":"Z2 base","durationSeconds":540,"intensityPercentStart":68},
      {"name":"Surge","durationSeconds":60,"intensityPercentStart":115}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'endurance_with_surges', 780
);

-- ── Force Endurance — Low Cadence ──────────────────────────────────
-- Cadence isn't representable in the schema — instructions live in the
-- description. TIZ = seconds in the high-force work segments only.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Force Endurance — 4×5 min Low Cadence (60 min)',
  'endurance',
  '4× 5 min at ~82% FTP in a big gear at 50–60 rpm. Builds muscular force production on the bike. Stay seated and tighten the core. Recovery at normal cadence.',
  array['endurance', 'force', 'low-cadence', 'strength'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":70}},
    {"type":"repeat","data":{"count":4,"intervals":[
      {"name":"Big gear @ 50-60 rpm","durationSeconds":300,"intensityPercentStart":82},
      {"name":"Easy spin","durationSeconds":180,"intensityPercentStart":60}
    ]}},
    {"type":"interval","data":{"name":"Endurance","durationSeconds":600,"intensityPercentStart":65}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'force_endurance', 1200
),
(
  'Force Endurance — 5×6 min Low Cadence (90 min)',
  'endurance',
  '5× 6 min at ~82% FTP in a big gear at 50–60 rpm. Recovery at normal cadence. Builds muscular force; complement to gym strength work.',
  array['endurance', 'force', 'low-cadence', 'strength'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":70}},
    {"type":"repeat","data":{"count":5,"intervals":[
      {"name":"Big gear @ 50-60 rpm","durationSeconds":360,"intensityPercentStart":82},
      {"name":"Easy spin","durationSeconds":240,"intensityPercentStart":60}
    ]}},
    {"type":"interval","data":{"name":"Endurance","durationSeconds":1200,"intensityPercentStart":65}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'force_endurance', 1800
),
(
  'Force Endurance — 6×6 min Low Cadence (120 min)',
  'endurance',
  '6× 6 min at ~82% FTP in a big gear at 50–60 rpm. Recovery at normal cadence. Long version with extended Z2 finish — substantial muscular load.',
  array['endurance', 'force', 'low-cadence', 'strength'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":600,"intensityPercentStart":50,"intensityPercentEnd":70}},
    {"type":"repeat","data":{"count":6,"intervals":[
      {"name":"Big gear @ 50-60 rpm","durationSeconds":360,"intensityPercentStart":82},
      {"name":"Easy spin","durationSeconds":240,"intensityPercentStart":60}
    ]}},
    {"type":"interval","data":{"name":"Endurance","durationSeconds":1800,"intensityPercentStart":65}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":1200,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'force_endurance', 2160
);
