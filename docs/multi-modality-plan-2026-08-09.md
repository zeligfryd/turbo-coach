# Multi-Modality Training Planner — Implementation Plan (2026-08-09)

Implementation plan for the multi-modality phase: extending Turbo Coach from a
cycling-only planner into a whole-training planner covering strength,
stretching, yoga and functional/prehab work.

The design spec (principles P1–P7, taxonomy, feature set, non-goals) is the
handover document and is not restated here. This plan covers **how it lands in
this codebase**: the architectural decisions, the deviations from the spec, the
module layout, and the build order.

---

## 1. Decisions

### D1 — Bike stays in `scheduled_workouts`; the read layer unions

`blocks` holds non-bike modalities only. `scheduled_workouts` remains
authoritative for cycling and gains the two shared columns (`day_part`,
`status`). A read module unions both into a single `PlannedItem` shape.

```
blocks              (strength | mobility | yoga | prehab)
scheduled_workouts  (bike) + day_part + status
        │
        └──► lib/training/read.ts → PlannedItem[]
                 consumed by: calendar, /today, load metrics
```

**Why.** Migrating bike sessions into `blocks` would touch plan activation
(`lib/plans/activation.ts`), the `plan_day_items.scheduled_workout_id` FK,
week shifting (`lib/plans/week-shift.ts`), the coach mutation tools
(`lib/ai/plan-tools.ts`), calendar DnD and ZWO export — a large rewrite before
v0 delivers anything, in service of a model that is cleaner but not more
capable. The union costs one indirection and is reversible later.

**Consequence.** Every consumer reads through `PlannedItem`. Nothing outside
`lib/training/read.ts` may branch on "is this a block or a scheduled workout".

### D2 — `text` + `check`, not Postgres enums

The spec's §6 sketch proposes `create type … as enum`. This repo has **zero**
Postgres enums — every taxonomy is `text not null check (… in (…))`
(`training_plans.status`, `plan_day_items.kind`, `plan_adaptations.scope`).
Enums are awkward to alter through Supabase migrations and add nothing here.

Source of truth is TypeScript, mirroring `WORKOUT_CATEGORIES` in
`lib/workouts/types.ts`: an `as const` array + a zod enum, with the SQL check
constraint kept in sync by hand. The 14 regions and 5 stimulus types are
hard-capped by design, so drift risk is low.

### D3 — Bike sRPE is persisted from intervals.icu, with an IF fallback

Session load (sRPE × minutes) is the only currency that sums across modalities,
so bike sessions need an RPE. `activities` has no such column today.

The intervals.icu API already exposes it — `rpe` and `feel` on
`IcuActivitySummary` (`lib/intervals/types.ts:88-89`) — it is simply not
persisted. Resolution order:

1. `activities.rpe`, populated on sync from the intervals.icu `rpe` field
   (falling back to `feel` where `rpe` is absent).
2. Otherwise derive deterministically from `icu_intensity` (IF) via a fixed
   curve, flagged as estimated.
3. Manual override from `/today`.

Estimated values must be visually distinguishable from reported ones wherever
load is shown. Without this, the 7d:28d ratio on total load is dominated by
whichever modality happens to carry RPE.

### D4 — Provenance vocabulary is `user | rule | coach`

`plan_adaptations.triggered_by` already uses `user | coach | auto`. Rather than
maintain two vocabularies, new tables use the spec's `user | rule | coach` and
`auto` is read as equivalent to `rule`. No migration of existing rows.

### D5 — Modality is a filter, not a lane

The calendar grid is `grid-cols-8` (seven days + week summary) across a
13-month scroll window. Per-modality rows inside each day cell multiply cell
height everywhere. Modality chips filter the date-keyed maps in
`CalendarClient`; day-parts group *within* the existing single column.

### D6 — Minimal `/today` ships in v1

There is currently **no completion concept in the schema at all** — bike "done"
is inferred from an activity landing on the same date. Ghosts and carry-over
(v2) are mechanisms whose only input is reliable ticking, and ticking will not
happen from a laptop. v1 therefore ships a stripped `/today`: today's blocks,
tick done/partial/skipped, optional sRPE. Swap-by-staleness and the carry-over
tray follow in v2/v3.

### D7 — The exercise bank is two-tier, and users can extend it

The bank is a live table, not a fixture. It ships seeded and is editable from
day one, reusing the ownership model `public.workouts` already established in
`20250127000000_add_workout_ownership.sql`:

| Tier | `user_id` | `is_preset` | Who can edit |
|---|---|---|---|
| Seeded bank | `NULL` | `true` | Nobody — RLS blocks update/delete |
| User's own | `auth.uid()` | `false` | The owner, fully |

The same four RLS policies transfer unchanged: read is
`is_preset OR is_public OR user_id = auth.uid()`; insert, update and delete all
carry `AND is_preset = false`. No per-user copy of the seed at signup, no shared
rows that one user can mutate for everyone.

Three consequences worth building for deliberately:

1. **Duplicate-and-edit, not edit-in-place.** Adjusting a seeded exercise is far
   more common than authoring one from scratch — a different dose, a cue that
   suits the user, a regression. Editing a preset copies it into the user's own
   bank with `derived_from` set, and the copy shadows the original in the bank
   list. (`workouts` has no equivalent today; users just build new ones in the
   builder. The bank needs the copy path because its rows are small enough that
   re-authoring is pure friction.)
2. **Retire, never delete.** `routine_item.exercise_id` and historical
   `completion.exercises` both point at these rows, and coverage history is the
   product's whole value. Removing an exercise sets `archived_at`: it disappears
   from the bank and the composer, but saved routines and past completions still
   render. Hard delete is available only for a user row with no references.
3. **Region and stimulus are required fields in the editor.** An exercise
   without them contributes nothing to coverage and cannot be ranked — it would
   be invisible to the two features the bank exists to serve. This is the one
   place the editor should refuse to save.

**Users extend the bank, not the taxonomy.** Regions (14) and stimulus types (5)
stay hard-capped per P3; adding either remains a design decision, not a UI
action. The editor composes from the fixed vocabulary.

This is also the editor the future strength tool will share — one table, one
`scope` column, one ownership model (§7).

### D8 — Coverage is six focus areas, not 14 × 5 — and fixed routines are the default path

**This contradicts the spec.** §11 lists "coverage tracked as region × stimulus,
not region alone" as settled, and §5.2 names the composer "the core interaction —
optimise it hard". Both are revised here on evidence. The underlying insight
survives; only its location changes.

#### Why the matrix fails

**The arithmetic.** Summing Σ(1/target) across the 24 tracked cells in the spec's
default profile gives **≈ 4.1 required stimuli per day — about 29 per week**. A
12-minute routine of six exercises covers at most six cells. The profile
therefore demands roughly **five perfectly non-overlapping, correctly composed
routines every week, indefinitely** — through build blocks, race weeks and
travel. That is not achievable, so the map goes red and stays red. A permanently
red dashboard is one the user stops opening, which is the same guilt-pile
failure the carry-over rules (§5.5) were written to prevent, arriving through a
different door.

**The sparsity is structural.** 46 of 70 cells are grey by design, and several
are physiologically empty — no one performs a "neck eccentric" or a "foot arch
activation". The grid invents cells that no training practice fills.

**It optimises the wrong variable.** Cycling's overuse profile is narrow and
predictable: knee (~26% of gradual-onset injuries, PFPS most common, then ITBS),
lower back (58% 12-month prevalence), neck/shoulder, and hands/wrists. Four hot
spots, not fourteen regions. Meanwhile the interventions with the strongest
evidence in sports injury prevention — FIFA 11+, the Nordic hamstring protocol —
are **fixed, standardised, deliberately non-individualised sequences**, and they
cut injury rates 30–70%. Even so, fewer than 15% of teams complete the
recommended volume; benefit appears at ≥75% adherence and there is no clear
benefit below it. **The binding constraint is adherence, not targeting
precision.** The matrix trades the former for the latter.

#### What replaces it

Six focus areas on one axis, each with a single target interval:

| Area | Rolls up regions | Default |
|---|---|---|
| `hips_glutes` | glute_med, hip_flexors, adductors | 4 d |
| `posterior_chain` | hamstrings, calf_achilles | 5 d |
| `trunk` | lumbar, anti_rotation_core | 5 d |
| `thoracic` | thoracic_spine | 4 d |
| `neck_shoulders` | neck, shoulder_cuff, scap_stability | 6 d |
| `extremities` | ankle_mobility, foot_arch, wrists_forearms | 7 d |

Σ(1/target) = **1.21/day ≈ 8.5 per week**, against ~14 area-hits from four
rotating routines. The profile is satisfiable *with margin* — which is the design
target. A goal profile that can only be met perfectly is a broken goal profile.

**The stimulus axis becomes one derived bit.** `loaded = stimulus !== 'mobility'`.
An area shows a "stretch only" marker when nothing loaded has touched it. No new
column, no five-way axis, and the real physiology (a calf stretch is not a
heavy-slow calf raise) is preserved where it belongs — on the exercise.

**Four seeded routines become the default path.** `Post-ride 10`, `Hips & glutes
12`, `Upper 8`, `Tendon & trunk 10` ship as `is_preset` routines. `/today` then
answers one question with four possible answers — *"Upper 8, last done 9 days
ago"* — instead of asking the user to compose against a grid. The composer stays,
demoted from default path to the tool for building and editing routines.

**Regions and stimulus types stay in the data.** All 14 and all 5 remain on
`exercise` rows: cheap, real, and wanted by the strength tool. Areas are a
display roll-up. This is a UI simplification, not a data-model retreat — a finer
view can be restored later with no re-tagging. Only `coverage_goal` shrinks,
from 24 rows to 6.

#### Design note, not yet scope

The metric with the best evidence behind it is **adherence** — sessions completed
against sessions intended — not coverage perfection. Worth remembering when the
gamification question is revisited.

### D9 — Explain in place: every new concept carries its own help

This phase introduces more new vocabulary than anything before it — focus areas,
staleness ratios, day-parts, two load currencies, ghosts, provenance, block
templates, stretch-versus-loaded. A user (including the author, six months on)
cannot be expected to hold that model in their head. Explanation is a build
requirement in v0, not a polish pass in v3.

**Three mechanisms, in increasing weight:**

1. **Tooltip** — one shared `<Hint>` component wrapping Radix Tooltip, used on
   every label that names a concept: area names, status colours, `sRPE × min`,
   day-parts, ghost blocks, TSB, ratio figures. Never a bare `title` attribute:
   those are invisible on touch, unstyled, and not accessible to keyboard users.
2. **Info panel** — a dismissible "how to read this" strip at the top of each new
   surface (coverage, composer, `/today`), stating in one sentence what the
   screen is for and how to read its main visual. Dismissal is remembered per
   surface.
3. **Wizard** — a short guided flow where a screen would otherwise present an
   empty state with no obvious first move:
   - **First-run goal profile** — confirm or adjust the six targets, with the
     cyclist rationale for each default.
   - **First routine** — walk the composer once: pick duration → see the ranking
     → add three → save.
   - **First block template** — capture the user's handful of standing strength
     sessions, since that is what makes coverage correct at zero marginal effort.

**Rules.** Help never blocks: tooltips on hover *and* focus, wizards skippable
and re-runnable from the surface they belong to, info panels dismissible. Copy
names things the way the user recognises them ("last done 9 days ago"), not the
way the system stores them (`days_since / target_days`). Any hint that would
merely restate its label is not written.

**Implementation.** `components/ui/tooltip.tsx` (Radix) plus
`components/training/hint.tsx` for the labelled-term case, so the pattern is one
component and the copy lives in one place per concept — see
`lib/training/glossary.ts`.

---

## 2. Where it attaches

Existing surfaces and their extension points, verified against the code.

| Surface | File | How it extends |
|---|---|---|
| Calendar data flow | `components/calendar/calendar-client.tsx:48` | Already fans out four independent date-keyed maps (scheduled, activities, wellness, races). A fifth, `blocksByDate`, follows the same shape. |
| Day cell | `components/calendar/calendar-day.tsx:157` | Already stacks three heterogeneous card types in one column. Day-parts become three labelled sub-groups in that column. |
| Drag and drop | `components/calendar/calendar-grid.tsx:88` | Ids are already namespaced `type:id` with `day:<dateKey>` droppables. Add `block:<id>` draggables and `day:<dateKey>:<part>` droppables. |
| Week summary | `components/calendar/calendar-week-summary.tsx` | Gains a per-modality breakdown and total session load below the existing planned/actual TSS block. |
| Week archetypes | `plan_weeks.theme` | Already free text carrying "build" / "recovery" / "race week". Constrain to a checked vocabulary; no sibling table. |
| Non-cycling plan items | `plan_day_items.kind` | Already `cycling \| strength \| other`, commented *"kind=strength reserved for future use"*. Add `block_template_id` / `routine_id`. |
| Plan activation | `lib/plans/activation.ts` | Already counts `nonCyclingSkipped`. Extend to materialise non-cycling items as blocks with `created_by='rule'`. |
| Fitness page | `lib/fitness/pmc.ts`, `components/fitness/fitness-chart.tsx` | Total session load renders as a **parallel, separately-labelled series**. `recomputeFitness` is not touched (P4). |

### Refactors required first

- **`CalendarDay` prop count.** Ten props today, ~16 after blocks and day-parts.
  Collapse to a grouped `dayData` prop before v0 lands.
- **`cycling_requires_archetype`.** The check constraint on `plan_day_items`
  needs a non-cycling sibling once other kinds carry real payloads.
- **`getWorkoutMetrics`** (`components/calendar/utils.ts`) recomputes TSS per
  render inside components. This is the pattern §7.2 of the spec forbids. Do not
  extend it, and do not copy it for load — new derived values go through
  `lib/training/derive.ts`.

### Explicitly not touched

`WorkoutSchema` (`lib/workouts/types.ts:34`) requires `intervals`, a cycling
`category`, and derives duration/TSS from intervals. A yoga row would be an
all-null husk leaking into the workout picker, the archetype matcher,
`is_library` filters and ZWO export. **`workouts` stays bike-only.** Exercises,
routines and block templates are their own tables.

---

## 3. Module layout

```
lib/training/
  taxonomy.ts     regions, stimulus types, modalities, day-parts, statuses
                  — as const arrays + zod enums (D2)
  types.ts        PlannedItem, CoverageCell, WeekLoad, Completion
  read.ts         the union (D1) — the only place bike/non-bike differ
  derive.ts       PURE: coverage vectors, staleness, weekly load by modality,
                  carry-over queue. No IO, no Supabase, fully unit-testable.
  service/        server-only mutations (§7.1) — schedulePlannerBlock,
                  composeRoutine, applyArchetype, recordCompletion, …
  goal-profile.ts default target intervals + user override resolution
  load.ts         sRPE × minutes; bike RPE resolution per D3

app/today/        the mobile surface
app/training/     coverage map + goal-profile editor + exercise bank
```

`derive.ts` follows the shape of `lib/plans/activation.ts` and
`lib/fitness/pmc.ts`: pure functions over already-fetched rows, with one server
action doing the single fetch. No triggers, no materialised views, no caching
layer — the math is 70 cells over a few hundred rows.

Server actions stay thin (`app/<route>/actions.ts`: auth + IO), calling into
`lib/training/service/`. The coach becomes a second caller of those same
functions with `created_by: 'coach'`, which forces its output into the ghost
flow. Nothing in v0–v3 requires a model at runtime.

---

## 4. Schema

Following repo conventions: `text` + `check`, RLS on every table,
`set_updated_at()` triggers, `<table>_<cols>_idx` index naming.

```sql
exercise         (id, user_id null, name, regions text[], stimulus text check(…),
                  default_dose jsonb, equipment text[], difficulty smallint,
                  cues text, notes text, media_url text,
                  scope text check (scope in ('prehab','strength')),
                  -- ownership, mirroring public.workouts exactly (see D7)
                  is_preset bool not null default false,
                  is_public bool not null default false,
                  derived_from uuid references public.exercise(id) on delete set null,
                  archived_at timestamptz)

routine          (id, user_id null, name, est_duration_min smallint,
                  coverage_vector jsonb,
                  -- same two-tier ownership as exercise (D7); the four seeded
                  -- named routines ship as presets and are the default path (D8)
                  is_preset bool not null default false,
                  is_public bool not null default false,
                  derived_from uuid references public.routine(id) on delete set null,
                  archived_at timestamptz)

routine_item     (id, routine_id, position smallint, exercise_id, dose jsonb,
                  repeat_group smallint null)

-- D8: coarse things tag AREAS (6 options), fine things tag REGIONS (14).
-- A strength template is tagged "hips & glutes, posterior chain, trunk" —
-- six checkboxes, not fourteen. Exercises keep region-level tags.
block_template   (id, user_id, modality text check(…), name, duration_min,
                  area_tags text[], default_rpe numeric)

series           (id, user_id, template_id, routine_id, cadence_per_week
                  smallint, preferred_days smallint[], horizon_weeks smallint,
                  active bool)

block            (id, user_id, date, day_part text check(…),
                  modality text check (modality in
                    ('strength','mobility','yoga','prehab')),   -- not bike, D1
                  name, planned_duration_min, planned_rpe numeric,
                  area_tags text[], routine_id null, series_id null,
                  template_id null,
                  status text check (status in
                    ('planned','ghost','done','partial','skipped')),
                  created_by text check (created_by in ('user','rule','coach')),
                  accepted_at timestamptz null,
                  detached_from_series bool default false)

completion       (id, user_id,
                  block_id null, scheduled_workout_id null,   -- exactly one
                  source text check (source in
                    ('manual','whoop','strength-tool','intervals')),
                  status text check(…), actual_duration_min smallint,
                  srpe numeric, exercises jsonb null, completed_at,
                  constraint one_target check (num_nonnulls(block_id,
                    scheduled_workout_id) = 1))

-- D8: goals are per FOCUS AREA (6 rows), not per region × stimulus (70 cells).
-- exercise.regions and exercise.stimulus stay granular; areas are a roll-up.
coverage_goal    (user_id, area text check (area in
                    ('hips_glutes','posterior_chain','trunk','thoracic',
                     'neck_shoulders','extremities')),
                  target_days smallint, is_default bool,
                  primary key (user_id, area))

-- D1: bike gains the two shared columns
alter table scheduled_workouts
  add column day_part text check (day_part in ('am','midday','pm')),
  add column status   text check (status in ('planned','done','partial','skipped'));

-- D3: bike sRPE
alter table activities
  add column rpe numeric,
  add column rpe_estimated bool default false;
```

`completion.source` is constrained from day one though only `manual` is
implemented — cheap future-proofing for the Whoop replacement and the strength
tool.

The exercise bank ships as a seed migration (fixture), following the
`seed_workout_archetypes` / `seed_workouts_*` pattern. Curating it is a one-off
content job, not a runtime feature; every entry is reviewed before it lands.

---

## 5. Build order

### v0 — Foundation

The architectural commitments land here, in the first commit, not retrofitted.

- `lib/training/taxonomy.ts`, `types.ts`, `derive.ts`, `service/` skeleton.
- Migration: `block`, `block_template`, `completion`, `coverage_goal`;
  `scheduled_workouts` + `day_part`/`status`.
- `lib/training/read.ts` union (D1) and the `getTrainingWindow` server action.
- Calendar: modality filter chips, day-part grouping, block cards, DnD for
  blocks. `CalendarDay` prop refactor.
- Block templates with area tags; manual tick.
- Week summary: per-modality volume breakdown.

*Exit criterion:* a strength session can be scheduled, ticked, and shows in the
weekly breakdown — and nothing in the cycling flow changed.

### v1 — Where the value is

Ordered by what actually drives the outcome — the default path first, the
composer after it (D8 demotes the composer; the spec had it leading).

- Exercise bank: seed migration + editor (create, duplicate-and-edit, retire),
  filterable by region, stimulus, equipment and difficulty. See D7.
- **Four seeded named routines** (`Post-ride 10`, `Hips & glutes 12`, `Upper 8`,
  `Tendon & trunk 10`) shipped as presets, rotating. This is the default path.
- **Six-area coverage view** + goal-profile editor (six targets, defaults
  visibly marked, editable, resettable). "Stretch only" marker per area.
- Compact coverage widget on the dashboard.
- **Minimal `/today`** (D6): today's blocks, tick, optional sRPE — leading with
  the stalest routine, so the common case is one tap and no composition.
- Ranked composer, for building and editing routines: target duration + optional
  areas → bank re-ranks stalest-first, filtered by equipment; live duration and
  coverage readout. Deterministic ranking, no round-trip.
- Prehab routines, schedulable and reusable.
- Load metrics: sRPE × minutes, bike RPE persistence + IF fallback (D3),
  parallel total-load series on the Fitness page.

*Exit criterion:* "thoracic spine mobility: 19 days" is visible without asking
for it, and composing a prehab session takes under a minute.

### v2 — Self-healing

- Series (N-per-week cadence, preferred days as hint, 3–4 week materialisation).
  No RRULE editor.
- Ghost blocks; carry-over tray with the three containment rules (carry once,
  expire after 7 days, series instances expire faster).
- Week archetypes on `plan_weeks.theme`; activation materialises non-cycling
  plan items as ghosts.
- Week shifting extended to series-generated blocks.

### v3 — Polish

- Full `/today`: swap-by-staleness, carry-over tray.
- Adjacency warnings — six rules, soft, dismissible, never blocking.

An AI coach plugs in any time after v1 as a second caller of
`lib/training/service/`, producing ghosts. Not before.

---

## 6. Risks

- **The union (D1) leaks.** If branching on block-vs-scheduled-workout escapes
  `read.ts`, the indirection stops paying for itself. Watch for it in review.
- **Exercise bank curation is the long pole in v1.** It is content work, not
  code, and it gates the composer's usefulness. Start it in parallel with v0.
- **Estimated bike RPE could quietly dominate total load.** If most rides
  resolve via the IF fallback rather than reported values, the cross-modality
  ratio is measuring the fallback curve. Track the reported/estimated split.
- **Ticking may not stick.** v1's `/today` exists to test exactly this. If
  blocks are not reliably ticked by the end of v1, v2's carry-over mechanism
  should be reconsidered rather than built on sand.

---

## 7. Compatibility with the future strength tool

Decisions made here so the two tools do not diverge (spec §8):

1. One `exercise` table with a `scope` column — not two tables.
2. One shared region vocabulary in `lib/training/taxonomy.ts`.
3. Strength sessions contribute area recency; `block_template` covers this
   coarsely until per-exercise detail exists, at which point the finer data
   overrides the tags.
4. Shared completion contract: `{source, status, actual_duration_min, srpe,
   exercises[]?}`. Any tool writes it; the planner reads it.
5. sRPE × minutes is the ecosystem-wide load currency.
6. Same service-layer + provenance pattern in both tools.
