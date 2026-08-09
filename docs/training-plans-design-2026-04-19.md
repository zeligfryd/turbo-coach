# Training Plans — Design Discussion (2026-04-19)

User brainstorm prompt: build a coach-driven training plan system that
1. Outputs day-by-day workout *prescriptions* (workout type + parameters), matched to a workout database — not full interval details
2. Supports constant adaptation at multiple scopes (next day, week, month, full plan) based on recent data + free-text input

## On the plan output format

**The "workout type + parameters" abstraction is correct.** Trying to make the LLM design 60-80 unique workouts for a 12-week plan is a token sink and a quality disaster — the LLM will lose internal consistency, repeat patterns, and produce subtly wrong intervals. Delegating execution detail to a curated workout database is exactly right.

**But "intensity level OR TSS OR duration" is the wrong framing.** TSS = duration × IF² × 100 / 3600 — these are not independent. Pick any two and the third is determined. Recommendation:
- **Duration** (rider's time budget) + **workout type** (which encodes intensity).
- TSS becomes a *derived* consequence, not a prescription target.

**The bigger question: what's a "workout type"?** "Threshold" isn't a workout type — it's a zone. These are very different sessions, all "threshold":
- `2×20 min @100% FTP` (long reps, lactate clearance focus)
- `8×5 min @110% FTP` (short reps, harder push, less time-in-zone)
- `4×10 min @95-105% over-unders` (variability, anaerobic resilience)

For matching to work, you need a richer taxonomy — roughly 15-20 workout *archetypes*, not 6-8 zones. Examples:
- `endurance_easy`, `endurance_with_surges`, `endurance_long`
- `tempo_sustained`, `tempo_blocks`
- `sweetspot_long_blocks`, `sweetspot_over_unders`
- `threshold_long_reps`, `threshold_short_reps`, `threshold_over_unders`
- `vo2_short_reps` (30/30, 40/20), `vo2_long_reps` (3-5min)
- `anaerobic_capacity`, `anaerobic_power`
- `neuromuscular_sprints`
- `recovery_flush`

The coach's prescription becomes: `{archetype, duration_min, target_time_in_zone_min}`. The matcher picks the closest workout. **This requires seeding the library upfront** — maybe 100-150 well-designed workouts covering each archetype × 2-3 duration brackets. One-time investment, huge payoff.

**On weekly TSS as prescription:** Useful as a *consequence* of the structure, not a goal. Better to prescribe weekly *structure* ("2 hard, 1 long, 3 easy = ~440 TSS, ~9h"). Otherwise riders gamify the number.

---

## On constant adaptation

**This is more important than the plan itself.** A static 12-week plan is theatre. Adaptation is what makes a coach valuable. But the scopes need different reasoning:

| Scope | What it actually is | Inputs needed |
|-------|---------------------|---------------|
| Next day | "Should I do the prescribed session or swap?" | Yesterday + tonight's sleep + RPE |
| Next 3 days | Rebalance hard/easy ratio | TSB trajectory + life events |
| Next week | Restructure microcycle | Recent execution + upcoming constraints |
| Next month | Adjust block intensity progression | Block purpose + adaptation evidence |
| Full plan | Replan around a new event/constraint | Target event + time available |

The first two are tactical and frequent. The last two are strategic and rare. **Different scopes probably want different UX entry points** — "swap today's workout" should be a one-tap action, not a free-text dialog.

### Pushback

1. **Don't make adaptation manual-only.** If the rider has to remember to trigger it, the plan drifts and dies. At minimum: a weekly auto-review (Sunday night) that regenerates next week's specifics from the past week's execution. The rider can override.

2. **"Full plan" adaptation is dangerous as a casual button.** If a rider can re-roll their entire 12-week plan whenever they feel restless, they'll never trust periodisation. Gate it behind a real reason: new target event, injury, major life change, or an explicit "are you sure" with a stored rationale.

3. **The coach must distinguish "skip and shift" from "skip and forget."** This is the single most common adaptation. If the rider misses Tuesday's threshold session, do they:
   - (a) Push everything back a day
   - (b) Drop it and continue Wednesday's plan
   - (c) Replace with something easier

   This deserves its own primitive — not buried in a generic "adapt the next 3 days" flow.

---

## What's actually missing in both ideas

**The plan needs to be a first-class entity in the data model.** Right now `scheduled_workouts` is a flat list with no concept of a plan. For adaptation to work cleanly:

```
training_plan
  ├── target_event (FK to race_events, optional)
  ├── start_date, end_date, goal, philosophy
  ├── plan_blocks (mesocycle: "Base 1", 4 weeks)
  │     └── plan_weeks (microcycle: target structure + TSS band)
  │           └── plan_days (workout archetype + duration)
  │                 └── scheduled_workouts (materialised by matcher)
```

This separation is what lets you adapt at the right level. Adapting "next month" rewrites `plan_weeks`. Adapting "next day" only rewrites a `plan_day`. Without this hierarchy, every adaptation is a full rewrite.

**Plan rationale stored with the plan.** Each plan and each block needs a one-paragraph "why this structure." When the coach adapts later, it references its own rationale to maintain continuity instead of contradicting itself.

**Plan diff on adaptation.** When adaptation happens, show the rider what *changed* and what *stayed the same*. Otherwise they lose trust — they'll feel like the coach is randomly rewriting things.

---

## Recommended sequencing

1. **First: build the workout archetype taxonomy and seed the library.** ~100-150 workouts. Grunt work but unblocks everything else.
2. **Then: the data model — plans, blocks, weeks, days as first-class entities.** Without this, adaptation is impossible to do cleanly.
3. **Then: plan generation** — coach builds a 4-12 week plan using archetypes.
4. **Then: tactical adaptation** — "swap today's workout," "I missed Tuesday." High-frequency operations.
5. **Last: strategic adaptation and full replan.** Lower frequency, easier to defer.

Skipping step 1 or 2 means rewriting the system in 6 months when adaptation requirements outgrow a flat schedule.
