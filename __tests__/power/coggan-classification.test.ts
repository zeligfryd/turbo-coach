import { describe, it, expect } from "vitest";
import { buildPowerProfile } from "@/lib/power/coggan";
import {
  ALL_ATHLETES,
  SPRINTER_ATHLETE,
  CLIMBER_ATHLETE,
  ALL_ROUNDER_ATHLETE,
} from "../fixtures/athletes";
import type { PowerCurvePoint } from "@/lib/power/types";

function makeCurve(wkgMap: Record<number, number>, weight = 75): PowerCurvePoint[] {
  return Object.entries(wkgMap).map(([secs, wkg]) => ({
    secs: Number(secs),
    watts: Math.round(wkg * weight),
    wkg,
    date: "",
  }));
}

const emptyCurve: PowerCurvePoint[] = [];

describe("profile type classification", () => {
  describe("each fixture triggers the correct profile type", () => {
    for (const athlete of ALL_ATHLETES) {
      it(`${athlete.name} → ${athlete.expectedType}`, () => {
        const profile = buildPowerProfile(athlete.curve, emptyCurve, athlete.gender);
        expect(profile.type).toBe(athlete.expectedType);
      });
    }
  });

  describe("all-rounder boundary", () => {
    it("max-min = 1 → All-rounder", () => {
      // Scores [3, 4, 3, 4] → max=4, min=3, diff=1 → All-rounder
      const curve = makeCurve({ 5: 11.0, 60: 6.5, 300: 3.5, 1200: 3.8 });
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.type).toBe("All-rounder");
    });

    it("max-min = 2 → NOT All-rounder", () => {
      // Scores [3, 5, 3, 4] → max=5, min=3, diff=2 → not All-rounder
      const curve = makeCurve({ 5: 11.0, 60: 8.0, 300: 3.5, 1200: 3.8 });
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.type).not.toBe("All-rounder");
    });
  });

  describe("sprinter vs anaerobic edge", () => {
    it("shortAvg - longAvg = 2.0 → Sprinter (exactly at threshold)", () => {
      // Scores [5, 5, 3, 3] → shortAvg=5, longAvg=3, diff=2 → Sprinter
      const curve = makeCurve({ 5: 17.0, 60: 8.0, 300: 3.5, 1200: 3.0 });
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.type).toBe("Sprinter");
    });

    it("shortAvg - longAvg = 1.5 → NOT Sprinter", () => {
      // Scores [5, 4, 3, 3] → shortAvg=4.5, longAvg=3, diff=1.5 → not Sprinter
      const curve = makeCurve({ 5: 17.0, 60: 6.5, 300: 3.5, 1200: 3.0 });
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.type).not.toBe("Sprinter");
    });
  });

  describe("classification priority ordering", () => {
    it("All-rounder check happens before Sprinter (equal scores → AR even if short > long)", () => {
      // Scores [4, 4, 4, 4] → diff=0 → All-rounder, not Sprinter
      const profile = buildPowerProfile(ALL_ROUNDER_ATHLETE.curve, emptyCurve, "male");
      expect(profile.type).toBe("All-rounder");
    });

    it("Climber check happens before Time Trialist", () => {
      // Scores [2, 3, 5, 5] → longAvg-shortAvg=2.5 >= 1.5 → Climber (before TT check)
      const profile = buildPowerProfile(CLIMBER_ATHLETE.curve, emptyCurve, "male");
      expect(profile.type).toBe("Climber");
    });
  });

  describe("fallback classification", () => {
    it("falls back to Time Trialist when s20m >= s5m and shortAvg <= longAvg", () => {
      // Scores [4, 2, 3, 4] → none of the primary checks match
      // shortAvg=3, longAvg=3.5, shortAvg <= longAvg, s20m(4) >= s5m(3) → TT
      const curve = makeCurve({ 5: 14.0, 60: 4.0, 300: 3.5, 1200: 3.8 });
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.type).toBe("Time Trialist");
    });

    it("falls back to Sprinter/Anaerobic when shortAvg > longAvg", () => {
      // Scores [5, 3, 2, 2] → shortAvg=4, longAvg=2, diff=2 → Sprinter (primary check catches this)
      // Let's find one that goes to fallback: shortAvg > longAvg but diff < 2
      // Scores [4, 3, 2, 3] → shortAvg=3.5, longAvg=2.5, diff=1.0 < 2 (not sprinter)
      // anaerobic: s1m(3) >= s5(4)? No
      // climber: 2.5-3.5=-1 < 1.5; s5m(2) >= s5(4)? No
      // TT: s20m(3) >= s5m(2)? Yes. s20m(3) > s1m(3)? No → skip
      // puncheur: s1m(3) >= s20m(3)+1=4? No
      // fallback: shortAvg(3.5) > longAvg(2.5)? Yes → s1m(3) > s5(4)? No → "Sprinter"
      const curve = makeCurve({ 5: 14.0, 60: 5.0, 300: 2.8, 1200: 3.0 });
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.type).toBe("Sprinter");
    });
  });
});
