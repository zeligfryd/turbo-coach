import { describe, it, expect } from "vitest";
import {
  CADENCES,
  cadenceForDays,
  daysForCadence,
  weeklyAreaDemand,
  weeklyEstimate,
  weekProgress,
} from "@/lib/training/cadence";
import { DEFAULT_AREA_TARGET_DAYS } from "@/lib/training/taxonomy";

describe("cadenceForDays", () => {
  it("maps the exact bucket values", () => {
    for (const cadence of CADENCES) {
      expect(cadenceForDays(cadence.days)).toBe(cadence.key);
    }
  });

  it("maps the existing free-form defaults to a sensible bucket", () => {
    // Nothing stored today is an exact bucket value, so every one of these has
    // to land somewhere legible rather than leaving the editor blank.
    expect(cadenceForDays(4)).toBe("twice");
    expect(cadenceForDays(5)).toBe("twice");
    expect(cadenceForDays(6)).toBe("weekly");
    expect(cadenceForDays(7)).toBe("weekly");
  });

  it("round-trips through daysForCadence", () => {
    for (const cadence of CADENCES) {
      expect(cadenceForDays(daysForCadence(cadence.key))).toBe(cadence.key);
    }
  });

  it("stays within the column's 1–60 range", () => {
    for (const cadence of CADENCES) {
      expect(cadence.days).toBeGreaterThanOrEqual(1);
      expect(cadence.days).toBeLessThanOrEqual(60);
    }
  });
});

describe("weeklyAreaDemand", () => {
  it("counts exactly what the labels promise", () => {
    // 7/4 is 1.75, but the label says twice a week, so the demand is 2.
    expect(weeklyAreaDemand({ hips_glutes: 4, extremities: 14 })).toBeCloseTo(2.5, 5);
  });

  it("is zero when nothing is asked for", () => {
    expect(weeklyAreaDemand({})).toBe(0);
  });

  it("puts the shipped defaults in a plausible range", () => {
    // The six-area model exists because a 14x5 matrix demanded ~29 stimuli a
    // week. If the defaults ever drift back toward that, this fails.
    const demand = weeklyAreaDemand(DEFAULT_AREA_TARGET_DAYS);
    expect(demand).toBeGreaterThan(4);
    expect(demand).toBeLessThan(12);
  });
});

describe("weeklyEstimate", () => {
  const broad = [{ areaCount: 4, durationMin: 10 }, { areaCount: 3, durationMin: 10 }];

  it("derives sessions from demand and how broad the routines are", () => {
    const narrow = weeklyEstimate({ hips_glutes: 3, trunk: 7, thoracic: 7 }, [
      { areaCount: 1, durationMin: 10 },
    ]);
    const wide = weeklyEstimate({ hips_glutes: 3, trunk: 7, thoracic: 7 }, [
      { areaCount: 4, durationMin: 10 },
    ]);
    // Same demand, broader routines, fewer sessions needed.
    expect(narrow.sessions).toBeGreaterThan(wide.sessions);
  });

  it("returns nothing when nothing is asked for", () => {
    expect(weeklyEstimate({}, broad)).toEqual({ sessions: 0, minutes: 0, load: 0 });
  });

  it("never suggests less than one session when something is asked for", () => {
    const estimate = weeklyEstimate({ extremities: 60 }, broad);
    expect(estimate.sessions).toBe(1);
  });

  it("keeps minutes and load consistent with the session count", () => {
    const estimate = weeklyEstimate(DEFAULT_AREA_TARGET_DAYS, broad);
    expect(estimate.minutes).toBe(estimate.sessions * 10);
    expect(estimate.load).toBe(estimate.minutes * 3);
  });

  it("works out at a handful of sessions for the shipped defaults", () => {
    // The number a user actually sees. If a change makes the defaults imply a
    // daily habit, the feature has become a nag and this catches it.
    const estimate = weeklyEstimate(DEFAULT_AREA_TARGET_DAYS, broad);
    expect(estimate.sessions).toBeGreaterThanOrEqual(1);
    expect(estimate.sessions).toBeLessThanOrEqual(3);
  });

  it("falls back to typical values when there are no routines yet", () => {
    const estimate = weeklyEstimate(DEFAULT_AREA_TARGET_DAYS, []);
    expect(estimate.sessions).toBeGreaterThan(0);
    expect(estimate.minutes).toBeGreaterThan(0);
  });
});

describe("weekProgress", () => {
  it("is met when no area is behind, whatever the session count", () => {
    // Areas are the demand; sessions are only the means. A week can be met
    // having done fewer sessions than typical if the routines were broad.
    expect(weekProgress(2, 3, []).isMet).toBe(true);
  });

  it("is not met while an area is still owed, even past the session count", () => {
    // Four sessions all hitting the same area is not a covered week.
    expect(weekProgress(4, 3, ["posterior_chain"]).isMet).toBe(false);
  });

  it("carries the owed areas through in order", () => {
    const progress = weekProgress(1, 3, ["trunk", "posterior_chain"]);
    expect(progress.owed).toEqual(["trunk", "posterior_chain"]);
  });
});
