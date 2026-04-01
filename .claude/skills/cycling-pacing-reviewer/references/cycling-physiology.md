# Cycling Physiology Reference

Quick-reference data for validating pacing strategy outputs. Use these numbers as guardrails, not absolutes — individual variation exists, but values far outside these ranges warrant flagging.

---

## Power Zones (Coggan Classic Model)

| Zone | Name            | % FTP    | Typical Max Duration |
| ---- | --------------- | -------- | -------------------- |
| 1    | Active Recovery | <55%     | Unlimited            |
| 2    | Endurance       | 56-75%   | 3-6+ hours           |
| 3    | Tempo           | 76-90%   | 1-3 hours            |
| 4    | Threshold       | 91-105%  | 20-60 min            |
| 5    | VO2max          | 106-120% | 3-8 min              |
| 6    | Anaerobic       | 121-150% | 30s-2 min            |
| 7    | Neuromuscular   | 150%+    | <15s                 |

**Key validation rule:** If a pacing strategy prescribes sustained power in a zone beyond its typical max duration, flag it. Example: Zone 5 (110% FTP) for a 20-minute climb is not sustainable for most riders.

---

## Power-Duration Relationship

Approximate maximum sustainable power as a fraction of FTP by effort duration:

| Duration   | Typical % FTP (trained cyclist) |
| ---------- | ------------------------------- |
| 5 seconds  | 200-300%+                       |
| 1 minute   | 130-175%                        |
| 5 minutes  | 110-130%                        |
| 20 minutes | 100-108%                        |
| 60 minutes | 95-100%                         |
| 2 hours    | 80-90%                          |
| 3 hours    | 75-85%                          |
| 4 hours    | 70-80%                          |
| 5+ hours   | 65-75%                          |

These are **maximum** sustainable values for a single effort. Race pacing targets should be below these ceilings to account for variability and cumulative fatigue. Use these to sanity-check that no segment target exceeds physiological limits.

---

## Intensity Factor (IF) — The Race Pacing Metric

For race pacing, Intensity Factor (IF = NP / FTP) is more useful than raw %-FTP because it accounts for the variability inherent in real racing. NP (Normalized Power) represents the physiological cost of a variable effort — the constant power that would produce the same metabolic stress.

**Typical IF values by race duration (from Coggan et al.):**

| Duration / Event          | Typical IF Range |
| ------------------------- | ---------------- |
| Under 30min (prologue)    | 1.05-1.15        |
| 30min-1h (TT/short race) | 0.95-1.05        |
| 1-2h (road race / crit)  | 0.85-0.95        |
| 2-3h (long road race)    | 0.80-0.88        |
| 3-4h (gran fondo)        | 0.75-0.82        |
| 4-5h (long GF / Ironman) | 0.70-0.78        |
| 5h+ (ultra-endurance)    | 0.65-0.75        |

**Key validation rule:** If a pacing plan's overall target NP implies an IF outside the range for the estimated duration, flag it. An IF of 1.05 for a 3-hour event is not sustainable; the athlete will blow up.

**TSS budgeting (alternative approach from Endurance Nation):** For very long events (4h+), you can work backwards from a TSS budget. TSS = IF² × duration(hours) × 100. For example, a conservative Ironman bike budget of 280 TSS over 6 hours implies IF = √(280 / 600) = 0.68. A maximum budget of 300 TSS is for proven strong athletes only.

---

## Variability Index (VI)

VI = NP / Average Power. It measures how "smooth" or "stochastic" the effort was. Higher VI means more surges and recoveries.

**Why VI matters for pacing:** Variable power is metabolically more expensive than steady power at the same NP. This is because glycogen utilization, lactate production, and stress hormone levels are curvilinearly (not linearly) related to exercise intensity. A surge to 150% FTP followed by coasting costs significantly more glycogen than holding steady at the same NP — the body doesn't recover fully during the brief rest periods between surges.

**Target VI by event type:**

| Event Type         | Typical VI Range | Notes                                                |
| ------------------ | ---------------- | ---------------------------------------------------- |
| Time Trial (flat)  | 1.00-1.04        | Isopower is the goal. Lower is better.               |
| Time Trial (hilly) | 1.00-1.06        | Hills force some variability even in TTs.            |
| Gran Fondo         | 1.04-1.07        | Self-governed; minimize surges, ride to power.        |
| Gravel             | 1.05-1.10        | Terrain forces some variability; minimize it.         |
| Triathlon           | 1.04-1.07        | Smooth pedaling preserves glycogen for the run. VI 1.04-1.07 = excellent. |
| Road Race (flat)   | 1.00-1.06        | Drafting and pack dynamics keep variability lower.    |
| Road Race (hilly)  | 1.20-1.35        | Climbs and descents create large power swings.        |
| Criterium (flat)   | 1.06-1.35        | Corner accelerations and surges.                      |
| Criterium (hilly)  | 1.13-1.50        | Combines corner surges with climb/descent swings.     |
| Mountain Bike      | 1.13-1.50        | Terrain forces extreme variability.                   |

**Validation rule:** If the pacing plan for a flat TT implies VI > 1.06, the advice is too variable. If a gran fondo plan implies VI > 1.10, the athlete will burn through glycogen unnecessarily. For road races and crits, the ranges are very wide depending on terrain — use the GPX elevation data to judge whether the plan's variability is appropriate.

---

## Heart Rate Zones (5-Zone Model)

| Zone | Name      | % Max HR | % LTHR |
| ---- | --------- | -------- | ------ |
| 1    | Recovery  | <68%     | <81%   |
| 2    | Aerobic   | 68-82%   | 81-89% |
| 3    | Tempo     | 83-87%   | 90-93% |
| 4    | Threshold | 88-92%   | 94-99% |
| 5    | VO2max+   | 93%+     | 100%+  |

**Power-HR coherence check:** At steady state, power zone and HR zone should roughly correspond. Exceptions:

- First 5-10 minutes of a ride (HR lags power)
- Hot conditions (HR elevated for given power)
- Altitude (HR elevated for given power)
- Cardiac drift in long rides (HR creeps up at constant power)
- Caffeine, dehydration, illness (all elevate HR)

---

## Environmental Adjustment Factors

### Heat

| Temperature       | Power Reduction | Notes                                         |
| ----------------- | --------------- | --------------------------------------------- |
| 25-30°C (77-86°F) | 2-5%            | Manageable with good hydration                |
| 30-35°C (86-95°F) | 5-10%           | Significant impact, adjust pacing             |
| 35°C+ (95°F+)     | 10-15%+         | Dangerous territory, major adjustments needed |

HR will be elevated 5-15 bpm above normal for a given power output in heat.

### Altitude

| Altitude       | Power Reduction (unacclimatized) |
| -------------- | -------------------------------- |
| 1000m (3300ft) | ~2-3%                            |
| 1500m (5000ft) | ~5-7%                            |
| 2000m (6600ft) | ~8-12%                           |
| 2500m (8200ft) | ~12-17%                          |
| 3000m (9800ft) | ~17-22%                          |

Acclimatized riders lose less, but still lose some. If athlete acclimatization status is unknown, assume unacclimatized.

### Wind (for TTs and flat road races)

- Headwind: Power required to maintain speed increases with cube of speed. A 20 kph headwind can require 30-50% more power to maintain target speed.
- Tailwind: Reduced power requirement, but benefits diminish at high speed.
- Optimal TT pacing in wind: push slightly harder into headwind, ease off in tailwind. The asymmetry is because drag is nonlinear.

---

## Event-Specific Pacing Profiles

### Time Trial

- **Optimal:** Even or slightly negative split (second half marginally faster). "Isopower" — ride at FTP as smoothly as possible.
- **Target IF:** 0.95-1.05 for ~1h TT, scaling up for shorter, down for longer.
- **Target VI:** < 1.05, ideally 1.02-1.04.
- **The start:** The #1 pacing mistake: starting too hard. Adrenaline and endorphins mask actual exertion for the first 4-5 minutes. RPE feels deceptively easy. By the time it catches up, the damage is done. Start at 90-95% of target for the first 5 minutes of a 40km TT; less hold-back for shorter events (2 minutes for a 10-miler), but even a track pursuit needs pacing discipline.
- **The finish:** Bring pace up with 3-5 minutes to go. This is the only time to spend freely.
- **Hills in TTs:** Push up to 105% FTP on hills under 5 minutes if a descent follows (forced recovery). On hills that plateau, stay at or just above FTP — hammering up only to struggle on the flat wastes time. On descents, even at max effort you rarely exceed Active Recovery levels, so your muscles recover naturally.
- **Smooth transitions:** When approaching a hill, smoothly transition power up — do NOT surge at the base. Minimize power variability to keep VI low.
- **Common mistake:** Starting too hard, wild power surges, not understanding that steady wins over variable at the same NP.

### Road Race

- **Optimal:** Highly variable. Power surges on climbs, recovery on descents/drafting.
- **Target IF:** 0.85-0.95 for the full race (NP, not average power).
- **Average power:** 65-85% FTP. Average power is significantly lower than NP due to drafting, coasting, and surges.
- **Target VI:** 1.06-1.12. Higher variability is inherent.
- **Key consideration:** Position and drafting. 30-40% power savings in the peloton vs. solo. Using FTP to judge whether to pull in a breakaway or sit on — if the pace requires above-FTP effort even sitting in, the break is "over your head" and sitting on is the rational choice.
- **Common mistake:** Treating it like a TT. Road races reward tactical power application, not steady-state effort.

### Criterium

- **Optimal:** Surge-recover pattern. High intensity into corners and for position, recovery in draft.
- **Average power:** 70-80% FTP, but with frequent surges to 150%+ FTP.
- **Target VI:** 1.10-1.15. Constant surging is unavoidable.
- **Key consideration:** Repeated sprint ability. Strategy should account for 20-50+ hard accelerations.
- **Common mistake:** Steady-state plan. Crits are anaerobic capacity + sprint events.

### Gran Fondo

- **Optimal:** Conservative early, steady middle, effort on climbs if targeting time.
- **Target IF:** 0.75-0.82 for 3-4h events; 0.70-0.78 for 4-5h events.
- **Target VI:** 1.04-1.07. Self-governed — ride to power targets, not to feel or competitors.
- **Key consideration:** Nutrition strategy is part of pacing. Events >3 hours need 60-90g carbs/hour. In events >3h, an athlete who eats well at IF 0.75 will outperform one at IF 0.82 who bonks.
- **Smooth transitions:** Like TTs — smoothly transition power on hills rather than surging. Avoid getting caught up in group surges. Ride YOUR numbers.
- **Common mistake:** Going out too hard in the group. First 30 minutes should feel easy. Going too hard on early climbs depletes glycogen that's needed for the second half.

### Gravel

- **Optimal:** Conservative, with reserves for terrain variations.
- **Target IF:** 0.70-0.78 depending on terrain and duration.
- **Target VI:** 1.05-1.08. Terrain forces variability; minimize it where possible.
- **Key considerations:** Higher rolling resistance = more power for same speed. Drafting is minimal. Mechanical risk means energy reserves matter more than in road events.
- **Common mistake:** Using road-race intensity assumptions. Gravel is harder per kilometer.

---

## Climb Pacing — Topology Matters

How hard to push on a climb depends on what comes after:

**Hills with corresponding descents:** You can push harder (up to 105-110% of goal NP for short climbs) because you WILL recover on the descent. Even at max effort on a steep descent, you physically cannot produce much power — your muscles are forced into recovery. The descent "pays back" the effort.

**Hills that plateau or flatten:** Be conservative — stay at or just above FTP. If you hammer up the hill and then have to ride on the flat after cresting, any time spent below FTP on the flat is time given away. There is no free recovery period.

**Smooth transitions on all climbs:** When approaching a hill, smoothly transition power from flat target up to climb target. Do NOT attack or surge at the base. The acceleration at the bottom costs disproportionate glycogen and can cause early blowup. This is especially critical for TT, gran fondo, and gravel events.

**Descent power targets:** Do not set descent targets above ~55% FTP. Even hard pedaling on steep descents rarely exceeds Active Recovery levels. Use descents as fueling and recovery windows.

---

## The Adrenaline Trap (First 5 Minutes)

The single most common pacing mistake across all event types: starting too hard.

**Physiological mechanism:** Adrenaline, endorphins, caffeine, and race excitement mask actual exertion for the first 4-5 minutes. RPE will feel deceptively easy — "I am going to crush this" — but the body is accumulating oxygen debt and burning through anaerobic capacity. By the time RPE catches up to reality (~5 minutes), the damage is done. The athlete has dug a hole they cannot recover from.

**Practical impact:** A rider who starts a 40km TT at 800W off the ramp and 110% FTP for the first 3 minutes will typically settle into a pace 5-10% BELOW what they could have sustained with even pacing. The fast start doesn't just cost time on that segment — it costs time on every subsequent segment.

**Pacing prescription by event length:**
- 40km TT (~1h): Hold back for the first 5 minutes. Start at 90-95% of target.
- 10-mile TT (~25min): Hold back for the first 2 minutes.
- 4km pursuit (~4min): Almost no holding back, but even here pacing discipline matters.
- Mass-start races: Use first 5-10 minutes for positioning at 5-10% below target.

**Why the power meter is essential here:** Your power meter doesn't lie. When it says 800W off the start ramp, it's telling you reality — RPE is not reliable for the first several minutes.

---

## Glycogen, Variability, and Metabolic Cost

**Core principle:** Many critical metabolic responses — glycogen utilization, lactate production, stress hormone levels — are curvilinearly, not linearly, related to exercise intensity. This means:

- A surge to 150% FTP burns far more glycogen than double a steady effort at 75% FTP would.
- The body doesn't fully recover during brief rest periods between surges.
- Two rides with the same NP but different variability produce very different physiological costs. The more variable ride (higher VI) depletes glycogen faster.

**Practical implications for pacing:**
- In events where glycogen is the limiting factor (>2 hours), minimizing variability is as important as choosing the right average intensity.
- High-force, low-cadence watts (big gear mashing) recruit more Type II (fast-twitch) muscle fibers, which consume more glycogen per contraction than Type I (slow-twitch) fibers.
- Use gearing to keep cadence consistent across terrain changes rather than grinding a big gear on climbs.

**Validation rule:** If a pacing plan for a 4h+ event doesn't address variability management and nutrition, it is incomplete regardless of how good the power targets are.

---

## Detecting Detrained or Mismatched FTP

When recent ride data is available, check for FTP mismatch:

**Indicators of outdated/inflated FTP:**

- Last 5 rides average power < 60% of stated FTP (unless they're all recovery rides)
- Last 5 rides NP consistently < 75% of stated FTP
- No rides in the last 30 days with NP within 10% of FTP

**What the strategy should do:**

- Use a de-rated FTP for target calculations (e.g., if recent NP averages suggest FTP is ~20% lower, use that)
- Or explicitly flag to the user that their FTP may need retesting
- Never blindly trust stated FTP when ride history contradicts it

---

## Common Pacing Strategy Failures

These are patterns to watch for in LLM-generated strategies:

1. **The Generic Plan:** Strategy doesn't meaningfully differ between event types. A TT plan and a crit plan should look very different. Check that IF and VI are appropriate for the specific event type.

2. **The Overachiever:** All targets near or above FTP. Sounds impressive, leads to blowing up. A 3-hour gran fondo with an IF of 0.95 is a recipe for a DNF.

3. **The Flat-Earth Plan:** Same power target regardless of gradient. Climbing at threshold feels very different from flatland at threshold. Also fails to distinguish hills-with-descents (can push harder) from hills-that-plateau (must be conservative).

4. **The Weather-Blind Plan:** No adjustment for heat, altitude, or wind despite conditions data being available.

5. **The Nutrition-Free Plan:** Long events (>2 hours) with no mention of fueling strategy. Bonking is a pacing failure. In events >3h, nutrition is as important as power targets.

6. **The Form-Ignorant Plan:** Targets based on peak FTP when recent rides show the athlete is clearly not at peak fitness.

7. **The Robot Plan:** Perfectly even power with no tactical awareness. Real mass-start races require surges, recoveries, and positioning. (Note: for TTs and gran fondos, smooth and even IS correct — the failure is applying it to road races/crits.)

8. **The Hot Start:** No conservative opening. The strategy jumps straight to race pace from km 0 without accounting for the adrenaline trap. The first 5 minutes should always be below target.

9. **The Surge-Happy Plan:** For TT/gran fondo/gravel events, prescribes aggressive climbing targets with no mention of smooth transitions or variability cost. High VI in self-paced events wastes glycogen unnecessarily.

10. **The Descent Ignorant Plan:** Prescribes meaningful power targets on descents (e.g., 80% FTP). Even at max effort on steep descents, you rarely exceed Active Recovery power. Descents are recovery windows, not work segments.
