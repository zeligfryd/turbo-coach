-- Phase 5 — Batch 4: VO2max archetype workouts.
--
-- 11 workouts covering vo2_long, vo2_short, vo2_extended. 3-4 variants
-- per archetype across the archetype's duration bracket.
--
-- duration_seconds / avg_intensity_percent auto-filled by
-- workout_metrics_trigger. time_in_zone_seconds is set explicitly and
-- counts seconds in the archetype's target work bracket only — for
-- short/extended this is the "on" portion of the 30/30 (or 40/20,
-- 15/15) set; the "off" portions are not counted.

-- ── VO2max — Long Reps ─────────────────────────────────────────────
-- 3–5 min reps at 105–120% FTP. Classic VO2max session.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'VO2max — 5×3 min (55 min)',
  'vo2max',
  '5× 3 min at 115% FTP with 3 min recovery. Cadence 95–105 rpm. Entry-level VO2max session — stop the set if any rep drops below ~105% average.',
  array['vo2max', 'aerobic-ceiling', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":5,"intervals":[
      {"name":"VO2max","durationSeconds":180,"intensityPercentStart":115,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Recovery","durationSeconds":180,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_long', 900
),
(
  'VO2max — 6×3 min (60 min)',
  'vo2max',
  '6× 3 min at 115% FTP with 3 min recovery. Cadence 95–105 rpm. Standard VO2max session — accumulates ~18 min at or near VO2max.',
  array['vo2max', 'aerobic-ceiling'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":6,"intervals":[
      {"name":"VO2max","durationSeconds":180,"intensityPercentStart":115,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Recovery","durationSeconds":180,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":540,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_long', 1080
),
(
  'VO2max — 5×4 min (60 min)',
  'vo2max',
  '5× 4 min at 112% FTP with 4 min recovery. Cadence 95–105 rpm. Longer reps at slightly lower target — extended time near VO2max per rep.',
  array['vo2max', 'aerobic-ceiling'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":5,"intervals":[
      {"name":"VO2max","durationSeconds":240,"intensityPercentStart":112,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Recovery","durationSeconds":240,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":420,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_long', 1200
),
(
  'VO2max — 5×5 min (75 min)',
  'vo2max',
  '5× 5 min at 110% FTP with 5 min recovery. Cadence 95–105 rpm. The longest standard VO2max rep — maximises time at VO2max per session.',
  array['vo2max', 'aerobic-ceiling', 'long'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":5,"intervals":[
      {"name":"VO2max","durationSeconds":300,"intensityPercentStart":110,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Recovery","durationSeconds":300,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_long', 1500
);

-- ── VO2max — Short Reps ────────────────────────────────────────────
-- 30/30, 40/20, 1-on/1-off protocols. Shorter work bouts allow higher
-- target power; good entry point for new VO2max work.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  '30/30s — 2×10 (50 min)',
  'vo2max',
  '2 sets of 10× (30s @120% / 30s easy) with 5 min recovery between sets. Cadence 100–110 rpm on efforts. Entry-level short-rep VO2max.',
  array['vo2max', '30-30', 'short'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":120,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":300,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":120,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":720,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_short', 600
),
(
  '30/30s — 3×10 (61 min)',
  'vo2max',
  '3 sets of 10× (30s @118% / 30s easy) with 4 min recovery between sets. Cadence 100–110 rpm on efforts. Standard short-rep VO2max dose.',
  array['vo2max', '30-30'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":118,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":118,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":118,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":660,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_short', 900
),
(
  '40/20s — 2×10 (48 min)',
  'vo2max',
  '2 sets of 10× (40s @115% / 20s easy) with 4 min recovery between sets. Cadence 100–110 rpm. Slightly harder than 30/30 — each on/off cycle demands more.',
  array['vo2max', '40-20'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":780,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":40,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":20,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":40,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":20,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":660,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_short', 800
),
(
  '1-on/1-off — 3×8 (76 min)',
  'vo2max',
  '3 sets of 8× (60s @115% / 60s easy) with 4 min recovery between sets. Cadence 95–105 rpm. Longer work bouts than 30/30 — harder per rep.',
  array['vo2max', '1-on-1-off'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":8,"intervals":[
      {"name":"On","durationSeconds":60,"intensityPercentStart":115,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Off","durationSeconds":60,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":8,"intervals":[
      {"name":"On","durationSeconds":60,"intensityPercentStart":115,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Off","durationSeconds":60,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":8,"intervals":[
      {"name":"On","durationSeconds":60,"intensityPercentStart":115,"cadenceRpmMin":95,"cadenceRpmMax":105},
      {"name":"Off","durationSeconds":60,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_short', 1440
);

-- ── VO2max — Extended (Billat-style) ───────────────────────────────
-- Continuous 10-min blocks of very short on/off (15/15 or 30/30).
-- Oxygen uptake stays elevated throughout — maximises total VO2max
-- time within a session. TIZ counts only the "on" seconds.

insert into public.workouts (name, category, description, tags, intervals, is_preset, is_public, is_library, archetype, time_in_zone_seconds) values
(
  'Billat 30/30s — 2×10 min (50 min)',
  'vo2max',
  '2× 10 min blocks of (30s @115% / 30s easy) with 5 min recovery between blocks. Cadence 100–110 rpm. Billat-style VO2max — 20 reps per 10-min block.',
  array['vo2max', 'billat', '30-30'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":900,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":300,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":600,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_extended', 600
),
(
  'Billat 30/30s — 3×10 min (58 min)',
  'vo2max',
  '3× 10 min blocks of (30s @115% / 30s easy) with 4 min recovery between blocks. Cadence 100–110 rpm. Classic Billat 30/30 — high total VO2max time.',
  array['vo2max', 'billat', '30-30'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":10,"intervals":[
      {"name":"On","durationSeconds":30,"intensityPercentStart":115,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":30,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_extended', 900
),
(
  'Microbursts 15/15 — 3×10 min (58 min)',
  'vo2max',
  '3× 10 min blocks of (15s @150% / 15s easy) with 4 min recovery. Cadence 100–110 rpm on bursts. Keeps VO2 elevated through a sprint-style stimulus.',
  array['vo2max', 'microbursts', '15-15'],
  '[
    {"type":"interval","data":{"name":"Warm-up","durationSeconds":720,"intensityPercentStart":50,"intensityPercentEnd":85}},
    {"type":"repeat","data":{"count":20,"intervals":[
      {"name":"On","durationSeconds":15,"intensityPercentStart":150,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":15,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":20,"intervals":[
      {"name":"On","durationSeconds":15,"intensityPercentStart":150,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":15,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Set recovery","durationSeconds":240,"intensityPercentStart":55}},
    {"type":"repeat","data":{"count":20,"intervals":[
      {"name":"On","durationSeconds":15,"intensityPercentStart":150,"cadenceRpmMin":100,"cadenceRpmMax":110},
      {"name":"Off","durationSeconds":15,"intensityPercentStart":50}
    ]}},
    {"type":"interval","data":{"name":"Cool-down","durationSeconds":480,"intensityPercentStart":60,"intensityPercentEnd":45}}
  ]'::jsonb,
  true, true, true, 'vo2_extended', 900
);
