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

Approximate sustainable power as a fraction of FTP by effort duration:

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

These are approximate. Use them to sanity-check whether a target is in the right ballpark, not as exact limits.

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

- **Optimal:** Even or slightly negative split (second half marginally faster)
- **Power range:** 90-105% FTP depending on duration
- **Common mistake:** Starting too hard. First 5 minutes above 105% FTP in a 40km TT usually leads to a slower overall time.
- **Key metric:** Variability Index (VI) = NP/AP. Good TT has VI < 1.05.

### Road Race

- **Optimal:** Highly variable. Power surges on climbs, recovery on descents/drafting.
- **Power range:** Average 65-85% FTP with peaks of 120%+ on climbs and attacks
- **Normalized Power:** NP typically 85-95% FTP for the full race
- **Key consideration:** Position and drafting. 30-40% power savings in the peloton vs. solo.
- **Common mistake:** Treating it like a TT. Road races reward tactical power application.

### Criterium

- **Optimal:** Surge-recover pattern. High intensity into corners and for position, recovery in draft.
- **Power range:** Average might be 70-80% FTP, but with frequent surges to 150%+ FTP
- **Key consideration:** Repeated sprint ability. Strategy should account for 20-50+ hard accelerations.
- **Common mistake:** Steady-state plan. Crits are anaerobic capacity + sprint events.

### Gran Fondo

- **Optimal:** Conservative early, steady middle, effort on climbs if targeting time.
- **Power range:** 65-80% FTP for most riders
- **Key consideration:** Nutrition strategy is part of pacing. Events >3 hours need 60-90g carbs/hour.
- **Common mistake:** Going out too hard in the group. First 30 minutes should feel easy.

### Gravel

- **Optimal:** Conservative, with reserves for terrain variations.
- **Power range:** 60-80% FTP depending on terrain
- **Key considerations:** Higher rolling resistance = more power for same speed. Mechanical risk means having energy reserves matters more than in road events.
- **Common mistake:** Using road-race intensity assumptions. Gravel is harder per kilometer.

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

1. **The Generic Plan:** Strategy doesn't meaningfully differ between event types. A TT plan and a crit plan should look very different.

2. **The Overachiever:** All targets near or above FTP. Sounds impressive, leads to blowing up.

3. **The Flat-Earth Plan:** Same power target regardless of gradient. Climbing at threshold feels very different from flatland at threshold.

4. **The Weather-Blind Plan:** No adjustment for heat, altitude, or wind despite conditions data being available.

5. **The Nutrition-Free Plan:** Long events (>2 hours) with no mention of fueling strategy. Bonking is a pacing failure.

6. **The Form-Ignorant Plan:** Targets based on peak FTP when recent rides show the athlete is clearly not at peak fitness.

7. **The Robot Plan:** Perfectly even power with no tactical awareness. Real races require surges, recoveries, and positioning.
