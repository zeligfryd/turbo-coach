import { describe, it, expect } from "vitest";
import { scoreProfile } from "@/lib/power/coggan";
import type { PowerCurvePoint } from "@/lib/power/types";

function makeCurve(wkgMap: Record<number, number>, weight = 75): PowerCurvePoint[] {
  return Object.entries(wkgMap).map(([secs, wkg]) => ({
    secs: Number(secs),
    watts: Math.round(wkg * weight),
    wkg,
    date: "",
  }));
}

describe("scoreProfile", () => {
  describe("male thresholds — exact boundaries", () => {
    // Male 5min thresholds: [0, 2.5, 3.5, 4.5, 5.5, 6.5]
    it("scores exactly at threshold (male 5min 3.5 W/kg → 3 Moderate)", () => {
      const curve = makeCurve({ 5: 14.0, 60: 6.5, 300: 3.5, 1200: 3.8 });
      const scores = scoreProfile(curve, "male");
      expect(scores["5min"]).toBe(3);
    });

    it("scores just below threshold (male 5min 3.49 W/kg → 2 Fair)", () => {
      const curve = makeCurve({ 5: 14.0, 60: 6.5, 300: 3.49, 1200: 3.8 });
      const scores = scoreProfile(curve, "male");
      expect(scores["5min"]).toBe(2);
    });

    it("scores just above threshold (male 5min 3.51 W/kg → still 3)", () => {
      const curve = makeCurve({ 5: 14.0, 60: 6.5, 300: 3.51, 1200: 3.8 });
      const scores = scoreProfile(curve, "male");
      expect(scores["5min"]).toBe(3);
    });

    // Male 20min thresholds: [0, 2.0, 3.0, 3.8, 4.5, 5.5]
    it("scores 20min at each boundary", () => {
      expect(scoreProfile(makeCurve({ 5: 8, 60: 3.5, 300: 2.5, 1200: 1.9 }), "male")["20min"]).toBe(1);
      expect(scoreProfile(makeCurve({ 5: 8, 60: 3.5, 300: 2.5, 1200: 2.0 }), "male")["20min"]).toBe(2);
      expect(scoreProfile(makeCurve({ 5: 8, 60: 3.5, 300: 2.5, 1200: 3.0 }), "male")["20min"]).toBe(3);
      expect(scoreProfile(makeCurve({ 5: 8, 60: 3.5, 300: 2.5, 1200: 3.8 }), "male")["20min"]).toBe(4);
      expect(scoreProfile(makeCurve({ 5: 8, 60: 3.5, 300: 2.5, 1200: 4.5 }), "male")["20min"]).toBe(5);
      expect(scoreProfile(makeCurve({ 5: 8, 60: 3.5, 300: 2.5, 1200: 5.5 }), "male")["20min"]).toBe(6);
    });

    // Male 5s thresholds: [0, 8.0, 11.0, 14.0, 17.0, 21.0]
    it("scores 5s at each boundary", () => {
      expect(scoreProfile(makeCurve({ 5: 7.9, 60: 3.5, 300: 2.5, 1200: 2.0 }), "male")["5s"]).toBe(1);
      expect(scoreProfile(makeCurve({ 5: 8.0, 60: 3.5, 300: 2.5, 1200: 2.0 }), "male")["5s"]).toBe(2);
      expect(scoreProfile(makeCurve({ 5: 11.0, 60: 3.5, 300: 2.5, 1200: 2.0 }), "male")["5s"]).toBe(3);
      expect(scoreProfile(makeCurve({ 5: 14.0, 60: 3.5, 300: 2.5, 1200: 2.0 }), "male")["5s"]).toBe(4);
      expect(scoreProfile(makeCurve({ 5: 17.0, 60: 3.5, 300: 2.5, 1200: 2.0 }), "male")["5s"]).toBe(5);
      expect(scoreProfile(makeCurve({ 5: 21.0, 60: 3.5, 300: 2.5, 1200: 2.0 }), "male")["5s"]).toBe(6);
    });
  });

  describe("edge cases", () => {
    it("scores zero W/kg as 1 (Untrained)", () => {
      const curve = makeCurve({ 5: 0, 60: 0, 300: 0, 1200: 0 });
      const scores = scoreProfile(curve, "male");
      expect(scores["5s"]).toBe(1);
      expect(scores["1min"]).toBe(1);
      expect(scores["5min"]).toBe(1);
      expect(scores["20min"]).toBe(1);
    });

    it("scores very high values as 6 (Excellent)", () => {
      const curve = makeCurve({ 5: 25.0, 60: 12.0, 300: 8.0, 1200: 7.0 });
      const scores = scoreProfile(curve, "male");
      expect(scores["5s"]).toBe(6);
      expect(scores["1min"]).toBe(6);
      expect(scores["5min"]).toBe(6);
      expect(scores["20min"]).toBe(6);
    });

    it("handles missing durations in curve (defaults to wkg 0 → score 1)", () => {
      // Only provide 5s and 20min, missing 1min and 5min
      const curve: PowerCurvePoint[] = [
        { secs: 5, watts: 1050, wkg: 14.0, date: "" },
        { secs: 1200, watts: 285, wkg: 3.8, date: "" },
      ];
      const scores = scoreProfile(curve, "male");
      expect(scores["5s"]).toBe(4);
      expect(scores["1min"]).toBe(1); // missing → 0 W/kg → score 1
      expect(scores["5min"]).toBe(1); // missing → 0 W/kg → score 1
      expect(scores["20min"]).toBe(4);
    });

    it("handles null wkg as 0 → score 1", () => {
      const curve: PowerCurvePoint[] = [
        { secs: 5, watts: 1050, wkg: null, date: "" },
        { secs: 60, watts: 488, wkg: null, date: "" },
        { secs: 300, watts: 338, wkg: null, date: "" },
        { secs: 1200, watts: 285, wkg: null, date: "" },
      ];
      const scores = scoreProfile(curve, "male");
      expect(scores["5s"]).toBe(1);
      expect(scores["1min"]).toBe(1);
      expect(scores["5min"]).toBe(1);
      expect(scores["20min"]).toBe(1);
    });
  });

  describe("female thresholds", () => {
    // Female 5min thresholds: [0, 2.0, 2.8, 3.6, 4.5, 5.5]
    it("scores female 5min at 3.6 W/kg as 4 (Good)", () => {
      const curve = makeCurve({ 5: 11.0, 60: 5.2, 300: 3.6, 1200: 3.1 }, 58);
      const scores = scoreProfile(curve, "female");
      expect(scores["5min"]).toBe(4);
    });

    it("uses female thresholds which are lower than male", () => {
      // 2.8 W/kg at 5min: male → score 2 (< 3.5 threshold), female → score 3 (>= 2.8 threshold)
      const curve = makeCurve({ 5: 8.0, 60: 3.5, 300: 2.8, 1200: 2.0 });
      const maleScores = scoreProfile(curve, "male");
      const femaleScores = scoreProfile(curve, "female");
      expect(maleScores["5min"]).toBe(2);
      expect(femaleScores["5min"]).toBe(3);
    });
  });

  describe("defaults", () => {
    it("defaults to male when gender is not specified", () => {
      const curve = makeCurve({ 5: 14.0, 60: 6.5, 300: 4.5, 1200: 3.8 });
      const defaultScores = scoreProfile(curve);
      const maleScores = scoreProfile(curve, "male");
      expect(defaultScores).toEqual(maleScores);
    });
  });
});
