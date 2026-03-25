import { describe, it, expect } from "vitest";
import { scalePlan } from "@/lib/pacing/scale";
import type { PacingPlan, AmbitionLevel } from "@/lib/race/types";
import { AMBITION_SCALING } from "@/lib/race/types";

const BASE_PLAN: PacingPlan = {
  overallTargetNpW: 250,
  estimatedFinishTimeMin: 180,
  strategy: "Pace conservatively on climbs, push the flats.",
  segments: [
    {
      label: "Flat 1",
      startKm: 0,
      endKm: 20,
      targetPowerW: 240,
      targetPowerPercent: 85,
      estimatedTimeMin: 35,
      advice: "Settle into tempo.",
    },
    {
      label: "Climb 1",
      startKm: 20,
      endKm: 30,
      targetPowerW: 280,
      targetPowerPercent: 100,
      estimatedTimeMin: 45,
      advice: "Hold steady at 3.5 W/kg.",
    },
  ],
};

describe("scalePlan", () => {
  describe("all 4 ambition levels", () => {
    const levels: AmbitionLevel[] = ["conservative", "realistic", "aggressive", "all_out"];

    for (const level of levels) {
      it(`${level} scales power and time correctly`, () => {
        const { power, time } = AMBITION_SCALING[level];
        const scaled = scalePlan(BASE_PLAN, level);

        expect(scaled.overallTargetNpW).toBe(Math.round(250 * power));
        expect(scaled.estimatedFinishTimeMin).toBe(Math.round(180 * time));

        expect(scaled.segments[0].targetPowerW).toBe(Math.round(240 * power));
        expect(scaled.segments[0].targetPowerPercent).toBe(Math.round(85 * power));
        expect(scaled.segments[0].estimatedTimeMin).toBe(Math.round(35 * time));

        expect(scaled.segments[1].targetPowerW).toBe(Math.round(280 * power));
        expect(scaled.segments[1].targetPowerPercent).toBe(Math.round(100 * power));
        expect(scaled.segments[1].estimatedTimeMin).toBe(Math.round(45 * time));
      });
    }
  });

  it("realistic returns identical values (multiplier = 1.0)", () => {
    const scaled = scalePlan(BASE_PLAN, "realistic");
    expect(scaled.overallTargetNpW).toBe(BASE_PLAN.overallTargetNpW);
    expect(scaled.estimatedFinishTimeMin).toBe(BASE_PLAN.estimatedFinishTimeMin);
    expect(scaled.segments[0].targetPowerW).toBe(BASE_PLAN.segments[0].targetPowerW);
  });

  it("strategy string is unchanged by scaling", () => {
    for (const level of ["conservative", "aggressive", "all_out"] as AmbitionLevel[]) {
      const scaled = scalePlan(BASE_PLAN, level);
      expect(scaled.strategy).toBe(BASE_PLAN.strategy);
    }
  });

  it("all output values are integers (rounded)", () => {
    const scaled = scalePlan(BASE_PLAN, "conservative");
    expect(Number.isInteger(scaled.overallTargetNpW)).toBe(true);
    expect(Number.isInteger(scaled.estimatedFinishTimeMin)).toBe(true);
    for (const seg of scaled.segments) {
      expect(Number.isInteger(seg.targetPowerW)).toBe(true);
      expect(Number.isInteger(seg.targetPowerPercent)).toBe(true);
      expect(Number.isInteger(seg.estimatedTimeMin)).toBe(true);
    }
  });

  it("preserves non-scaled segment fields", () => {
    const scaled = scalePlan(BASE_PLAN, "aggressive");
    expect(scaled.segments[0].label).toBe("Flat 1");
    expect(scaled.segments[0].startKm).toBe(0);
    expect(scaled.segments[0].endKm).toBe(20);
    expect(scaled.segments[0].advice).toBe("Settle into tempo.");
    expect(scaled.segments[1].label).toBe("Climb 1");
  });

  it("does not mutate the original plan", () => {
    const original = JSON.parse(JSON.stringify(BASE_PLAN));
    scalePlan(BASE_PLAN, "all_out");
    expect(BASE_PLAN).toEqual(original);
  });
});
