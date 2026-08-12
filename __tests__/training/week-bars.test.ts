import { describe, it, expect } from "vitest";
import { dayBars, ridingPeak, OFF_BIKE_FULL_MIN } from "@/lib/training/week-bars";

const day = (minutes: number, offBikeMinutes = 0) => ({ minutes, offBikeMinutes });

describe("ridingPeak", () => {
  it("scales to the week's biggest ride", () => {
    expect(ridingPeak([day(60), day(180), day(0)])).toBe(180);
  });

  it("never drops below an hour, so one short ride is not a full bar", () => {
    expect(ridingPeak([day(20)])).toBe(60);
    expect(dayBars(day(20), ridingPeak([day(20)])).riding).toBeCloseTo(1 / 3, 5);
  });
});

describe("dayBars", () => {
  const peak = 120;

  it("keeps riding proportional — the shape of the week is the point", () => {
    expect(dayBars(day(120), peak).riding).toBe(1);
    expect(dayBars(day(60), peak).riding).toBe(0.5);
    expect(dayBars(day(30), peak).riding).toBe(0.25);
  });

  it("shows a short session rather than rounding it away", () => {
    // The bug this replaced: 12 minutes against a two-hour ride is 3% on a
    // shared axis, which renders as a hairline on the same baseline as an
    // empty day — indistinguishable from having logged nothing.
    expect(dayBars(day(120, 12), peak).offBike).toBeGreaterThanOrEqual(0.2);
  });

  it("keeps the off-bike lane independent of how much riding happened", () => {
    // The whole reason for two lanes: a huge ride must not shrink the record
    // of the mobility session that happened the same day.
    const quiet = dayBars(day(0, 15), peak).offBike;
    const heavy = dayBars(day(300, 15), 300).offBike;
    expect(quiet).toBe(heavy);
  });

  it("still distinguishes a long session from a short one", () => {
    // A floor that swallowed this distinction would trade one invisibility
    // for another.
    expect(dayBars(day(0, 30), peak).offBike).toBeGreaterThan(dayBars(day(0, 10), peak).offBike);
  });

  it("fills the lane at the reference duration and caps beyond it", () => {
    expect(dayBars(day(0, OFF_BIKE_FULL_MIN), peak).offBike).toBe(1);
    expect(dayBars(day(0, OFF_BIKE_FULL_MIN * 4), peak).offBike).toBe(1);
  });

  it("draws nothing when nothing happened", () => {
    expect(dayBars(day(0, 0), peak)).toEqual({ riding: 0, offBike: 0 });
  });

  it("never exceeds its lane", () => {
    for (const d of [day(9999, 9999), day(1, 1), day(0, 31)]) {
      const bars = dayBars(d, peak);
      expect(bars.riding).toBeLessThanOrEqual(1);
      expect(bars.offBike).toBeLessThanOrEqual(1);
    }
  });
});
