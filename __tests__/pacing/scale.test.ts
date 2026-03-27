import { describe, it, expect } from "vitest";
import { scalePlan } from "@/lib/pacing/scale";
import type { PacingPlan, AmbitionLevel } from "@/lib/race/types";
import { AMBITION_SCALING } from "@/lib/race/types";

// Ceiling per duration bucket (mirrors durationCeilingPct in scale.ts)
function expectedCeilingPct(estMin: number): number {
  if (estMin > 60) return 95;
  if (estMin > 20) return 105;
  if (estMin > 5)  return 115;
  return 150;
}

const BASE_PLAN: PacingPlan = {
  overallTargetNpW: 250,
  estimatedFinishTimeMin: 180,
  strategy: "Pace conservatively on climbs, push the flats.",
  segments: [
    {
      // Flat 1: 35min — ceiling 105%, base 85%, all_out 93.5% → no cap
      label: "Flat 1",
      startKm: 0,
      endKm: 20,
      targetPowerW: 240,
      targetPowerPercent: 85,
      estimatedTimeMin: 35,
      advice: "Settle into tempo.",
      targetHrZone: "Z2-Z3",
      targetHrBpm: "145-160",
    },
    {
      // Climb 1: 45min — ceiling 105%, base 100%, all_out (110%) → capped at 105%
      label: "Climb 1",
      startKm: 20,
      endKm: 30,
      targetPowerW: 280,
      targetPowerPercent: 100,
      estimatedTimeMin: 45,
      advice: "Hold steady at 3.5 W/kg.",
      targetHrZone: "Z4",
      targetHrBpm: "165-178",
    },
  ],
};

describe("scalePlan", () => {
  describe("all 4 ambition levels", () => {
    const levels: AmbitionLevel[] = ["conservative", "realistic", "aggressive", "all_out"];

    for (const level of levels) {
      it(`${level} scales power and time correctly (with duration ceiling)`, () => {
        const { power, time } = AMBITION_SCALING[level];
        const scaled = scalePlan(BASE_PLAN, level);

        // Overall NP and finish time are scaled directly (no per-segment ceiling here)
        expect(scaled.overallTargetNpW).toBe(Math.round(250 * power));
        expect(scaled.estimatedFinishTimeMin).toBe(Math.round(180 * time));

        // Flat 1 (35min, base 85%): ceiling is 105% — no ambition level exceeds it
        expect(scaled.segments[0].targetPowerW).toBe(Math.round(240 * power));
        expect(scaled.segments[0].targetPowerPercent).toBe(Math.round(85 * power));
        expect(scaled.segments[0].estimatedTimeMin).toBe(Math.round(35 * time));

        // Climb 1 (45min, base 100%): ceiling is 105%
        // all_out (1.10) would push to 110% — must be capped at 105%
        const uncappedPct = Math.round(100 * power);
        const ceiling = expectedCeilingPct(45);
        const cappedPct = Math.min(uncappedPct, ceiling);
        // Without FTP provided, watts are proportionally re-scaled from original
        const cappedW = uncappedPct === cappedPct
          ? Math.round(280 * power)
          : Math.round(280 * (cappedPct / 100)); // originalPct=100 so proportion = cappedPct/100

        expect(scaled.segments[1].targetPowerPercent).toBe(cappedPct);
        expect(scaled.segments[1].targetPowerW).toBe(cappedW);
        expect(scaled.segments[1].estimatedTimeMin).toBe(Math.round(45 * time));
      });
    }
  });

  it("realistic returns identical values (multiplier = 1.0)", () => {
    const scaled = scalePlan(BASE_PLAN, "realistic");
    expect(scaled.overallTargetNpW).toBe(BASE_PLAN.overallTargetNpW);
    expect(scaled.estimatedFinishTimeMin).toBe(BASE_PLAN.estimatedFinishTimeMin);
    expect(scaled.segments[0].targetPowerW).toBe(BASE_PLAN.segments[0].targetPowerW);
    expect(scaled.segments[1].targetPowerW).toBe(BASE_PLAN.segments[1].targetPowerW);
  });

  it("all_out climb is capped at duration ceiling (105% for 45min)", () => {
    const scaled = scalePlan(BASE_PLAN, "all_out");
    // 100% * 1.10 = 110% — should be capped at 105%
    expect(scaled.segments[1].targetPowerPercent).toBe(105);
    expect(scaled.segments[1].targetPowerW).toBe(294); // 280 * 105/100
  });

  it("all_out with ftp uses ftp-based watt recalculation after cap", () => {
    const scaled = scalePlan(BASE_PLAN, "all_out", 280);
    expect(scaled.segments[1].targetPowerPercent).toBe(105);
    expect(scaled.segments[1].targetPowerW).toBe(Math.round(280 * 105 / 100)); // 294
  });

  it("ceiling does not affect flat segment under all_out", () => {
    const scaled = scalePlan(BASE_PLAN, "all_out");
    // Flat 1: 85% * 1.10 = 93.5% → 94% — well under 105% ceiling for 35min
    expect(scaled.segments[0].targetPowerPercent).toBe(Math.round(85 * 1.10));
    expect(scaled.segments[0].targetPowerW).toBe(Math.round(240 * 1.10));
  });

  it("strategy string is unchanged by scaling", () => {
    for (const level of ["conservative", "aggressive", "all_out"] as AmbitionLevel[]) {
      const scaled = scalePlan(BASE_PLAN, level);
      expect(scaled.strategy).toBe(BASE_PLAN.strategy);
    }
  });

  it("HR fields are preserved unchanged (they are hard ceilings, not scaled)", () => {
    for (const level of ["conservative", "aggressive", "all_out"] as AmbitionLevel[]) {
      const scaled = scalePlan(BASE_PLAN, level);
      expect(scaled.segments[0].targetHrZone).toBe("Z2-Z3");
      expect(scaled.segments[0].targetHrBpm).toBe("145-160");
      expect(scaled.segments[1].targetHrZone).toBe("Z4");
      expect(scaled.segments[1].targetHrBpm).toBe("165-178");
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
