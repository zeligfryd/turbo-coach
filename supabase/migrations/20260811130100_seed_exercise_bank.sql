-- Seed the prehab exercise bank and the four named routines (v1).
--
-- Everything here is a preset: user_id null, is_preset true, read-only. Users
-- create their own rows, or duplicate a preset to edit it (D7).
--
-- The bank is deliberately small and deliberately shaped by cycling's actual
-- overuse profile rather than by anatomy. Gradual-onset injuries in cyclists
-- concentrate in four places — knee (patellofemoral pain most common, then
-- ITBS), lower back, neck/shoulder, and hands/wrists — so the bank is densest
-- where those originate: lateral hip and hip flexors upstream of the knee and
-- back, thoracic extension and deep neck flexors upstream of the neck, and
-- forearm/grip work for the bars.
--
-- The four routines exist because the evidence on injury-prevention
-- programmes is overwhelmingly about adherence, not targeting: the
-- interventions that work (FIFA 11+, the Nordic hamstring protocol) are short,
-- fixed, non-individualised sequences, and even those fail when compliance
-- drops below ~75%. Rotating four named routines is a decision with four
-- possible answers; composing a session from scratch is not.

-- ── Exercises ───────────────────────────────────────────────────────

insert into public.exercise
  (user_id, name, regions, stimulus, default_dose, equipment, difficulty, cues, notes, scope, is_preset, is_public)
values
-- Hips & glutes ------------------------------------------------------
(null, 'Side-lying hip abduction', '{glute_med}', 'activation',
 '{"display":"2 × 15 / side","sets":2,"reps":15,"perSide":true}', '{none}', 1,
 'Stack the hips, lead with the heel, keep the toes pointing forward.',
 'Cycling loads almost nothing laterally. Gluteus medius strengthening is the best-evidenced single item here — a six-week programme resolved symptoms in the large majority of ITBS cases.',
 'prehab', true, true),

(null, 'Banded lateral walk', '{glute_med}', 'activation',
 '{"display":"2 × 20 steps","sets":2,"reps":20}', '{band}', 1,
 'Band above the knees, quarter-squat, keep tension throughout — do not let the trailing foot snap in.',
 null, 'prehab', true, true),

(null, 'Single-leg glute bridge', '{glute_med}', 'motor_control',
 '{"display":"3 × 10 / side","sets":3,"reps":10,"perSide":true}', '{mat}', 2,
 'Keep the pelvis level — the free hip must not drop.',
 null, 'prehab', true, true),

(null, 'Standing hip airplane', '{glute_med}', 'motor_control',
 '{"display":"2 × 6 / side","sets":2,"reps":6,"perSide":true}', '{none}', 3,
 'Hinge to horizontal, then rotate the pelvis open and closed over the standing hip.',
 'Demanding on balance. Hold a wall if needed rather than losing the rotation.',
 'prehab', true, true),

(null, 'Copenhagen adduction', '{adductors}', 'eccentric',
 '{"display":"3 × 8 / side","sets":3,"reps":8,"perSide":true}', '{bench}', 3,
 'Top leg on the bench, lift the hips until the body is a straight line, lower slowly.',
 'Start with the knee on the bench rather than the foot; the short lever is markedly easier.',
 'prehab', true, true),

(null, 'Adductor rock-back', '{adductors}', 'mobility',
 '{"display":"2 × 12 / side","sets":2,"reps":12,"perSide":true}', '{mat}', 1,
 'Wide knee, flat shin, rock the hips back keeping the lower back neutral.',
 null, 'prehab', true, true),

(null, 'Couch stretch', '{hip_flexors}', 'mobility',
 '{"display":"2 × 60 s / side","sets":2,"holdSeconds":60,"perSide":true}', '{mat}', 2,
 'Tuck the pelvis and squeeze the glute on the kneeling side before leaning in.',
 'The glute squeeze is the whole exercise. Without it the range comes from the lower back.',
 'prehab', true, true),

(null, 'Kneeling hip-flexor stretch', '{hip_flexors}', 'mobility',
 '{"display":"2 × 45 s / side","sets":2,"holdSeconds":45,"perSide":true}', '{mat}', 1,
 'Pelvis tucked, shift forward from the hips, stay tall through the ribs.',
 'Sustained hip flexion is the single most consistent adaptation from riding.',
 'prehab', true, true),

(null, 'Banded hip-flexor march', '{hip_flexors}', 'activation',
 '{"display":"2 × 12 / side","sets":2,"reps":12,"perSide":true}', '{band}', 2,
 'Stand tall, drive the knee above hip height against the band, lower under control.',
 null, 'prehab', true, true),

(null, 'World''s greatest stretch', '{hip_flexors,adductors,thoracic_spine}', 'mobility',
 '{"display":"5 / side","reps":5,"perSide":true}', '{mat}', 2,
 'Long lunge, both hands inside the front foot, then rotate one hand to the ceiling.',
 'Covers hip flexor length, adductor range and thoracic rotation in one movement — the best value item in the bank when time is short.',
 'prehab', true, true),

-- Posterior chain ----------------------------------------------------
(null, 'Nordic hamstring curl', '{hamstrings}', 'eccentric',
 '{"display":"3 × 5","sets":3,"reps":5}', '{bench}', 3,
 'Hips locked in line with the shoulders, lower as slowly as you can, catch with the hands.',
 'The single best-evidenced injury-prevention exercise in sport. Expect severe soreness for the first two sessions; start with three reps.',
 'prehab', true, true),

(null, 'Single-leg Romanian deadlift', '{hamstrings}', 'motor_control',
 '{"display":"3 × 8 / side","sets":3,"reps":8,"perSide":true}', '{dumbbell}', 2,
 'Hinge from the hip with a long spine; the back leg and the torso move as one line.',
 null, 'prehab', true, true),

(null, 'Hamstring floss', '{hamstrings}', 'mobility',
 '{"display":"2 × 10 / side","sets":2,"reps":10,"perSide":true}', '{none}', 1,
 'Extend the knee and lift the head together, then reverse — a nerve glide, not a stretch.',
 'Should never be pushed into pain or pins and needles. Back off the range if either appears.',
 'prehab', true, true),

(null, 'Heavy-slow calf raise', '{calf_achilles}', 'eccentric',
 '{"display":"3 × 8","sets":3,"reps":8}', '{step}', 2,
 'Three seconds up, three seconds down, full range off a step.',
 'Loads the tendon, which a calf stretch does not. This is the distinction the coverage view tracks.',
 'prehab', true, true),

(null, 'Single-leg calf isometric', '{calf_achilles}', 'isometric',
 '{"display":"4 × 45 s","sets":4,"holdSeconds":45}', '{step}', 2,
 'Hold mid-range on one leg — not at the top — and stay still.',
 'Isometric holds are well tolerated when a tendon is grumpy and often reduce symptoms immediately.',
 'prehab', true, true),

(null, 'Seated soleus raise', '{calf_achilles}', 'eccentric',
 '{"display":"3 × 12","sets":3,"reps":12}', '{dumbbell}', 1,
 'Knee bent to 90°, weight on the thigh, slow through full range.',
 'The bent knee shifts the work from gastrocnemius to soleus, which the straight-leg version misses.',
 'prehab', true, true),

-- Trunk --------------------------------------------------------------
(null, 'Dead bug', '{lumbar}', 'motor_control',
 '{"display":"3 × 8 / side","sets":3,"reps":8,"perSide":true}', '{mat}', 1,
 'Press the lower back into the floor and keep it there — that contact is the exercise.',
 'Back extensor endurance deficits and increased lumbar flexion are consistently present in cyclists with low back pain.',
 'prehab', true, true),

(null, 'Bird dog', '{lumbar}', 'motor_control',
 '{"display":"3 × 8 / side","sets":3,"reps":8,"perSide":true}', '{mat}', 1,
 'Reach long rather than high; the pelvis must not rotate.',
 null, 'prehab', true, true),

(null, 'McGill curl-up', '{lumbar}', 'isometric',
 '{"display":"3 × 5 × 10 s","sets":3,"reps":5,"holdSeconds":10}', '{mat}', 1,
 'Hands under the lower back, one knee bent, lift only the head and shoulders a centimetre.',
 null, 'prehab', true, true),

(null, 'Pallof press', '{anti_rotation_core}', 'motor_control',
 '{"display":"3 × 10 / side","sets":3,"reps":10,"perSide":true}', '{band}', 2,
 'Resist the rotation — the press is slow and the ribs stay down.',
 null, 'prehab', true, true),

(null, 'Side plank', '{anti_rotation_core}', 'isometric',
 '{"display":"3 × 30 s / side","sets":3,"holdSeconds":30,"perSide":true}', '{mat}', 2,
 'Stack the shoulders and hips, drive the down elbow into the floor.',
 null, 'prehab', true, true),

-- Thoracic spine -----------------------------------------------------
(null, 'Thoracic extension over roller', '{thoracic_spine}', 'mobility',
 '{"display":"2 × 10","sets":2,"reps":10}', '{mat}', 1,
 'Roller just below the shoulder blades, support the head, extend over it — do not arch the lower back.',
 'Work four or five positions up the mid-back rather than staying on one spot.',
 'prehab', true, true),

(null, 'Open-book rotation', '{thoracic_spine}', 'mobility',
 '{"display":"2 × 8 / side","sets":2,"reps":8,"perSide":true}', '{mat}', 1,
 'Knees stay stacked and still; only the top shoulder travels.',
 null, 'prehab', true, true),

(null, 'Thread the needle', '{thoracic_spine}', 'mobility',
 '{"display":"2 × 45 s / side","sets":2,"holdSeconds":45,"perSide":true}', '{mat}', 1,
 'From all fours, reach one arm under the body and let the upper back rotate.',
 null, 'prehab', true, true),

(null, 'Quadruped thoracic rotation', '{thoracic_spine}', 'motor_control',
 '{"display":"2 × 8 / side","sets":2,"reps":8,"perSide":true}', '{mat}', 2,
 'Hand behind the head, rotate the elbow to the ceiling, keep the lower back still.',
 'Loads the rotation actively rather than just opening it — which is why it, and not the stretches, clears the thoracic "stretch only" flag.',
 'prehab', true, true),

(null, 'Cat-cow', '{thoracic_spine}', 'mobility',
 '{"display":"10–12 reps","reps":12}', '{mat}', 1,
 'Move one segment at a time, slowly, breathing with the movement.',
 null, 'prehab', true, true),

-- Neck & shoulders ---------------------------------------------------
(null, 'Chin tuck', '{neck}', 'isometric',
 '{"display":"3 × 20 s","sets":3,"holdSeconds":20}', '{none}', 1,
 'Draw the chin straight back and hold — a small movement, not a nod.',
 'Trains the deep neck flexors. When they are weak the superficial muscles take over and fatigue on long rides.',
 'prehab', true, true),

(null, 'Neck CARs', '{neck}', 'mobility',
 '{"display":"2 × 5 / side","sets":2,"reps":5,"perSide":true}', '{none}', 1,
 'Slow controlled circles at the edge of comfortable range. Stop short of any pinch.',
 null, 'prehab', true, true),

(null, 'Scapular wall slide', '{scap_stability}', 'motor_control',
 '{"display":"2 × 12","sets":2,"reps":12}', '{wall}', 1,
 'Forearms and wrists stay on the wall; slide up only as far as contact is kept.',
 null, 'prehab', true, true),

(null, 'Prone Y-T-W', '{scap_stability}', 'motor_control',
 '{"display":"2 × 8 each","sets":2,"reps":8}', '{mat}', 2,
 'Thumbs up, lift from the shoulder blade rather than the hand.',
 null, 'prehab', true, true),

(null, 'Band external rotation', '{shoulder_cuff}', 'activation',
 '{"display":"2 × 15 / side","sets":2,"reps":15,"perSide":true}', '{band}', 1,
 'Elbow pinned to the ribs, rotate from the shoulder, slow back.',
 null, 'prehab', true, true),

(null, 'Shoulder cuff isometric', '{shoulder_cuff}', 'isometric',
 '{"display":"3 × 30 s / side","sets":3,"holdSeconds":30,"perSide":true}', '{wall}', 1,
 'Press the back of the hand into a wall at 30° of abduction and hold.',
 null, 'prehab', true, true),

-- Feet, ankles & hands -----------------------------------------------
(null, 'Ankle dorsiflexion rock', '{ankle_mobility}', 'mobility',
 '{"display":"2 × 15 / side","sets":2,"reps":15,"perSide":true}', '{wall}', 1,
 'Heel stays down, drive the knee forward over the toes.',
 null, 'prehab', true, true),

(null, 'Short-foot hold', '{foot_arch}', 'isometric',
 '{"display":"3 × 30 s / side","sets":3,"holdSeconds":30,"perSide":true}', '{none}', 2,
 'Draw the ball of the foot toward the heel to lift the arch, without curling the toes.',
 'Harder than it sounds. Sitting first, standing once it is reliable.',
 'prehab', true, true),

(null, 'Toe yoga', '{foot_arch}', 'motor_control',
 '{"display":"2 × 10 / side","sets":2,"reps":10,"perSide":true}', '{none}', 2,
 'Big toe down and the others up, then reverse.',
 null, 'prehab', true, true),

(null, 'Wrist flexor and extensor stretch', '{wrists_forearms}', 'mobility',
 '{"display":"2 × 45 s / side","sets":2,"holdSeconds":45,"perSide":true}', '{none}', 1,
 'Arm straight, gently draw the fingers back, then the reverse direction.',
 'Tight forearm flexors and extensors contribute to the wrist compression behind handlebar palsy.',
 'prehab', true, true),

(null, 'Wrist isometric hold', '{wrists_forearms}', 'isometric',
 '{"display":"3 × 30 s","sets":3,"holdSeconds":30}', '{none}', 1,
 'Press the palm into the other hand and hold, then swap direction.',
 null, 'prehab', true, true),

(null, 'Grip squeeze', '{wrists_forearms}', 'isometric',
 '{"display":"3 × 20 s","sets":3,"holdSeconds":20}', '{none}', 1,
 'Squeeze a towel or a grip trainer hard and hold.',
 'Hours on the bars load the ulnar nerve at the wrist. Grip and forearm work is prevention, not treatment — persistent numbness or weakness needs a clinician.',
 'prehab', true, true);

-- ── The four named routines ─────────────────────────────────────────
-- coverage_vector is stored rather than derived at read time, and is
-- recomputed by routineCoverageFromExercises() whenever a routine is edited.

insert into public.routine (user_id, name, est_duration_min, coverage_vector, is_preset, is_public)
values
(null, 'Post-ride 10', 10,
 '{"hips_glutes":{"loaded":false},"thoracic":{"loaded":false},"posterior_chain":{"loaded":false},"extremities":{"loaded":false}}',
 true, true),
(null, 'Hips & glutes 12', 12,
 '{"hips_glutes":{"loaded":true}}',
 true, true),
(null, 'Upper 8', 8,
 '{"neck_shoulders":{"loaded":true},"thoracic":{"loaded":true},"extremities":{"loaded":true}}',
 true, true),
(null, 'Tendon & trunk 10', 10,
 '{"posterior_chain":{"loaded":true},"extremities":{"loaded":true},"trunk":{"loaded":true}}',
 true, true);

-- ── Routine contents ────────────────────────────────────────────────
-- Joined by name so the ordering stays readable. Both sides are presets,
-- and preset names are unique within this seed.

with items(routine_name, position, exercise_name) as (values
  -- Post-ride 10: the mobility staple. Everything cycling shortens, in the
  -- window where tissue is warm. Deliberately all stretch — the coverage view
  -- will say so, which is honest.
  ('Post-ride 10',      0, 'Kneeling hip-flexor stretch'),
  ('Post-ride 10',      1, 'Thoracic extension over roller'),
  ('Post-ride 10',      2, 'Hamstring floss'),
  ('Post-ride 10',      3, 'Ankle dorsiflexion rock'),
  ('Post-ride 10',      4, 'Thread the needle'),

  -- Hips & glutes 12: the lateral and eccentric work riding never provides.
  ('Hips & glutes 12',  0, 'Side-lying hip abduction'),
  ('Hips & glutes 12',  1, 'Banded lateral walk'),
  ('Hips & glutes 12',  2, 'Single-leg glute bridge'),
  ('Hips & glutes 12',  3, 'Copenhagen adduction'),
  ('Hips & glutes 12',  4, 'Couch stretch'),

  -- Upper 8: the cockpit. Neck, scapulae, bars.
  ('Upper 8',           0, 'Chin tuck'),
  ('Upper 8',           1, 'Scapular wall slide'),
  ('Upper 8',           2, 'Band external rotation'),
  ('Upper 8',           3, 'Quadruped thoracic rotation'),
  ('Upper 8',           4, 'Wrist isometric hold'),

  -- Tendon & trunk 10: the loading nothing else in the rotation covers.
  ('Tendon & trunk 10', 0, 'Single-leg calf isometric'),
  ('Tendon & trunk 10', 1, 'Heavy-slow calf raise'),
  ('Tendon & trunk 10', 2, 'Short-foot hold'),
  ('Tendon & trunk 10', 3, 'Dead bug'),
  ('Tendon & trunk 10', 4, 'Pallof press')
)
insert into public.routine_item (routine_id, position, exercise_id, dose)
select r.id, i.position, e.id, e.default_dose
from items i
join public.routine r on r.name = i.routine_name and r.is_preset
join public.exercise e on e.name = i.exercise_name and e.is_preset;
