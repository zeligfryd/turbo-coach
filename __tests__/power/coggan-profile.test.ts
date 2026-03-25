import { describe, it, expect } from "vitest";
import { buildPowerProfile } from "@/lib/power/coggan";
import { ALL_ROUNDER_ATHLETE, SPRINTER_ATHLETE, CLIMBER_ATHLETE } from "../fixtures/athletes";
import type { PowerCurvePoint } from "@/lib/power/types";

const emptyCurve: PowerCurvePoint[] = [];

describe("buildPowerProfile", () => {
  describe("estimatedFtp", () => {
    it("computes 95% of 20min peak watts", () => {
      // All-rounder: 20min = 285W → estimatedFtp = round(285 * 0.95) = 271
      const profile = buildPowerProfile(ALL_ROUNDER_ATHLETE.curve, emptyCurve, "male");
      expect(profile.estimatedFtp).toBe(Math.round(285 * 0.95));
    });

    it("returns null when 20min peak is 0", () => {
      const curve: PowerCurvePoint[] = [
        { secs: 5, watts: 1000, wkg: 14.0, date: "" },
        { secs: 60, watts: 500, wkg: 6.5, date: "" },
        { secs: 300, watts: 350, wkg: 4.5, date: "" },
        { secs: 1200, watts: 0, wkg: 0, date: "" },
      ];
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.estimatedFtp).toBeNull();
    });

    it("returns null when 20min is missing from curve", () => {
      const curve: PowerCurvePoint[] = [
        { secs: 5, watts: 1000, wkg: 14.0, date: "" },
        { secs: 60, watts: 500, wkg: 6.5, date: "" },
        { secs: 300, watts: 350, wkg: 4.5, date: "" },
      ];
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.estimatedFtp).toBeNull();
    });
  });

  describe("weakness detection", () => {
    it("identifies the lowest-scoring dimension", () => {
      // Sprinter scores: 5s=6, 1min=5, 5min=3, 20min=3
      // Tied between 5min and 20min. Iteration order of Object.entries determines winner.
      const profile = buildPowerProfile(SPRINTER_ATHLETE.curve, emptyCurve, "male");
      // Both 5min and 20min score 3; first encountered in iteration wins
      expect(["5min", "20min"]).toContain(profile.weakness);
    });

    it("picks the sole lowest dimension when no tie", () => {
      // Climber scores: 5s=2, 1min=3, 5min=5, 20min=5 → weakness is "5s"
      const profile = buildPowerProfile(CLIMBER_ATHLETE.curve, emptyCurve, "male");
      expect(profile.weakness).toBe("5s");
    });
  });

  describe("scores42d computed independently", () => {
    it("uses last42dCurve for scores42d, not allTimeCurve", () => {
      const lower42d: PowerCurvePoint[] = [
        { secs: 5, watts: 600, wkg: 8.0, date: "" },   // score 2
        { secs: 60, watts: 263, wkg: 3.5, date: "" },  // score 2
        { secs: 300, watts: 188, wkg: 2.5, date: "" }, // score 2
        { secs: 1200, watts: 150, wkg: 2.0, date: "" },// score 2
      ];
      const profile = buildPowerProfile(ALL_ROUNDER_ATHLETE.curve, lower42d, "male");
      // All-time should be score 4, 42d should be score 2
      expect(profile.scores["5s"]).toBe(4);
      expect(profile.scores42d["5s"]).toBe(2);
      expect(profile.scores["20min"]).toBe(4);
      expect(profile.scores42d["20min"]).toBe(2);
    });
  });

  describe("peak extraction", () => {
    it("populates allTimePeaks with watts from the curve", () => {
      const profile = buildPowerProfile(ALL_ROUNDER_ATHLETE.curve, emptyCurve, "male");
      expect(profile.allTimePeaks["5s"]).toBe(1050);
      expect(profile.allTimePeaks["1min"]).toBe(488);
      expect(profile.allTimePeaks["5min"]).toBe(338);
      expect(profile.allTimePeaks["20min"]).toBe(285);
    });

    it("populates peakWkg from the curve", () => {
      const profile = buildPowerProfile(ALL_ROUNDER_ATHLETE.curve, emptyCurve, "male");
      expect(profile.peakWkg["5s"]).toBe(14.0);
      expect(profile.peakWkg["1min"]).toBe(6.5);
      expect(profile.peakWkg["5min"]).toBe(4.5);
      expect(profile.peakWkg["20min"]).toBe(3.8);
    });

    it("returns 0 watts for missing durations", () => {
      const curve: PowerCurvePoint[] = [
        { secs: 5, watts: 1050, wkg: 14.0, date: "" },
      ];
      const profile = buildPowerProfile(curve, emptyCurve, "male");
      expect(profile.allTimePeaks["5s"]).toBe(1050);
      expect(profile.allTimePeaks["1min"]).toBe(0);
    });
  });

  describe("description", () => {
    it("matches the classified profile type", () => {
      const profile = buildPowerProfile(SPRINTER_ATHLETE.curve, emptyCurve, "male");
      expect(profile.type).toBe("Sprinter");
      expect(profile.description).toContain("sprint");
    });

    it("returns a non-empty description for all profile types", () => {
      for (const athlete of [SPRINTER_ATHLETE, CLIMBER_ATHLETE, ALL_ROUNDER_ATHLETE]) {
        const profile = buildPowerProfile(athlete.curve, emptyCurve, athlete.gender);
        expect(profile.description.length).toBeGreaterThan(0);
      }
    });
  });
});
