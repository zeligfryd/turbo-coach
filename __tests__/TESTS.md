# Test Suite Overview

## Running Tests

```bash
npm run test:run     # All unit tests (fast, no network)
npm run test:eval    # LLM evaluation tests (requires OPENAI_API_KEY)
npm test             # Interactive watch mode
```

## Test Structure

```
__tests__/
  fixtures/          # Shared test data
    athletes.ts      # 6 athlete power curve fixtures
    courses.ts       # 4 race course fixtures (GpxData)
    gpx-strings.ts   # GPX XML builders and pre-built strings
  power/
    coggan-scoring.test.ts         # Scoring boundary tests
    coggan-classification.test.ts  # Profile type classification
    coggan-profile.test.ts         # buildPowerProfile integration
    race-tactics.test.ts           # Tactic note lookup
  race/
    readiness.test.ts              # Race readiness scoring
  gpx/
    parser.test.ts                 # GPX parsing and segment detection
  pacing/
    scale.test.ts                  # Ambition scaling
    weight-advisory.test.ts        # Weight threshold cascade
    prompt.test.ts                 # Prompt construction
    parse.test.ts                  # Response parsing
  evaluation/
    constraints.ts                 # Reusable LLM output assertions
    pacing-eval.test.ts            # Live LLM evaluation tests
```

---

## Fixtures

### Athletes (`fixtures/athletes.ts`)

Six athlete profiles designed to trigger specific classification branches in `buildPowerProfile`. Each has carefully chosen W/kg values that produce exact target scores against the Coggan threshold tables.

| Fixture | Weight | Scores (5s/1min/5min/20min) | Classification trigger |
|---|---|---|---|
| SPRINTER | 86kg | 6/5/3/3 | shortAvg - longAvg >= 2 |
| ANAEROBIC | 78kg | 3/5/3/3 | s1m >= s5 && s1m-s5m >= 2 && s1m-s20m >= 2 |
| PUNCHEUR | 72kg | 3/5/4/3 | s1m >= s20m+1 && s5m >= s20m |
| CLIMBER | 62kg | 2/3/5/5 | longAvg - shortAvg >= 1.5 |
| TIME_TRIALIST | 80kg | 4/2/3/4 | Fallback: shortAvg <= longAvg && s20m >= s5m |
| ALL_ROUNDER | 75kg | 4/4/4/4 | max - min <= 1 |

**Why these values:** The classifier has a priority ordering (All-rounder first, then Sprinter, Anaerobic, Climber, TT, Puncheur, Fallback). The Time Trialist is hardest to trigger directly because the Climber check often catches long-power-dominant profiles first. The fixture uses the fallback path with scores [4,2,3,4] where no primary check matches.

### Courses (`fixtures/courses.ts`)

Four courses as pre-built `GpxData` objects (no GPX parsing needed). Each targets specific pacing logic:

| Course | Distance | Elevation | Purpose |
|---|---|---|---|
| FLAT_TT | 50km | 200m | Duration bucket targeting, TT pacing |
| HILLY_ROAD_RACE | 120km | 2500m | Climb ranges, weight advisory trigger |
| CRIT | 1.5km | 5m | Short race, high %FTP |
| MOUNTAIN_GF | 150km | 3500m | Heavy weight advisory, long climb pacing |

### GPX Strings (`fixtures/gpx-strings.ts`)

Pre-built XML strings for parser tests, plus helper functions (`buildGpxString`, `buildRteptGpxString`, `generateLine`) for creating custom GPX data.

---

## Unit Tests

### Coggan Scoring (`power/coggan-scoring.test.ts`)

Tests `scoreProfile` from `lib/power/coggan.ts` against the 6-point W/kg reference tables.

**What's tested:**
- Exact threshold boundary values (e.g., male 5min at 3.5 W/kg = score 3)
- Values just below boundaries (3.49 = score 2) and just above (3.51 = still 3)
- Score 1 for zero W/kg
- Score 6 for very high values
- Female thresholds (lower than male — 2.8 W/kg female 5min = score 3 vs male = score 2)
- Missing durations default to W/kg 0 = score 1
- Null W/kg handled as 0
- Gender defaults to male

**Why boundary tests matter:** The scoring function uses `>=` comparisons against threshold arrays. Off-by-one or wrong comparison operators would silently shift all downstream classification and pacing targets.

### Coggan Classification (`power/coggan-classification.test.ts`)

Tests `buildPowerProfile(...).type` to verify the classification priority chain.

**What's tested:**
- All 6 fixtures produce the expected profile type
- All-rounder boundary (max-min=1 vs max-min=2)
- Sprinter/Anaerobic edge (shortAvg-longAvg exactly 2.0 vs 1.5)
- Priority ordering (All-rounder before Sprinter, Climber before TT)
- Fallback paths for uncommon score combinations

**Why priority ordering matters:** The classifier uses sequential if/else checks. A Climber profile could be misclassified as Time Trialist (or vice versa) if the checks are reordered.

### Coggan Profile (`power/coggan-profile.test.ts`)

Tests `buildPowerProfile` end-to-end.

**What's tested:**
- `estimatedFtp`: 20min peak 285W = round(285*0.95) = 271
- `estimatedFtp` returns null when 20min is 0 or missing
- `weakness` identifies the lowest-scoring dimension
- `scores42d` computed independently from `last42dCurve` (not all-time)
- `allTimePeaks` and `peakWkg` correctly populated
- `description` matches profile type

### Race Tactics (`power/race-tactics.test.ts`)

Tests `getRaceTacticNote` lookup.

**What's tested:**
- All 6 profile types with "default" event return non-empty strings
- Specific combos (Sprinter+crit mentions "sprint", TT+time_trial mentions "steady")
- Unknown event type falls back to "default"
- Unknown profile type falls back to "All-rounder"
- All profile x known event combinations complete without throwing

### Readiness Score (`race/readiness.test.ts`)

Tests `computeReadinessScore` which has 3 independent components (fitness 0-40, freshness 0-40, taper 0-20) each with multiple branches.

**What's tested:**
- Null handling (all null = 50, null CTL treated as 0)
- Fitness: linear CTL/120*40 capped at 40 (CTL 0/60/120/200)
- Freshness close to race (<=3 days): 5 TSB ranges
- Freshness medium (4-14 days): 4 TSB ranges
- Freshness far (>14 days): always 30
- Taper: 4 day-range buckets (0-2, 3-6, 7-21, >21)
- Composite scenarios (peak readiness, overtrained, undertrained)
- Score bounds (never <0 or >100)

**Why exhaustive:** Each of the 12+ branches contributes independently to the score. A single wrong boundary would shift readiness by 5-20 points, directly affecting race preparation advice.

### GPX Parser (`gpx/parser.test.ts`)

Tests `parseGpx` from `lib/gpx/parser.ts`.

**What's tested:**
- Flat route: all flat segments, ~0m elevation, correct distance
- Single climb: detects climb segments, positive elevation gain
- Climb + descent: both segment types detected
- Minimum file (2 points): succeeds
- Error cases: single point throws, empty GPX throws, empty string throws
- `<rtept>` fallback when no `<trkpt>` elements
- GPS spike smoothing (elevation 9999 → smoothed by moving average)
- Segment merging (consecutive same-type chunks merge into one)
- Segment properties: all required fields, segments cover the route, climb labels include gradient

### Pacing Scale (`pacing/scale.test.ts`)

Tests `scalePlan` from `lib/pacing/scale.ts`.

**What's tested:**
- All 4 ambition levels apply correct multipliers
- Realistic (1.0) returns identical values
- Strategy string unchanged by scaling
- All numeric outputs are integers (rounded)
- Non-scaled fields preserved (label, startKm, endKm, advice)
- Original plan not mutated

### Weight Advisory (`pacing/weight-advisory.test.ts`)

Tests `buildWeightAdvisory` threshold cascade.

**What's tested:**
- STRONG tier: 85kg+2500m and above
- MODERATE tier: 80kg+2000m to just below STRONG
- LIGHT tier: 75kg+1500m to just below MODERATE
- No advisory: below all thresholds, null weight, high weight with low elevation
- Tier priority: STRONG prevents MODERATE, MODERATE prevents LIGHT

**Why cascade matters:** The weight advisory shifts climb targets by 5-10%. If tiers overlap or priority is wrong, heavy riders could get overly aggressive targets on mountain courses.

### Pacing Prompt (`pacing/prompt.test.ts`)

Tests `buildPacingPrompt` and `resolveFtp`.

**What's tested:**
- FTP resolution: manual preferred over estimated, null handling
- Required sections present (FTP, Weight, Route segments, Rules)
- Manual vs estimated FTP labelling
- Power profile integration (type, scores, weakness, modifiers, peaks)
- Profile section absent when no profile
- Weight advisory included when thresholds met
- All GPX segments appear in prompt
- Unknown weight shows "unknown"

### Pacing Parse (`pacing/parse.test.ts`)

Tests `parsePacingResponse` from `lib/pacing/parse.ts`.

**What's tested:**
- Valid JSON parsed correctly
- JSON wrapped in markdown fences
- JSON with leading text preamble
- Missing JSON throws
- Missing segments throws
- Non-numeric overallTargetNpW throws
- String numbers coerced to Number
- Extra fields ignored
- Decimal values rounded to integers
- Empty string throws
- Empty segments array allowed

---

## LLM Evaluation Tests

### Constraint Helpers (`evaluation/constraints.ts`)

Reusable assertion functions for validating LLM-generated pacing plans:

| Helper | What it checks |
|---|---|
| `assertValidSchema` | All required fields present and typed |
| `assertPowerConsistency` | watts ~ round(FTP * percent/100) ± 5W |
| `assertFlatTargetInRange` | Flat segments within duration bucket |
| `assertClimbTargetsInRange` | Climb segments within short/medium/long ranges |
| `assertClimbAdviceContainsWkg` | Climb advice mentions W/kg |
| `assertSegmentCoverage` | Segments cover full route ± 5km |

### Evaluation Tests (`evaluation/pacing-eval.test.ts`)

**Requires:** `OPENAI_API_KEY` environment variable. Skipped automatically without it.

**Structural tests** (one per course type):
- Flat TT: valid schema, power consistency, flat targets in range, segment coverage
- Hilly road race with Climber profile: climb targets in range, climb advice mentions W/kg
- Crit with Sprinter: valid schema, finish time under 120 min
- Mountain gran fondo with heavy rider: weight advisory awareness in advice text

**Cross-profile comparisons:**
- Climber vs Sprinter on hilly course: climber's long-climb % >= sprinter's
- TT specialist vs All-rounder on flat TT: TT's flat % >= all-rounder's

**Ambition scaling:**
- Same plan across 4 ambition levels: conservative < realistic < aggressive < all_out power targets
