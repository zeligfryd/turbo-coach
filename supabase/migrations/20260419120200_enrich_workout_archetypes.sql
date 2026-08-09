-- Phase 4: enrich workout archetypes with physiological rationale, named
-- protocol examples, and source citations drawn from:
--   • Allen & Coggan, Training and Racing with a Power Meter (3rd ed.)
--   • Friel, The Cyclist's Training Bible (5th ed.)
--
-- Idempotent: subsequent re-runs of the seed migration won't overwrite these
-- because the seed migration only sets the structural columns. If the seed is
-- re-applied with `on conflict do update`, re-running this migration after it
-- restores the enriched fields.

-- ── Recovery / Base ────────────────────────────────────────────────

update public.workout_archetypes set
  rationale = 'Active recovery promotes blood flow without adding training stress. Coggan defines L1 as <55% FTP — the goal is to flush metabolic byproducts and preserve neuromuscular feel without taxing the aerobic or anaerobic systems. Riding above this intensity converts a recovery day into low-grade endurance work and blunts the adaptation from the previous hard session.',
  examples = array[
    'AR-W1 (Allen/Coggan): 1hr easy spin <55% FTP, no force on pedals',
    'AR-W2 (Allen/Coggan): 1.5hr longer spin focused on relaxation, easier gears on hills'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 1',
    'Friel, The Cyclist''s Training Bible, Ch.6 Recovery'
  ]
where id = 'recovery';

update public.workout_archetypes set
  rationale = 'Z2 (56–75% FTP) is the foundation of cycling fitness. Steady aerobic riding develops capillary density, mitochondrial volume, and fat-oxidation capacity. Coggan: power at lactate threshold integrates VO2max, the percentage of VO2max sustainable, and cycling efficiency — all of which improve with consistent Z2 volume. Friel: endurance must be nurtured before any other ability; without it, no higher ability can be expressed in a race.',
  examples = array[
    'END-W1 (Allen/Coggan): 1hr steady at 56–75% FTP, cadence 85–95',
    'END-W2 (Allen/Coggan): 2hr basic endurance, no spikes >80% FTP',
    'END-W6 (Allen/Coggan): Endurance with cadence drills, 90–95 rpm baseline'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 2',
    'Friel, The Cyclist''s Training Bible, Ch.6 Endurance'
  ]
where id = 'endurance_z2';

update public.workout_archetypes set
  rationale = 'Extended Z2 (3–6hr) builds durability — the ability to sustain power deep into long efforts. The metabolic shift toward fat oxidation, glycogen sparing, and muscular resilience to long-duration loading happens in the 3+ hour range. This is the canonical "weekend long ride" anchoring endurance development across base and build phases, and the foundational session for fondo, gravel, and stage-race training.',
  examples = array[
    'END-W3 (Allen/Coggan): 3hr ride, 60–70% FTP, cadence 90–95',
    'END-W9 (Allen/Coggan): 100-mile ride with mid-ride Sweet Spot blocks',
    'Friel ch.9 Long Endurance (E2): longest ride of the week ≥ event duration'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 2',
    'Friel, The Cyclist''s Training Bible, Ch.6 Endurance, Ch.9 Planning Workouts'
  ]
where id = 'endurance_long';

update public.workout_archetypes set
  rationale = 'Embedding short high-intensity efforts inside a Z2 ride trains race-specific neuromuscular response without compromising the underlying aerobic stimulus. The recoveries between bursts are long enough that the bulk of the session remains aerobic. Coggan: NP work on top of Endurance teaches muscles to change speed and recover from accelerations — preparing for race surges, bridges, and group dynamics.',
  examples = array[
    'END-W4 (Allen/Coggan): 2.5hr Z2 with 10× 8-sec out-of-saddle bursts',
    'TEMP-W11 (Allen/Coggan): Endurance/Tempo with 24× 10-sec NP attacks every 5 min',
    'NP-W3 (Allen/Coggan): Z2/Z3 base with 10-sec bursts to 180% FTP every 3 min'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Levels 2 & 7',
    'Friel, The Cyclist''s Training Bible, Ch.6 Speed Skills'
  ]
where id = 'endurance_with_surges';

update public.workout_archetypes set
  rationale = 'Friel''s Force ability — the capacity to overcome resistance — is developed on the bike via low-cadence (50–60 rpm) work in Z2/Z3. This recruits high-threshold motor units at moderate intensity, building muscular force production without the systemic stress of high-intensity work. Often used in base phase as an alternative or complement to gym strength work; particularly useful for riders without gym access or coming off the off-season.',
  examples = array[
    'NP-W4 (Allen/Coggan): Big-gear uphill in 53:14 starting at 12 mph, cadence 50–60',
    'Friel Force on bike: low-cadence Z3 climbs in big gear (Friel Ch.6)',
    'Strength-Endurance hill climb: 4–6× 5–10 min @Z3 in big gear, 50–60 rpm'
  ],
  sources = array[
    'Friel, The Cyclist''s Training Bible, Ch.6 Force, Ch.12 Strength',
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 7'
  ]
where id = 'force_endurance';

-- ── Tempo / Sweet Spot ─────────────────────────────────────────────

update public.workout_archetypes set
  rationale = 'Tempo (76–90% FTP) develops the upper aerobic engine and muscular endurance. Coggan describes it as a "solid, fast pace" that improves aerobic capacity through accumulated time at submaximal load. Tempo is the bridge between Z2 endurance and threshold work, and forms the bulk of "specific" base/build training for time-trialists, rouleurs, and gran-fondo riders.',
  examples = array[
    'TEMP-W1 (Allen/Coggan): 35-min continuous Tempo block, cadence 90–95',
    'TEMP-W14 (Allen/Coggan): 2× 15 min @76–90% FTP, 5 min RI',
    'TEMP-W13 (Allen/Coggan): 2× 25 min Tempo, 5 min RI between'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 3',
    'Friel, The Cyclist''s Training Bible, Ch.6 Muscular Endurance'
  ]
where id = 'tempo_continuous';

update public.workout_archetypes set
  rationale = 'Sweet Spot (88–94% FTP) sits at the upper end of tempo and just below threshold, delivering high training stimulus per unit of fatigue cost. It''s the most time-efficient zone for FTP development because it accumulates substantial work close to threshold without the recovery debt of pure threshold sessions. Particularly valuable for time-constrained athletes and during base-phase progressions toward threshold work.',
  examples = array[
    'SubLT-W1 (Allen/Coggan): 2× 10 min Sweet Spot, 5 min RI, 90–100 rpm',
    'SubLT-W2 (Allen/Coggan): 2× 20 min Sweet Spot + 45 min Tempo',
    'SubLT-W10 (Allen/Coggan): 2× 20 min Sweet Spot, 5 min RI'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Levels 3–4',
    'Friel, The Cyclist''s Training Bible, Ch.6 Muscular Endurance'
  ]
where id = 'sweetspot_blocks';

update public.workout_archetypes set
  rationale = 'Alternating Sweet Spot (88%) and Threshold (100%) within continuous blocks trains lactate clearance under repeated low-grade lactate accumulation. The "over" portions push lactate up, the "under" portions force the body to clear it while still working — adapting buffering and shuttling mechanisms. Less stressful than full crisscross at threshold but still develops resilience to power surges.',
  examples = array[
    'SubLT-W6 Crisscross (Allen/Coggan): 20-min Sweet Spot with 7× 10-sec bursts to 150% FTP',
    'SubLT-W9 Crisscross (Allen/Coggan): 2× 15 min Sweet Spot with surges to 120% FTP every 2 min',
    'Coggan-style 2× 15 min: 88% baseline, 30s @100% every 2 min'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Levels 3–4',
    'Friel, The Cyclist''s Training Bible, Ch.6 Muscular Endurance'
  ]
where id = 'sweetspot_over_unders';

-- ── Threshold ──────────────────────────────────────────────────────

update public.workout_archetypes set
  rationale = 'Long threshold reps (15–20 min at 95–105% FTP) maximise time at lactate threshold — the canonical session for raising FTP. Coggan: power at lactate threshold is the most important physiological determinant of endurance cycling performance because it integrates VO2max, the percentage of VO2max sustainable, and cycling efficiency. The classic 2× 20 min protocol is widely considered the "gold standard" of FTP development.',
  examples = array[
    'LT-W1 (Allen/Coggan): 2× 10 min @100% FTP, 5 min RI',
    'LT-W2 (Allen/Coggan): 2× 15 min @100% FTP, 5 min RI',
    'Classic Coggan 2× 20: 2× 20 min @100% FTP, 5–10 min RI',
    'LT-W13 (Allen/Coggan): 2× 20 min @FTP + 3× 3 min VO2max'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 4 & Ch.3',
    'Friel, The Cyclist''s Training Bible, Ch.6 Muscular Endurance'
  ]
where id = 'threshold_long_reps';

update public.workout_archetypes set
  rationale = 'Shorter threshold reps (6–10 min at 100–105% FTP) allow slightly higher target intensity than long reps because each effort is more manageable. They complement long-rep threshold work, especially when introducing threshold training, after a layoff, or when targeting upper-FTP power. Coggan''s 6-minute time trial protocol also builds pacing skills alongside FTP development.',
  examples = array[
    'LT-W17 Time Trial FTP (Allen/Coggan): 6× 6 min @105% FTP, 7 min RI',
    'LT-W6 (Allen/Coggan): 4× 10 min @Threshold, 5 min RI',
    'LT-W19 (Allen/Coggan): 2 rounds of 5× 3 min FTP, 3 min RI'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 4',
    'Friel, The Cyclist''s Training Bible, Ch.6 Muscular Endurance'
  ]
where id = 'threshold_short_reps';

update public.workout_archetypes set
  rationale = 'Alternating just-under (95%) and just-over (105%) FTP within continuous blocks specifically targets lactate clearance capacity at high intensity. The "over" segments accumulate lactate; the "under" segments force the body to clear it while still under load. Develops the cyclist''s ability to handle race surges at threshold without blowing up — particularly relevant for road racing, group riding, and crit-style efforts.',
  examples = array[
    'LT-W9 Crisscross to AC (Allen/Coggan): 2× 20 min FTP with bursts to AC every 2 min',
    'LT-W11 FTP with AC Bursts (Allen/Coggan): 2× 15 min FTP with 10-sec bursts to 130% FTP every minute',
    'LT-W15 (Allen/Coggan): 2× 20 min FTP with 10-sec bursts to 130% FTP each minute'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 4',
    'Friel, The Cyclist''s Training Bible, Ch.6 Muscular Endurance & Anaerobic Endurance'
  ]
where id = 'threshold_over_unders';

-- ── VO2max ─────────────────────────────────────────────────────────

update public.workout_archetypes set
  rationale = 'Long VO2max intervals (3–5 min at 105–120% FTP) drive the body to maximal oxygen uptake, accumulating time at or near VO2max. This develops cardiac stroke volume, oxidative enzyme density, and capillary perfusion. Friel: VO2max work is among the most stressful training and demands the highest recovery; usually limited to 1–2 sessions per microcycle in the build phase. Stop the set when interval power drops below ~95% of target — diminishing returns beyond that point.',
  examples = array[
    'VO2-W3 (Allen/Coggan): 6× 3 min @>115% FTP, 5 min RI',
    'VO2-W4 (Allen/Coggan): 1×5 + 6×3 + 4×2 min @120% FTP',
    'VO2-W1 (Allen/Coggan): 6× 6 min TT effort at 96–102% FTP, 6–8 min RI'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 5 & Ch.3',
    'Friel, The Cyclist''s Training Bible, Ch.6 Anaerobic Endurance'
  ]
where id = 'vo2_long';

update public.workout_archetypes set
  rationale = 'Short VO2max efforts (30/30, 40/20, 1-on/1-off) allow higher target power than long reps because each work bout is brief enough to stay above threshold without depleting anaerobic capacity. They accumulate substantial VO2max time at intensities most riders cannot hold in 3–5 min reps. Excellent entry point for new VO2max work or after a layoff, and well-tolerated by riders who struggle with long VO2 reps.',
  examples = array[
    'VO2-W5 (Allen/Coggan): 6× 2 min from 23–25 mph, 2 min RI',
    'Coggan-style 30/30: 2–3 sets of 10× (30s @120% FTP / 30s easy)',
    '40/20 sets: 2–3× 10 reps of 40s @110–115% / 20s easy'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 5',
    'Friel, The Cyclist''s Training Bible, Ch.6 Anaerobic Endurance'
  ]
where id = 'vo2_short';

update public.workout_archetypes set
  rationale = 'Extended VO2max blocks built from many short efforts with very brief recovery (Billat-style 30/30) maximise total time at VO2max in a single session. Because oxygen uptake doesn''t drop fully during the brief recoveries, the rider accumulates more cumulative time near VO2max than long reps alone allow. Useful when targeting aerobic ceiling progression and for advanced riders adapting to repeated high-intensity loading.',
  examples = array[
    'Billat 30/30: 2–3× 10 min of 30s @VO2 power / 30s easy',
    'NP-W1 microbursts adapted: 3× 10 min of 15s on (150% FTP) / 15s off',
    'NP-W2 (Allen/Coggan): 3× 10 min microbursts 15s on / 15s off'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 5 & 7',
    'Billat, "Interval Training for Performance" Sports Medicine 31 (2001)'
  ]
where id = 'vo2_extended';

-- ── Anaerobic / Neuromuscular ──────────────────────────────────────

update public.workout_archetypes set
  rationale = 'Repeated short efforts (30s–2 min) at 120–150% FTP develop glycolytic capacity and lactate tolerance — the body''s ability to produce energy anaerobically and tolerate the resulting metabolic disturbance. Friel calls this the most stressful type of training, with the highest recovery requirements; he advises novice riders avoid it for at least the first year and even advanced riders only do it when peaking for AE-dependent events. Stop the set when interval average drops more than ~10% below target.',
  examples = array[
    'AC-W3 (Allen/Coggan): 8× 2 min @130% FTP, 2 min RI; stop when avg drops below 118%',
    'AC-W7 (Allen/Coggan): 6× 2 min + 6× 1 min + 6× 30 sec, 1 min RI',
    'AC-W8 (Allen/Coggan): 6× 2 min @130% FTP + 3× 1 min @140% FTP'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 6',
    'Friel, The Cyclist''s Training Bible, Ch.6 Anaerobic Endurance'
  ]
where id = 'anaerobic_capacity';

update public.workout_archetypes set
  rationale = 'Short, very high-power repeats (30–60s above 130% FTP) are race-specific for accelerations, attacks, and bridges in mass-start events. Friel: the second type of AE workout prepares the rider for repeated surges in criteriums and group racing — challenging the body''s lactate-clearance and buffering systems so that staying with such a demanding event becomes possible (never easy). Best done sparingly, peaking phase only.',
  examples = array[
    'AC-W2 (Allen/Coggan): 10× 2–3 min hill repeats, all-out',
    'END-W10 AC Hill Jams (Allen/Coggan): 3–8× 30s–2 min @135% FTP on hills',
    'Race-specific AE: 8–12× 30–45s @150% FTP, 90s RI (criterium prep)'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 6',
    'Friel, The Cyclist''s Training Bible, Ch.6 Anaerobic Endurance'
  ]
where id = 'anaerobic_repeats';

update public.workout_archetypes set
  rationale = 'Maximal short sprints (10–15s) with full recovery develop peak power output and rate of force development. Friel categorises Power as nervous-and-muscular: the nervous system must signal contraction at the right moment and the muscles must produce a large force. Heart rate is irrelevant; full recovery between reps is essential — fatigue diminishes the value of the workout. Improvements are largely neuromuscular, not metabolic, so volume must stay low.',
  examples = array[
    'NP-W7 Sprint Intervals (Allen/Coggan): 6× 8s small-ring + 6× 15s big-ring sprints',
    'NP-W5 Small/Big Ring Sprints (Allen/Coggan): 6× small ring + 3+3+1 big-ring sprints',
    'NP-W8 Sprint Double (Allen/Coggan): 5–8s sprint + 10s @125% + 18s max sprint'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 7',
    'Friel, The Cyclist''s Training Bible, Ch.6 Power & Speed Skill'
  ]
where id = 'neuromuscular_sprints';

-- ── Test / Race / Opener ───────────────────────────────────────────

update public.workout_archetypes set
  rationale = 'Field test to calibrate FTP — Coggan''s classic protocol is a 5-min all-out (to deplete anaerobic capacity) followed by a 20-min maximum effort, with the 20-min average reduced by ~5% to estimate 60-min FTP. Alternative: ramp test (FTP ≈ peak 1 min × 0.75) or full 60-min TT (most accurate). FTP underpins all power-based zones and should be reassessed every 6–8 weeks during active training, or whenever fitness has shifted noticeably.',
  examples = array[
    'Coggan 20-min protocol: warm-up + 5 min all-out + 10 min easy + 20-min TT; FTP ≈ avg × 0.95',
    'Ramp test: incremental 1-min steps until failure; FTP ≈ peak 1 min × 0.75',
    'Traditional 60-min TT: most accurate, requires solid pacing'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Ch.3 Testing Protocol',
    'Friel, The Cyclist''s Training Bible, Ch.5 Assessing Fitness'
  ]
where id = 'ftp_test';

update public.workout_archetypes set
  rationale = 'Varied-intensity sessions built around the demands of a target event reproduce the metabolic and tactical patterns of racing. Coggan''s "race-winning intervals" replicate how road races are won from a breakaway — Sweet Spot blocks bookended by sprints. Useful in the final weeks of build phase to bridge structured training and event-specific demands. Best scheduled 1–2 weeks before A-priority events.',
  examples = array[
    'VO2-W6 Race-Winning (Allen/Coggan): 5× (30s sprint + 3 min @100–110% FTP + 10s sprint)',
    'SubLT-W8 Race-Winning (Allen/Coggan): 3× 15 min Sweet Spot bookended by 30s sprints',
    'WATTS-W1 Kitchen Sink (Allen/Coggan): 4hr with mixed climbs at Threshold and Tempo'
  ],
  sources = array[
    'Allen & Coggan, Training and Racing with a Power Meter, Appendix Level 5 & Kitchen Sink',
    'Friel, The Cyclist''s Training Bible, Ch.9 Planning Workouts, Ch.10 Stage Race Training'
  ]
where id = 'race_simulation';

update public.workout_archetypes set
  rationale = 'Pre-race or pre-test sharpening session — short overall duration with a few brief efforts at race intensity to prime the neuromuscular and aerobic systems without adding fatigue. Goal is to wake the body up after a taper so the rider doesn''t feel "flat" on race morning. Friel emphasises rest days followed by short, intense efforts in the final taper week.',
  examples = array[
    'Classic opener: 45–60 min Z2 + 3–4× 1 min at race intensity, full recovery',
    'Coggan-style: 30–45 min Z2 + 3× 30s @VO2max + cool-down',
    'Friel pre-A-race day: short ride with 1–2 efforts of 60–90 sec at AE'
  ],
  sources = array[
    'Friel, The Cyclist''s Training Bible, Ch.10 Stage Race Training, Ch.9 Planning Workouts',
    'Allen & Coggan, Training and Racing with a Power Meter, race preparation'
  ]
where id = 'opener';
