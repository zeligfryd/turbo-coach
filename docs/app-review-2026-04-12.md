# Turbo Coach App Review — Multi-Agent Synthesis

**Date:** 2026-04-12
**Reviewers:** Cycling Training Specialist, App/UX Specialist, Product Visionary, Skeptic

## Overall Assessment

All four reviewers agree: the app has a **strong domain foundation** and a **genuinely differentiated approach** (coach-as-OS, physics-based pacing). The training methodology is sound, but there are production-readiness gaps that need addressing before shipping to paying users.

**Skeptic's summary:** "The app is a well-crafted prototype with real product insight. It is not production-ready."

---

## Cross-Cutting Themes (Flagged by 2+ Reviewers)

| Issue | Flagged By | Severity |
|-------|-----------|----------|
| `IS_DEV = true` hardcoded in coach system prompt — leaks dev behavior to production | App/UX, Training | Critical bug |
| Dashboard is empty/placeholder — first thing users see is broken | App/UX, Visionary | High |
| Coach chat panel is 1277 lines — fragile, hard to maintain | App/UX, Visionary | Medium |
| No age/sex in user profile — limits HR zone accuracy, recovery modeling | Training, Visionary | Medium |
| Fitness data recomputed from scratch on every page load | App/UX, Training | Performance |
| Accessibility is weak — 7 of 65 components have ARIA attributes | App/UX, Visionary | Medium |
| AI integration layer is untested, unmonitored, no cost controls | Skeptic, Training | Critical |

---

## By Reviewer

### 1. Cycling Training Specialist

**Verdict: "Remarkably sound" training methodology**

Strengths:
- Pacing system is "best-in-class" with physics-based estimation
- Power zone model and IF bracketing are well-calibrated
- Coach prompt encodes real coaching knowledge

Key issues:
- **TSS calculation uses linear average power instead of NP** — underestimates high-variability rides by 10-20%
- **W' (anaerobic work capacity) hardcoded at 20kJ** — should be derived from CP/FTP or user-configurable
- **Duration ceiling for sustained power may be too aggressive** for very long segments (3h+)
- Missing age in profile limits HR zone estimation accuracy

### 2. App/UX Specialist

**Verdict: Solid bones, production gaps**

Strengths:
- Clean component architecture with shadcn/ui
- Good use of server actions pattern
- Drag-and-drop calendar is well-implemented

Key issues:
- **`IS_DEV = true` hardcoded** — the most critical bug found across all reviews
- **Coach page mobile layout broken** — 280px fixed sidebar doesn't work on small screens
- **No loading states** on several data-heavy pages
- **Fitness page recomputes everything** on mount — should cache/memoize
- **65 components, only 7 with ARIA** — accessibility is the weakest area

### 3. Product Visionary

**Verdict: "It is fundable as a product"**

Strengths:
- Unique "coach-as-OS" positioning — coach can create workouts, schedule them, analyze rides
- App is ~70% of a primary training platform's feature set
- Physics-based pacing is a genuine competitive advantage

Top opportunities:
1. **Autonomous periodization engine** — coach builds/adjusts multi-week training plans
2. **Proactive coach** — coach initiates conversations based on training load, missed workouts, upcoming races
3. **Deep post-ride analysis** — coach breaks down ride segments, compares to targets
4. **Monetization at $12-15/month** is realistic given feature depth

### 4. Skeptic

**Verdict: "Well-crafted prototype, not production-ready"**

#### Critical Bugs Found

1. **`extract-workout` route queries `.from("profiles")` but the table is called `users`** — workout extraction is silently broken or hitting a non-existent table
2. **Weekly summary cron uses cookie-based `createClient()`** but cron requests have no cookies — the cron likely processes zero users silently

#### Security Concerns

- **OAuth tokens (Strava, Intervals.icu) stored as plaintext** in the database — any backup leak or service-role key compromise exposes all tokens
- **Rate limiter fails open** — if the DB check fails, all rate limiting is silently disabled
- **No CSRF protection** on API routes
- **LLM-controlled `ilike` queries** — prompt injection could cause the LLM to search/exfiltrate data from unrelated time ranges
- **Scheduled workout RLS gap** — a user could insert a schedule row referencing another user's workout (FK checks existence, not ownership)

#### LLM Cost Projection at 1,000 Users

| Feature | Calls/user/day | Model | Est. cost/call | Daily total |
|---------|---------------|-------|----------------|-------------|
| Coach chat (5 turns) | 5 | Sonnet | $0.10 | $500 |
| Query generation | 5 | Ollama/Haiku | $0.002 | $10 |
| Memory extraction | 5 | Haiku | $0.005 | $25 |
| Embeddings | 15 | OpenAI | $0.0001 | $1.50 |
| Post-ride analysis | 0.5 | Sonnet | $0.05 | $25 |
| Weekly summary | 0.14 | Sonnet | $0.05 | $7 |
| Pacing | 0.1 | Sonnet | $0.10 | $10 |
| **Total** | | | | **~$580/day (~$17,400/month)** |

No per-user spending limit, no global budget cap, no alerting. One abusive user could rack up $120/hour in Anthropic charges.

#### Top 5 "Keeps Me Up at Night"

1. **LLM cost runaway with no kill switch** — no per-user limits, no budget caps, no alerting
2. **Coach can give physiologically dangerous advice** — no intensity ceiling for a 65-year-old beginner getting told to do 2h at 110% FTP
3. **Memory system silently corrupts user data** — LLM-driven deletion with no undo, no audit log
4. **Entire coach depends on a 379-line prompt being correctly interpreted** — stochastic compliance with dozens of English rules
5. **Zero observability** — no Sentry, no metrics, no alerting. Failed LLM calls go to ephemeral `console.warn`

#### Testing Gaps

**Tested:** physics engine, pacing parse/scale, GPX parser, Coggan scoring, PMC model.

**Not tested (zero tests):**
- Coach API route
- Workout extraction
- Sync pipeline
- Memory extraction
- Server actions
- Tool execution
- Rate limiting
- Auth flows
- No integration tests at all

Coverage is concentrated in pure math (needs it least) and absent from AI integration (needs it most).

#### Scalability Blockers

- Weekly summary cron is a **sequential loop** — times out after ~60-180 users on Vercel Pro
- JSONB messages blob (entire conversation in one column) scales badly at 50+ exchanges
- Strava sync fetches streams for ALL activities, not just new ones

---

## Severity-Ranked Action Items

### P0 — Fix before any user sees this

1. Fix `IS_DEV = true` hardcoded flag
2. Fix `extract-workout` querying `"profiles"` instead of `"users"` table
3. Fix weekly summary cron using cookie-based auth (needs service role client)
4. Build a real dashboard

### P1 — Fix before charging money

5. Add per-user and global LLM cost limits/alerting
6. Add error tracking (Sentry or equivalent)
7. Add intensity safety guardrails to coach chat (not just pacing)
8. Add audit log to memory extraction (at minimum log deletions)
9. Fix coach page mobile sidebar
10. Fix TSS to use NP instead of average power

### P2 — Fix soon

11. Cache fitness computations
12. Add loading states to data-heavy pages
13. Break up coach-chat-panel.tsx
14. Add age/sex to user profile
15. Encrypt OAuth tokens at rest
16. Add CSRF protection to API routes
17. Make W' configurable

### P3 — Plan for scale

18. Move conversations from JSONB blob to normalized messages table
19. Batch weekly summary cron (queue-based, not sequential loop)
20. Add integration tests for coach API, workout extraction, sync pipeline
21. Optimize Strava sync to skip already-fetched streams

---

## Where All Reviewers Agree

- The **domain knowledge is genuinely strong** — physics, Coggan profiling, zone models, pacing
- The **coach-as-OS concept is differentiated** and viable as a product
- The **AI integration layer is the weakest link** — untested, unmonitored, no cost controls, no safety rails
- The app is **~70% of a shippable product** with a clear path to completion
