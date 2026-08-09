-- Seed the 20 canonical workout archetypes.
--
-- Idempotent (ON CONFLICT DO UPDATE) so re-running the migration or applying
-- subsequent edits to the structural metadata is safe. Phase 4 will populate
-- rationale / examples / sources via additional update migrations.
--
-- display_order uses gaps of 10 so we can insert new archetypes between
-- existing ones without renumbering everything.

insert into public.workout_archetypes (
  id, name, category, zone_label,
  default_intensity_min, default_intensity_max,
  default_duration_min, default_duration_max,
  default_tiz_min, default_tiz_max,
  description, display_order
) values
  -- ── Recovery / Base ─────────────────────────────────────────────
  (
    'recovery', 'Recovery Spin', 'recovery', '<55% FTP',
    40, 55,
    30, 60,
    null, null,
    'Very easy spinning to flush the legs and aid blood flow without adding training stress. No structure beyond a steady easy pedal.',
    10
  ),
  (
    'endurance_z2', 'Endurance — Z2', 'endurance', '56–75% FTP',
    60, 75,
    60, 180,
    null, null,
    'Steady aerobic riding in Z2 — the foundation of cycling fitness. No intervals, conversational pace, builds capillarisation and fat oxidation.',
    20
  ),
  (
    'endurance_long', 'Endurance — Long Ride', 'endurance', '56–75% FTP',
    60, 75,
    180, 360,
    null, null,
    'Long-duration Z2 ride (typically the weekend long ride). Pushes durability and metabolic efficiency at extended duration.',
    30
  ),
  (
    'endurance_with_surges', 'Endurance with Surges', 'endurance', 'Z2 base + Z4–5 surges',
    60, 75,
    90, 180,
    5, 15,
    'Z2 base ride with embedded short efforts at Z4–Z5. Adds race-specific neuromuscular work without compromising the aerobic stimulus of the underlying ride.',
    40
  ),
  (
    'force_endurance', 'Force Endurance — Low Cadence', 'endurance', '65–85% FTP at 50–60 rpm',
    65, 85,
    60, 120,
    20, 40,
    'Low-cadence (50–60 rpm) work in Z2/Z3 to build muscular force production on the bike. Often used in base phase as an alternative to gym strength work.',
    50
  ),

  -- ── Tempo / Sweet Spot ──────────────────────────────────────────
  (
    'tempo_continuous', 'Tempo — Continuous', 'tempo', '76–90% FTP',
    76, 90,
    60, 90,
    30, 60,
    'Sustained tempo effort, either continuous or in long blocks. Targets muscular endurance and the upper aerobic capacity.',
    60
  ),
  (
    'sweetspot_blocks', 'Sweet Spot — Blocks', 'sweetspot', '88–94% FTP',
    88, 94,
    75, 120,
    40, 90,
    'Discrete blocks at the upper end of tempo / lower threshold. Time-efficient stimulus for FTP development with manageable fatigue cost.',
    70
  ),
  (
    'sweetspot_over_unders', 'Sweet Spot — Over/Unders', 'sweetspot', '88% / 100% FTP alternations',
    88, 100,
    75, 105,
    30, 60,
    'Alternating sweet spot (88%) and threshold (100%) within continuous blocks. Trains lactate clearance under repeated low-grade lactate accumulation.',
    80
  ),

  -- ── Threshold ───────────────────────────────────────────────────
  (
    'threshold_long_reps', 'Threshold — Long Reps', 'threshold', '95–105% FTP',
    95, 105,
    75, 105,
    30, 60,
    'Classic threshold work in long reps (typically 2–3×15–20 min). Maximises time near FTP — the canonical session for raising the lactate threshold.',
    90
  ),
  (
    'threshold_short_reps', 'Threshold — Short Reps', 'threshold', '100–105% FTP',
    100, 105,
    60, 90,
    24, 40,
    'Shorter, slightly harder threshold reps (typically 4–6×6–10 min). Allows higher target intensity than long reps; complements long-rep threshold work.',
    100
  ),
  (
    'threshold_over_unders', 'Threshold — Over/Unders', 'threshold', '95% / 105% FTP alternations',
    95, 105,
    75, 105,
    30, 50,
    'Alternating just-under / just-over FTP within continuous blocks. Specifically targets lactate clearance capacity at high intensity.',
    110
  ),

  -- ── VO2max ──────────────────────────────────────────────────────
  (
    'vo2_long', 'VO2max — Long Reps', 'vo2max', '105–120% FTP',
    105, 120,
    60, 90,
    12, 25,
    'Classic VO2max intervals in 3–5 min reps. Goal is to accumulate time at or near maximal oxygen uptake — develops cardiac stroke volume and oxidative capacity.',
    120
  ),
  (
    'vo2_short', 'VO2max — Short Reps', 'vo2max', '110–120% FTP',
    110, 120,
    50, 75,
    10, 20,
    'Short VO2max efforts (30/30, 40/20, 1-on/1-off). Allows higher target power than long reps while still accumulating VO2max time. Good entry point for new VO2max work.',
    130
  ),
  (
    'vo2_extended', 'VO2max — Extended (Billat-style)', 'vo2max', '105–115% FTP',
    105, 115,
    60, 90,
    20, 30,
    'Extended VO2max blocks built from many short efforts with very brief recovery. Maximises total time at VO2max in a single session.',
    140
  ),

  -- ── Anaerobic / Neuromuscular ───────────────────────────────────
  (
    'anaerobic_capacity', 'Anaerobic Capacity', 'anaerobic', '120–150% FTP',
    120, 150,
    60, 75,
    6, 15,
    'Repeated short efforts (30 s – 2 min) at high power. Develops glycolytic capacity and lactate tolerance.',
    150
  ),
  (
    'anaerobic_repeats', 'Anaerobic Repeats', 'anaerobic', '130%+ FTP',
    130, 170,
    50, 70,
    4, 10,
    'Short, very high-power repeats — race-specific for accelerations, attacks, and bridges in mass-start events.',
    160
  ),
  (
    'neuromuscular_sprints', 'Neuromuscular Sprints', 'sprint', '150%+ FTP',
    150, 250,
    50, 70,
    2, 3,
    'Maximal short sprints (10–15 s) with full recovery. Develops peak power output and rate of force development.',
    170
  ),

  -- ── Test / Race / Opener ────────────────────────────────────────
  (
    'ftp_test', 'FTP Test', 'test', 'maximal',
    null, null,
    60, 75,
    null, null,
    'Field test to determine current FTP — standard 20 min effort or ramp protocol. Used to recalibrate training zones.',
    180
  ),
  (
    'race_simulation', 'Race Simulation', 'race', 'varied (race-specific)',
    null, null,
    60, 240,
    null, null,
    'Varied-intensity session built around the demands of a target event. Mixes steady efforts, surges, and recovery to mimic the race profile.',
    190
  ),
  (
    'opener', 'Opener', 'opener', 'mixed (low volume)',
    null, null,
    45, 60,
    null, null,
    'Pre-race or pre-test sharpening session — short overall duration with a few brief efforts at race intensity to wake the system up without adding fatigue.',
    200
  )
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  zone_label = excluded.zone_label,
  default_intensity_min = excluded.default_intensity_min,
  default_intensity_max = excluded.default_intensity_max,
  default_duration_min = excluded.default_duration_min,
  default_duration_max = excluded.default_duration_max,
  default_tiz_min = excluded.default_tiz_min,
  default_tiz_max = excluded.default_tiz_max,
  description = excluded.description,
  display_order = excluded.display_order,
  updated_at = now();
