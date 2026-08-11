-- How to perform each exercise.
--
-- `cues` is the one-line reminder shown inline on a card; this is the fuller
-- account shown when a card is expanded. Each one covers setup, the movement,
-- and the mistake that most often makes it useless — that last part is the
-- reason to write it out rather than rely on the name.
--
-- Instructional, not clinical: these describe how the movement is performed,
-- and deliberately do not prescribe anything for a specific injury.

alter table public.exercise add column description text;

comment on column public.exercise.description is
  'How to perform the exercise: setup, movement, and the common error. Shown when an exercise card is expanded. cues stays the short inline reminder.';

-- ── Hips & glutes ───────────────────────────────────────────────────

update public.exercise set description =
  'Lie on your side with your hips stacked and your legs straight, resting your head on your lower arm. Lift the top leg to about 30–40°, pause, and lower under control.
The leg drifting forward is what turns this into a hip-flexor exercise instead of a glute one. Keep the top hip stacked directly over the bottom one and lead with the heel, not the toes.'
where name = 'Side-lying hip abduction' and is_preset;

update public.exercise set description =
  'Loop a band just above the knees, drop into a quarter-squat with your feet under your hips, and step sideways while keeping tension in the band throughout.
Let the trailing foot snap in and the band does the work for you. Move the trailing foot deliberately, keep your chest up, and stay low — standing up between steps is the usual way this stops counting.'
where name = 'Banded lateral walk' and is_preset;

update public.exercise set description =
  'Lie on your back with one knee bent and that foot flat, the other leg extended or held at the hip. Drive through the heel of the planted foot to lift your hips until your body forms a line from shoulder to knee.
The pelvis dropping on the free side is the thing to watch. Keep it level throughout — a smaller range with a level pelvis is worth more than a high bridge that twists.'
where name = 'Single-leg glute bridge' and is_preset;

update public.exercise set description =
  'Stand on one leg with a soft knee. Hinge forward from the hip until your torso and free leg form one line, then rotate the pelvis open toward the ceiling and closed again under control.
This is demanding on balance; hold a wall or a chair rather than losing the rotation. The point is the controlled opening and closing at the standing hip, not staying upright unaided.'
where name = 'Standing hip airplane' and is_preset;

update public.exercise set description =
  'Lie on your side with your top leg resting on a bench, foot or knee supported, and the bottom leg hanging free. Lift your hips until your body is a straight line, then lower slowly.
Start with the knee on the bench rather than the foot — the shorter lever is markedly easier, and this is a movement worth earning. Expect soreness in the groin for a couple of sessions.'
where name = 'Copenhagen adduction' and is_preset;

update public.exercise set description =
  'On all fours, take one knee out wide with the shin flat on the floor, then rock your hips back toward your heels and return.
Keep your lower back neutral throughout — rounding it moves the stretch from the adductor into the spine. Go only as far back as you can hold that position.'
where name = 'Adductor rock-back' and is_preset;

update public.exercise set description =
  'Kneel with one knee down and that foot against a wall or on a low surface behind you, the other foot planted in front. Tuck your pelvis under and squeeze the glute on the kneeling side, then shift forward from the hip.
The glute squeeze is the whole exercise. Without it, the range comes from arching the lower back and the hip flexor never lengthens.'
where name = 'Couch stretch' and is_preset;

update public.exercise set description =
  'Kneel on one knee with the other foot planted in front. Tuck the pelvis under, squeeze the glute on the kneeling side, and shift your weight forward while staying tall through the ribs.
The lighter, more accessible version of the couch stretch. As with that one, the pelvic tuck comes first — leaning forward without it just extends the lower back.'
where name = 'Kneeling hip-flexor stretch' and is_preset;

update public.exercise set description =
  'Stand tall with a band around one foot or both, anchored low. Drive the knee up past hip height against the band, then lower under control.
Keep your chest up and your standing side quiet. Leaning back to get the knee higher is the common miss — the range should come from the hip, not the spine.'
where name = 'Banded hip-flexor march' and is_preset;

update public.exercise set description =
  'From standing, step forward into a long lunge and place both hands on the floor inside the front foot. Drop the back knee if you need to, then rotate one arm up toward the ceiling and follow it with your eyes.
The best value movement here when time is short: it covers hip-flexor length, adductor range, thoracic rotation and ankle dorsiflexion in one pass. Move slowly and pause at the top of the rotation.'
where name = 'World''s greatest stretch' and is_preset;

-- ── Posterior chain ─────────────────────────────────────────────────

update public.exercise set description =
  'Kneel with your ankles held or hooked under something solid, hips locked in line with your shoulders. Lower yourself forward as slowly as you can, catching with your hands, then push back up.
The single best-evidenced injury-prevention exercise in sport, and the most unpleasant on this list. Start with three reps and expect severe soreness for the first two sessions. The hips breaking backwards is what turns it from a hamstring exercise into a fall.'
where name = 'Nordic hamstring curl' and is_preset;

update public.exercise set description =
  'Stand on one leg holding a weight in the opposite hand. Hinge from the hip with a long spine, letting the back leg rise so that leg and torso move as a single line, then return.
Height of the back leg does not matter; the straight line does. Rotating open at the pelvis to reach further down is the usual compensation.'
where name = 'Single-leg Romanian deadlift' and is_preset;

update public.exercise set description =
  'Lie on your back with one leg raised and held behind the thigh. Extend the knee and lift your head at the same time, then bend the knee and lower the head together.
A nerve glide rather than a stretch — the two ends of the nerve alternate, so it should never feel like a hard pull. Back off the range if you get pain or pins and needles; more range is not the goal here.'
where name = 'Hamstring floss' and is_preset;

update public.exercise set description =
  'Stand with the balls of your feet on a step and your heels free. Rise for a count of three, then lower for a count of three through the full range below the step.
The slow lowering is the part that loads the tendon; rushing it removes the point of the exercise. Add weight before you add reps once bodyweight is easy.'
where name = 'Heavy-slow calf raise' and is_preset;

update public.exercise set description =
  'Stand on one leg on a step, rise to mid-range — not the top — and hold still.
Isometric holds are usually well tolerated when a tendon is irritable, and often settle symptoms for a while afterwards. Hold the middle of the range: locking out at the top takes the load off the tissue you are trying to load.'
where name = 'Single-leg calf isometric' and is_preset;

update public.exercise set description =
  'Sit with your knee bent to about 90° and a weight resting on the thigh just above the knee. Rise onto the ball of the foot and lower slowly through the full range.
The bent knee takes the gastrocnemius out and puts the work into the soleus, which straight-leg calf raises miss entirely. That matters for cyclists, since the soleus does most of the work at the pedal.'
where name = 'Seated soleus raise' and is_preset;

-- ── Trunk ───────────────────────────────────────────────────────────

update public.exercise set description =
  'Lie on your back with hips and knees at 90° and arms toward the ceiling. Press your lower back into the floor and hold it there, then lower one arm and the opposite leg, return, and alternate.
That contact between the lower back and the floor is the exercise. The moment it lifts, shorten the range — reaching further with a floating back trains the opposite of what is intended.'
where name = 'Dead bug' and is_preset;

update public.exercise set description =
  'On all fours, extend one arm forward and the opposite leg back until both are level with your torso, then return under control.
Reach long rather than high. The pelvis rotating open as the leg lifts is the common fault; a hand resting on your lower back will tell you when it happens.'
where name = 'Bird dog' and is_preset;

update public.exercise set description =
  'Lie on your back with one knee bent, the other leg straight, and both hands under the small of your back. Lift only your head and shoulders a centimetre or two and hold, then lower.
Barely a movement — the point is bracing without flexing the spine, so keep the hands under the back as a reminder not to flatten it. Short holds repeated beat one long one.'
where name = 'McGill curl-up' and is_preset;

update public.exercise set description =
  'Stand side-on to an anchored band at chest height, holding it with both hands at your sternum. Press straight out and back in while resisting the pull toward the anchor.
The press is trivial; resisting the rotation is the work. Keep your ribs down and your hips square — turning toward the anchor as you press is the miss.'
where name = 'Pallof press' and is_preset;

update public.exercise set description =
  'Lie on your side propped on your forearm with your elbow under your shoulder, and lift your hips so your body forms a straight line.
Stack the shoulders and hips squarely and drive the down elbow into the floor. Sagging at the hips or rolling toward the floor turns it into a rest rather than a hold.'
where name = 'Side plank' and is_preset;

-- ── Thoracic spine ──────────────────────────────────────────────────

update public.exercise set description =
  'Lie back over a foam roller placed just below the shoulder blades, support your head with your hands, and extend over the roller.
Work four or five positions up the mid-back rather than staying on one spot. Arching the lower back is the usual escape — keep the ribs down so the movement stays in the thoracic spine.'
where name = 'Thoracic extension over roller' and is_preset;

update public.exercise set description =
  'Lie on your side with knees bent and stacked, arms extended in front of you. Keeping the knees still, sweep the top arm across your body and open the chest toward the ceiling, following the hand with your eyes.
The knees are the control: if they roll apart, the rotation has come from the lower back and pelvis rather than the upper back.'
where name = 'Open-book rotation' and is_preset;

update public.exercise set description =
  'From all fours, slide one arm underneath your body and across, letting the shoulder and upper back rotate toward the floor. Rest there and breathe, then return.
Keep the hips over the knees and square. Letting them drift toward the heels turns the rotation into a general shoulder stretch.'
where name = 'Thread the needle' and is_preset;

update public.exercise set description =
  'On all fours, place one hand behind your head and rotate that elbow up toward the ceiling, then back down under your body.
The active counterpart to the thoracic stretches: this loads the rotation rather than just opening it, which is what stops the area reading as stretched-but-never-loaded. Keep the lower back still.'
where name = 'Quadruped thoracic rotation' and is_preset;

update public.exercise set description =
  'On all fours, slowly arch and round your spine in turn, breathing with the movement.
Move one segment at a time rather than swinging between the two end positions. Most people move well at the lower back and barely at all through the mid-back, which is the part worth chasing.'
where name = 'Cat-cow' and is_preset;

-- ── Neck & shoulders ────────────────────────────────────────────────

update public.exercise set description =
  'Sitting or lying, draw your chin straight back — as though making a double chin — and hold, keeping your eyes level.
A small translation, not a nod: tipping the head down instead is the usual error. This trains the deep neck flexors, which take over from the surface muscles that otherwise fatigue on long rides.'
where name = 'Chin tuck' and is_preset;

update public.exercise set description =
  'Sitting tall, move your head slowly through its available range — forward, to each side, rotating, and circling — staying at the edge of comfort.
Slow and controlled throughout, and stop short of any pinch. Speed is the enemy of the point here, which is control at end range rather than range itself.'
where name = 'Neck CARs' and is_preset;

update public.exercise set description =
  'Stand with your back, head, and forearms against a wall, elbows at about 90°. Slide the arms up the wall as far as you can while keeping the contact, then lower.
Contact is the limit, not height. Losing the forearms or letting the lower back arch away from the wall means you have gone past your available range.'
where name = 'Scapular wall slide' and is_preset;

update public.exercise set description =
  'Lie face down with your arms overhead in a Y, then out to a T, then bent into a W, lifting a few centimetres off the floor in each position with your thumbs up.
Lift from the shoulder blade rather than reaching with the hand. Height is irrelevant — shrugging toward the ears is the miss.'
where name = 'Prone Y-T-W' and is_preset;

update public.exercise set description =
  'Anchor a band at elbow height and stand side-on. With your elbow pinned to your ribs and bent to 90°, rotate your forearm outward away from your body, then return slowly.
Keep the elbow against the ribs throughout — letting it drift out recruits the larger shoulder muscles and skips the cuff entirely.'
where name = 'Band external rotation' and is_preset;

update public.exercise set description =
  'Stand beside a wall with your arm out from your side at about 30° and your elbow bent. Press the back of your hand into the wall and hold.
No movement, just steady pressure. Build to a firm effort rather than a maximal one, and keep your shoulder down away from your ear.'
where name = 'Shoulder cuff isometric' and is_preset;

-- ── Feet, ankles & hands ────────────────────────────────────────────

update public.exercise set description =
  'Stand facing a wall with one foot forward. Keeping the heel firmly down, drive the knee forward over the toes toward the wall, then return.
The heel lifting is the end of the exercise, not something to push through. Move the foot further from the wall as the range improves.'
where name = 'Ankle dorsiflexion rock' and is_preset;

update public.exercise set description =
  'Sitting or standing, draw the ball of the foot toward the heel so the arch lifts, without curling the toes or rolling the ankle.
Harder than it sounds and easy to fake with the toes. Learn it sitting before trying it standing, and expect it to feel like nothing is happening at first.'
where name = 'Short-foot hold' and is_preset;

update public.exercise set description =
  'Standing with the foot flat, press the big toe down while lifting the other four, then reverse it.
Almost nobody can do this cleanly at first; that is the point. Work on one direction at a time rather than switching quickly between them.'
where name = 'Toe yoga' and is_preset;

update public.exercise set description =
  'With the arm straight out in front, gently draw the fingers back toward you with the other hand, then turn the hand over and draw them the other way.
Hours on the bars shorten both sides of the forearm, which contributes to the compression behind handlebar palsy. Gentle and sustained beats hard and brief.'
where name = 'Wrist flexor and extensor stretch' and is_preset;

update public.exercise set description =
  'Press one palm into the other and hold, resisting in each direction in turn — extension, flexion, and both sides.
Steady pressure with no movement. A few seconds in each direction is enough; this is about loading the forearm, not testing your strength.'
where name = 'Wrist isometric hold' and is_preset;

update public.exercise set description =
  'Squeeze a rolled towel, a grip trainer or a soft ball hard, hold, and release.
Grip and forearm work is prevention rather than treatment. Numbness or weakness in the hand that persists after a ride needs a clinician, not more squeezing.'
where name = 'Grip squeeze' and is_preset;
