import { describe, it, expect } from "vitest";
import { findExistingMatch, hasUsableMetrics } from "@/lib/intervals/activity-sync";
import type { IcuActivitySummary } from "@/lib/intervals/types";

function icu(overrides: Partial<IcuActivitySummary> = {}): IcuActivitySummary {
  return {
    id: "i1",
    type: "Ride",
    name: "Ride",
    start_date_local: "2026-05-20T07:30:00",
    moving_time: 3600,
    ...overrides,
  } as IcuActivitySummary;
}

const row = (id: string, date: string, movingTime: number | null) => ({
  id,
  activity_date: date,
  moving_time: movingTime,
  metrics_source: null,
});

describe("hasUsableMetrics", () => {
  it("accepts a Garmin-sourced ride", () => {
    expect(hasUsableMetrics(icu({ icu_training_load: 79, moving_time: 7153 }))).toBe(true);
  });

  it("rejects the empty shells intervals.icu creates for Strava rides", () => {
    // Real shape observed from the API: an id and a date, nothing else.
    expect(
      hasUsableMetrics({
        id: "i2",
        start_date_local: "2026-05-20T07:30:00",
      } as IcuActivitySummary),
    ).toBe(false);
  });
});

describe("findExistingMatch", () => {
  it("matches the same ride recorded by both systems", () => {
    const match = findExistingMatch(icu(), [row("a", "2026-05-20", 3600)]);
    expect(match?.id).toBe("a");
  });

  it("tolerates the systems disagreeing about pauses", () => {
    // Garmin and Strava routinely differ by a couple of minutes on moving time.
    expect(findExistingMatch(icu(), [row("a", "2026-05-20", 3750)])?.id).toBe("a");
    expect(findExistingMatch(icu(), [row("a", "2026-05-20", 3450)])?.id).toBe("a");
  });

  it("does not match a different ride on the same day", () => {
    // Two rides that day, and neither duration is close: refuse rather than guess.
    const match = findExistingMatch(icu(), [
      row("a", "2026-05-20", 900),
      row("b", "2026-05-20", 7200),
    ]);
    expect(match).toBeNull();
  });

  it("picks the closest when a day holds several rides", () => {
    const match = findExistingMatch(icu(), [
      row("a", "2026-05-20", 3800),
      row("b", "2026-05-20", 3610),
      row("c", "2026-05-20", 3500),
    ]);
    expect(match?.id).toBe("b");
  });

  it("never matches across days", () => {
    expect(findExistingMatch(icu(), [row("a", "2026-05-19", 3600)])).toBeNull();
  });

  it("falls back to the only ride of the day when duration is unknown", () => {
    const match = findExistingMatch(icu({ moving_time: undefined }), [
      row("a", "2026-05-20", null),
    ]);
    expect(match?.id).toBe("a");
  });

  it("refuses the fallback when the day is ambiguous", () => {
    const match = findExistingMatch(icu({ moving_time: undefined }), [
      row("a", "2026-05-20", null),
      row("b", "2026-05-20", null),
    ]);
    expect(match).toBeNull();
  });

  it("returns nothing when we hold no ride that day", () => {
    expect(findExistingMatch(icu(), [row("a", "2026-04-01", 3600)])).toBeNull();
  });
});
