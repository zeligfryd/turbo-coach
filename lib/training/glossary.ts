/**
 * Help copy for every concept this phase introduces (D9).
 *
 * One entry per concept, in one place, so the same term is never explained two
 * different ways on two different screens. Consumed by <Hint> and the info
 * panels.
 *
 * Writing rules:
 *   • Name things the way the user recognises them ("last done 9 days ago"),
 *     not the way the system stores them ("days_since / target_days").
 *   • `short` is the tooltip: one or two sentences, no jargon it doesn't define.
 *   • `why` is the second line, and only exists where the reason is not obvious
 *     from the definition. It answers "why should I care", not "how is it computed".
 *   • If a hint would only restate its own label, don't write it.
 *   • State what a thing is or does, never why it was designed that way. Build
 *     rationale belongs in the plan doc and in code comments, not on screen.
 */

export type GlossaryEntry = {
  /** The term as it appears in the UI. */
  term: string;
  short: string;
  why?: string;
};

export const GLOSSARY = {
  // ── Load ──────────────────────────────────────────────────────────
  session_load: {
    term: "Session load",
    short: "How hard a session was, times how long it lasted — your RPE multiplied by its minutes.",
    why: "It is the only number that can fairly add a gym session to a ride, so it is how total training load is counted here.",
  },
  srpe: {
    term: "Session RPE",
    short: "How hard the whole session felt, 1 to 10, judged afterwards rather than during.",
    why: "One number per session is enough. It is what turns minutes into load.",
  },
  bike_tss: {
    term: "Bike TSS",
    short: "Training Stress Score for a ride, calculated from power. Imported from intervals.icu.",
    why: "Kept entirely separate from session load — mixing them would break the fitness numbers you check against intervals.icu.",
  },
  two_currencies: {
    term: "Two load currencies",
    short: "Rides are measured in TSS from power. Everything else is measured in session load, from RPE and minutes.",
    why: "They measure different things on different scales, so they get separate charts and are never added together.",
  },
  acute_chronic: {
    term: "7-day : 28-day",
    short: "This week's total load against your four-week average.",
    why: "Well above 1 means you are ramping faster than you have adapted to. It counts all modalities, not just riding.",
  },
  ramp: {
    term: "Ramp",
    short: "How much this week's total load changed against last week's.",
  },
  rpe_estimated: {
    term: "Estimated",
    short: "This RPE was worked out from the ride's intensity rather than reported by you.",
    why: "Estimated values are marked so an inferred number is never mistaken for one you actually gave.",
  },

  // ── Coverage ──────────────────────────────────────────────────────
  focus_area: {
    term: "Focus area",
    short: "One of six parts of the body tracked separately for prehab.",
  },
  staleness: {
    term: "Time since last",
    short: "How long since anything covered this area, against how often you want to cover it.",
  },
  target_interval: {
    term: "Target interval",
    short: "How many days you want to go, at most, between sessions covering this area.",
    why: "Defaults are applied until you change one.",
  },
  stretch_only: {
    term: "Stretch only",
    short: "This area has been stretched, but nothing has actually loaded it.",
    why: "A calf stretch and a heavy-slow calf raise both touch the calf, but only one loads the tendon.",
  },
  coverage_fresh: {
    term: "Fresh",
    short: "Covered recently — well inside its target interval.",
  },
  coverage_due: {
    term: "Due soon",
    short: "Approaching its target interval. Worth picking up in the next session or two.",
  },
  coverage_overdue: {
    term: "Overdue",
    short: "Past its target interval.",
    why: "One or two overdue areas is normal in a heavy week. All six is a sign the targets need adjusting, not that you have failed.",
  },
  coverage_never: {
    term: "Not yet tracked",
    short: "Nothing has covered this area since you started tracking.",
  },

  // ── Scheduling ────────────────────────────────────────────────────
  day_part: {
    term: "Day part",
    short: "Morning, midday or evening — not a clock time.",
    why: "Sessions are ordered within a part rather than by the clock.",
  },
  modality: {
    term: "Modality",
    short: "What kind of training a session is: bike, strength, mobility, yoga or prehab.",
  },
  bike_anchor: {
    term: "Ride",
    short: "Rides are shown here for context but are still created and edited through the cycling flow.",
  },
  block_template: {
    term: "Template",
    short: "A session you do often, saved once with its usual length and the areas it covers.",
    why: "Ticking one updates coverage without logging every exercise.",
  },
  routine: {
    term: "Routine",
    short: "An ordered list of exercises you can schedule and repeat.",
  },
  ghost: {
    term: "Suggested session",
    short: "A proposal, not a commitment. Confirm it to make it real, or dismiss it.",
    why: "Suggestions never count toward your planned load until you accept them.",
  },
  carry_over: {
    term: "Carry-over",
    short: "Something you missed, offered once more before it expires.",
    why: "Missed sessions expire on their own after a few days.",
  },
  partial: {
    term: "Partial",
    short: "You did some of it. Counts toward coverage and load, at the time you actually did.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export function glossary(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY[key];
}
