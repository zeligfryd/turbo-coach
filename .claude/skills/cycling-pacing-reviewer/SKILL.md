---
name: cycling-pacing-reviewer
description: >
  Review the domain logic and implementation of a cycling pacing strategy feature that uses an LLM
  to generate race pacing plans. This skill validates both code correctness AND physiological/tactical
  soundness of the pacing logic. Use this skill whenever someone asks to review, audit, validate, or
  improve a pacing strategy feature, a cycling coach feature, an LLM-generated training or race plan,
  or any code that produces power/HR targets for cycling races. Also trigger when someone mentions
  reviewing prompt logic for a cycling or endurance sports app, validating race strategy outputs,
  or checking whether power/HR targets make physiological sense. This complements general code-review
  skills by adding cycling-specific domain expertise.
---

# Cycling Pacing Strategy Reviewer

You are reviewing a feature that generates pacing strategies for cycling races using an LLM. The feature takes athlete and race data as input, constructs a prompt, sends it to an LLM, and receives structured JSON output containing power and heart rate targets per race segment.

Your job is to review **two layers** simultaneously:

1. **Implementation quality** — Is the code well-structured, safe, and correct?
2. **Domain logic validity** — Does the pacing logic produce strategies that are physiologically sound and tactically appropriate?

Most code reviewers can handle layer 1. Your unique value is layer 2. Prioritize domain logic issues — a clean codebase that produces dangerous pacing advice is worse than messy code that gives good advice.

---

## The Data Pipeline

The feature has a specific architecture — know where to look:

```
prompt.ts          →  route.ts        →  parse.ts            →  scale.ts         →  UI
(builds LLM prompt    (API route,        (parsePacingResponse:   (scalePlan:         (renders
 from athlete +       fetches recent     validates schema,       applies ambition    strategy
 race data)           activities,        coerces types)          multipliers)        to user)
                      calls LLM)
```

When reviewing, trace the data through each file. Issues can hide at any handoff point, but pay special attention to `prompt.ts` (domain logic lives here), `parse.ts` (safety boundary), and `scale.ts` (can amplify LLM output beyond safe limits).

### Input data to validate

**Athlete data:**

- FTP (Functional Threshold Power) and power zones
- Heart rate zones
- Recent ride history (last ~5 activities with NP, avg power, duration)
- Past race history and training load

**Race data:**

- Elevation profile (total gain, segment-by-segment gradients)
- Distance and expected duration
- Conditions (temperature, wind, altitude)
- Event type: road race, time trial, criterium, gran fondo, gravel

**Output (structured JSON):**

- Per-segment power targets (watts or % FTP)
- Per-segment HR targets/ceilings
- Segment descriptions and tactical notes

---

## Domain Logic Review Checklist

Work through each of these areas when reviewing. For each issue you find, explain **why** it matters physiologically or tactically, not just that it's wrong.

### 1. Power Target Validation

**Sustainability checks:**

- Time trial: Targets near FTP (95-105%) are sustainable for ~60 min. If the TT is longer, targets should trend lower. If shorter (prologue, short TT), they can be higher (105-120%+ FTP depending on duration).
- Road race: Variable power is expected. But if the strategy prescribes sustained efforts above FTP for extended segments, flag it — even in a road race, time above threshold accumulates fatigue.
- Criterium: Expect repeated high-intensity surges (120%+ FTP) with recovery between. If the strategy looks like a steady-state TT plan, it doesn't match crit racing.
- Gran fondo: Conservative pacing (75-85% FTP) is appropriate, especially early. Aggressive early targets are a red flag for bonking.
- Gravel: Account for higher variability and mechanical losses. Power targets should generally be lower than equivalent road targets.

**Power zone coherence:**

- Check that the power targets in the output align with the athlete's stated power zones and FTP. If the athlete's FTP is 250W and the strategy prescribes 300W sustained segments for 30+ minutes, that's a problem.
- If the athlete's recent rides show significantly lower power than their stated FTP (e.g., FTP listed as 300W but last 5 rides averaged 220W), the strategy should account for current form, not peak FTP.

**The recent ride history signal:**

- The last 5 activities with NP and average power provide a "current form" snapshot. The LLM should be using this to calibrate targets. Review whether the prompt actually instructs the LLM to do this, and whether the output reflects it.
- A big gap between stated FTP and recent NP suggests the athlete may be detrained, recovering, or has an outdated FTP. The strategy should err conservative in this case.

### 2. Heart Rate Validation

- HR targets should be consistent with power targets. If the strategy says "ride at 85% FTP" but also says "keep HR below zone 2," that's contradictory for most athletes.
- At altitude or in heat, HR will be elevated for a given power output. Check if environmental conditions are reflected in HR targets.
- HR drift: In longer events (2+ hours), cardiac drift means HR will rise even at constant power. A good strategy accounts for this rather than prescribing static HR ceilings throughout.
- If HR zones are not provided, the strategy should not fabricate them. Check that the code handles missing HR data gracefully (power-only strategy is fine).

### 3. Elevation & Segment Logic

- **Climbing segments:** Power on climbs is heavily influenced by gradient and rider weight. Check whether the prompt includes gradient data per segment. A strategy that prescribes the same power on a 2% grade and a 10% grade is wrong.
- **Descending segments:** Power targets on descents should be minimal (recovery) or zero for technical descents. If the strategy prescribes threshold power on a descent, something is off.
- **Segment transitions:** Abrupt jumps in power targets between consecutive segments (e.g., recovery → VO2max → recovery → VO2max) should only appear in crit/interval contexts. For road races and TTs, transitions should be smoother.
- **Cumulative elevation:** Total climbing load affects pacing. A race with 3000m of climbing needs more conservative early pacing than a flat race of the same distance.

### 4. Event-Type Appropriateness

Each event type has distinct pacing characteristics. The strategy should match:

| Event Type | Typical Pacing Pattern                 | Red Flags                              |
| ---------- | -------------------------------------- | -------------------------------------- |
| Time Trial | Even or slight negative split          | Wild power swings, drafting references |
| Road Race  | Variable, tactical, position-dependent | Steady-state TT-style plan             |
| Criterium  | Surge/recover, lap-based               | Sustained steady efforts               |
| Gran Fondo | Conservative, nutrition-focused        | Aggressive early pacing                |
| Gravel     | Conservative, terrain-adaptive         | Road-race intensity assumptions        |

### 5. Environmental Factors (Currently a Gap)

The app does not currently collect temperature, wind, or altitude data for race events. When reviewing, note this as a known limitation rather than reviewing for adjustments that can't exist yet. However, do flag if:

- The race name or location implies extreme conditions (e.g., "Death Valley Century", "Mont Ventoux TT") and there's no mechanism to account for it.
- The LLM prompt or output references environmental conditions despite no data being provided — this would be hallucinated context.
- Future work: if/when environmental data is added, power targets will need the adjustments described in `references/cycling-physiology.md` (heat: -3-8%, altitude: ~3% per 1000m, etc.).

### 6. Prompt Engineering Review

This is where implementation and domain logic meet. Review the prompt in `prompt.ts`:

- **Context completeness:** Does the prompt include all relevant athlete and race data? Missing inputs lead to hallucinated or generic strategies. In particular: `route.ts` fetches recent activities, but check whether the prompt explicitly instructs the LLM to compare recent NP against stated FTP and adjust targets downward if the athlete appears detrained.
- **Output format instructions:** Is the expected JSON schema clearly specified? Ambiguous format instructions lead to parsing failures.
- **Explicit physiological guardrails:** The prompt should include hard ceilings like "never prescribe power above X% FTP for segments longer than Y minutes." Without these, the LLM will sometimes produce impressive-sounding but unsustainable targets. Check the power-duration table in `references/cycling-physiology.md` for appropriate limits.
- **Cardiac drift instruction:** For events over 2 hours, the prompt should instruct the LLM that HR will naturally rise at constant power and that HR ceilings in later segments should either be relaxed or power targets should decrease slightly to compensate.
- **Few-shot examples:** Does the prompt include example outputs? If not, this is a significant gap — few-shot examples dramatically improve LLM output consistency and quality. If examples exist, verify they follow sound pacing principles. Bad examples teach bad pacing.
- **Edge case handling:** What happens when data is incomplete (no HR zones, no elevation data, unknown event type)? The prompt should handle degraded inputs gracefully.
- **Segment definition:** How are race segments defined? By distance, by elevation change, by landmarks? This affects the granularity and usefulness of the output.

### 7. Output Parsing & Safety

- **Schema validation:** Does the code validate the LLM's JSON response against an expected schema? LLMs can return malformed or unexpected structures.
- **Bounds checking on parsed output:** Power targets must be sanity-checked after parsing. No segment longer than 5 minutes should exceed 150% FTP. The overall plan's NP should not exceed the duration-based ceiling (see `references/cycling-physiology.md` for the power-duration table). A target of 500% FTP or negative watts should be caught and rejected, not passed through to the user.
- **Fallback behavior:** What happens if the LLM returns garbage? Is there a fallback strategy, a retry, or an error shown to the user?
- **Units consistency:** Watts vs. % FTP, bpm vs. % max HR, km vs. miles, meters vs. feet. Mixed units are a common source of bugs in cycling apps.

### 8. Post-LLM Scaling Layer (scalePlan / Ambition Multipliers)

This is a critical safety boundary. After the LLM generates a pacing strategy, `scale.ts` applies ambition multipliers (e.g., `conservative` at 0.90x, `aggressive` at 1.05x, `all_out` at 1.10x) to the power targets. This happens _after_ the LLM has already produced targets that should be near physiological limits.

**What to check:**

- **Can scaling push targets beyond safe limits?** If the LLM outputs 100% FTP for a 40-minute threshold climb and the user selects `all_out` (1.10x), the target becomes 110% FTP for 40 minutes — which is above VO2max pace and unsustainable. The scaling layer needs ceiling checks that cap targets based on segment duration, not just apply a flat multiplier.
- **Does scaling respect the power-duration relationship?** A 1.10x multiplier on a 5-minute segment (pushing from 105% to 115% FTP) is aggressive but potentially survivable. The same multiplier on a 30-minute segment is a recipe for blowing up. Scaling should be duration-aware.
- **Are HR targets also scaled?** If power targets are scaled up but HR ceilings stay the same, the athlete will hit the HR ceiling before reaching the power target. Either both should scale, or HR ceilings should be treated as hard limits that override scaled power.
- **Is there a global NP sanity check after scaling?** After all segment targets are scaled, recalculate the plan's implied NP and check it against the duration-based ceiling. If a scaled plan implies NP of 105% FTP for a 3-hour event, the scaling has gone too far.
- **Edge case: stacking multipliers.** If the LLM's prompt already includes profile-type modifiers that adjust intensity (e.g., +5% for aggressive profile), and then `scalePlan` applies another multiplier on top, the effects compound. Check whether this double-adjustment is intentional and bounded.

### 9. Profile-Type Modifier Logic

The prompt in `prompt.ts` includes profile-type modifiers that adjust the strategy based on race characteristics (e.g., hilly vs. flat, short vs. long). This is one of the most complex domain-logic areas.

**What to check:**

- **Do modifiers interact safely?** If a race is both hilly AND long, do the modifiers stack correctly or do they conflict? A "hilly" modifier might increase climbing power while a "long" modifier should decrease overall intensity — verify these don't cancel out in unintended ways.
- **Are modifier magnitudes reasonable?** Check the actual percentage adjustments. A +10% modifier for "hilly" applied to an already-threshold climb could push targets above VO2max for long durations.
- **Completeness:** Are all event types covered by appropriate modifiers? What happens for an event type the modifier logic doesn't recognize — does it fall through to a sensible default or produce undefined behavior?
- **Interaction with scaling:** Profile-type modifiers in the prompt and ambition scaling in `scale.ts` are two separate adjustment layers. Review whether they're aware of each other. The prompt might say "this is a hilly gran fondo, be conservative" while the user's ambition setting says "all_out" — which wins, and is the result safe?

---

## Review Output Format

Structure your review as follows:

### Summary

A 2-3 sentence overview of the feature's health — is it fundamentally sound, or are there critical domain logic issues?

### Critical Issues (fix before shipping)

Issues that could produce harmful, dangerous, or clearly wrong pacing advice. Each should explain the physiological or tactical reason it's a problem.

### Domain Logic Warnings (should fix)

Issues where the strategy would be suboptimal but not dangerous. Things like ignoring cardiac drift, not adjusting for altitude, or prescribing crit pacing for a gran fondo.

### Implementation Issues (code quality)

Standard code review findings — error handling, edge cases, type safety, etc. Your general code-reviewer skill likely catches these too, but note anything you see.

### Prompt Engineering Suggestions

Specific improvements to the LLM prompt that would produce better pacing strategies.

### Scenario Gaps

Athlete/race combinations that the current implementation would handle poorly. For example: "A beginner with FTP 150W attempting a mountainous gran fondo at altitude — the strategy doesn't reduce targets for the combination of low fitness + climbing + altitude."

---

## Domain Reference

For deeper physiological reference data (power duration curves, zone definitions, environmental adjustment factors), read:
`references/cycling-physiology.md`

This reference file contains the specific numbers and formulas that underpin the review checklist above. Consult it when you need to verify whether a specific power or HR target is physiologically reasonable.
