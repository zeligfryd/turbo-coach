import { describe, it, expect } from "vitest";
import { computeReadinessScore } from "@/lib/race/readiness";

describe("computeReadinessScore", () => {
  describe("null handling", () => {
    it("returns 50 when all metrics are null", () => {
      expect(computeReadinessScore({ ctl: null, atl: null, tsb: null, daysToRace: 7 })).toBe(50);
    });

    it("treats null CTL as 0 when other metrics present", () => {
      const score = computeReadinessScore({ ctl: null, atl: 50, tsb: 10, daysToRace: 1 });
      // fitnessScore = 0 (CTL=0), freshnessScore = 40 (TSB 5-15, days<=3), taperScore = 10 (days<3)
      expect(score).toBe(0 + 40 + 10);
    });
  });

  describe("fitness component (0-40)", () => {
    // fitnessScore = min(40, (ctl / 120) * 40)

    it("CTL 0 → fitness 0", () => {
      const score = computeReadinessScore({ ctl: 0, atl: 0, tsb: 10, daysToRace: 1 });
      // fitness=0, freshness=40 (TSB 5-15 close), taper=10 (days<3)
      expect(score).toBe(0 + 40 + 10);
    });

    it("CTL 60 → fitness 20", () => {
      const score = computeReadinessScore({ ctl: 60, atl: 50, tsb: 10, daysToRace: 1 });
      // fitness=20, freshness=40, taper=10
      expect(score).toBe(20 + 40 + 10);
    });

    it("CTL 120 → fitness 40 (cap)", () => {
      const score = computeReadinessScore({ ctl: 120, atl: 110, tsb: 10, daysToRace: 1 });
      // fitness=40, freshness=40, taper=10
      expect(score).toBe(40 + 40 + 10);
    });

    it("CTL 200 → fitness 40 (capped by Math.min)", () => {
      const score = computeReadinessScore({ ctl: 200, atl: 190, tsb: 10, daysToRace: 1 });
      expect(score).toBe(40 + 40 + 10);
    });
  });

  describe("freshness component — daysToRace <= 3", () => {
    const base = { ctl: 0, atl: 0 }; // fitness=0 to isolate freshness
    const taper = 10; // days < 3 → taperScore=10

    it("TSB 10 → 40 (perfect: 5-15)", () => {
      expect(computeReadinessScore({ ...base, tsb: 10, daysToRace: 1 })).toBe(0 + 40 + taper);
    });

    it("TSB 5 → 40 (boundary: exactly 5)", () => {
      expect(computeReadinessScore({ ...base, tsb: 5, daysToRace: 0 })).toBe(0 + 40 + taper);
    });

    it("TSB 15 → 40 (boundary: exactly 15)", () => {
      expect(computeReadinessScore({ ...base, tsb: 15, daysToRace: 3 })).toBe(0 + 40 + 15); // days=3 → taper=15
    });

    it("TSB 0 → 30 (good: 0-25)", () => {
      expect(computeReadinessScore({ ...base, tsb: 0, daysToRace: 2 })).toBe(0 + 30 + taper);
    });

    it("TSB 20 → 30 (good: within 0-25)", () => {
      expect(computeReadinessScore({ ...base, tsb: 20, daysToRace: 1 })).toBe(0 + 30 + taper);
    });

    it("TSB 25 → 30 (boundary: exactly 25, within 0-25)", () => {
      expect(computeReadinessScore({ ...base, tsb: 25, daysToRace: 1 })).toBe(0 + 30 + taper);
    });

    it("TSB -5 → 20 (slightly fatigued: -10 to 0)", () => {
      expect(computeReadinessScore({ ...base, tsb: -5, daysToRace: 1 })).toBe(0 + 20 + taper);
    });

    it("TSB -10 → 20 (boundary: exactly -10)", () => {
      expect(computeReadinessScore({ ...base, tsb: -10, daysToRace: 0 })).toBe(0 + 20 + taper);
    });

    it("TSB -15 → 5 (very fatigued: max(5, 20 + (-15)) = 5)", () => {
      expect(computeReadinessScore({ ...base, tsb: -15, daysToRace: 2 })).toBe(0 + 5 + taper);
    });

    it("TSB -30 → 5 (very fatigued: floor at 5)", () => {
      expect(computeReadinessScore({ ...base, tsb: -30, daysToRace: 0 })).toBe(0 + 5 + taper);
    });

    it("TSB 30 → 25 (too rested: > 25)", () => {
      expect(computeReadinessScore({ ...base, tsb: 30, daysToRace: 1 })).toBe(0 + 25 + taper);
    });
  });

  describe("freshness component — daysToRace 4-14", () => {
    const base = { ctl: 0, atl: 0 };

    it("TSB 0, days 7 → freshness 35", () => {
      expect(computeReadinessScore({ ...base, tsb: 0, daysToRace: 7 })).toBe(0 + 35 + 20);
    });

    it("TSB -5, days 10 → freshness 35 (boundary: exactly -5)", () => {
      expect(computeReadinessScore({ ...base, tsb: -5, daysToRace: 10 })).toBe(0 + 35 + 20);
    });

    it("TSB -10, days 5 → freshness 25 (-15 to -5 range)", () => {
      expect(computeReadinessScore({ ...base, tsb: -10, daysToRace: 5 })).toBe(0 + 25 + 15);
    });

    it("TSB -20, days 14 → freshness 15 (deep fatigue)", () => {
      expect(computeReadinessScore({ ...base, tsb: -20, daysToRace: 14 })).toBe(0 + 15 + 20);
    });
  });

  describe("freshness component — daysToRace > 14", () => {
    it("always returns freshness 30 regardless of TSB", () => {
      const base = { ctl: 0, atl: 0 };
      expect(computeReadinessScore({ ...base, tsb: -30, daysToRace: 30 })).toBe(0 + 30 + 18);
      expect(computeReadinessScore({ ...base, tsb: 20, daysToRace: 30 })).toBe(0 + 30 + 18);
    });
  });

  describe("taper component (0-20)", () => {
    const base = { ctl: 0, atl: 0, tsb: 10 };

    it("days 10 → 20 (ideal: 7-21)", () => {
      expect(computeReadinessScore({ ...base, daysToRace: 10 })).toBe(0 + 35 + 20); // 4-14 days, TSB>=5
    });

    it("days 7 → 20 (boundary)", () => {
      expect(computeReadinessScore({ ...base, daysToRace: 7 })).toBe(0 + 35 + 20);
    });

    it("days 21 → 20 (boundary)", () => {
      expect(computeReadinessScore({ ...base, daysToRace: 21 })).toBe(0 + 30 + 20); // >14 days freshness=30
    });

    it("days 5 → 15 (short taper: 3-6)", () => {
      expect(computeReadinessScore({ ...base, daysToRace: 5 })).toBe(0 + 35 + 15);
    });

    it("days 3 → 15 (boundary)", () => {
      // days=3 → freshness <=3 path: TSB 10 → 40, taper 3-6 → 15
      expect(computeReadinessScore({ ...base, daysToRace: 3 })).toBe(0 + 40 + 15);
    });

    it("days 1 → 10 (too late: < 3)", () => {
      expect(computeReadinessScore({ ...base, daysToRace: 1 })).toBe(0 + 40 + 10);
    });

    it("days 0 → 10 (race day)", () => {
      expect(computeReadinessScore({ ...base, daysToRace: 0 })).toBe(0 + 40 + 10);
    });

    it("days 30 → 18 (planning: > 21)", () => {
      expect(computeReadinessScore({ ...base, daysToRace: 30 })).toBe(0 + 30 + 18);
    });
  });

  describe("composite realistic scenarios", () => {
    it("peak readiness: CTL=100, TSB=10, days=1", () => {
      const score = computeReadinessScore({ ctl: 100, atl: 90, tsb: 10, daysToRace: 1 });
      // fitness = round(100/120*40) = 33.33, freshness = 40, taper = 10 → 83
      expect(score).toBe(83);
    });

    it("overtrained: CTL=90, TSB=-25, days=1", () => {
      const score = computeReadinessScore({ ctl: 90, atl: 115, tsb: -25, daysToRace: 1 });
      // fitness = 30, freshness = max(5, 20+(-25)) = 5, taper = 10 → 45
      // Actually: fitness = round(90/120*40) = 30
      expect(score).toBe(45);
    });

    it("undertrained but fresh: CTL=20, TSB=15, days=7", () => {
      const score = computeReadinessScore({ ctl: 20, atl: 5, tsb: 15, daysToRace: 7 });
      // fitness = round(20/120*40) ≈ 6.67 → 7, freshness (4-14 days, TSB>=5) = 35, taper = 20 → 62
      expect(score).toBe(62);
    });
  });

  describe("score bounds", () => {
    it("never returns below 0", () => {
      const score = computeReadinessScore({ ctl: 0, atl: 100, tsb: -50, daysToRace: 0 });
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("never returns above 100", () => {
      const score = computeReadinessScore({ ctl: 200, atl: 150, tsb: 10, daysToRace: 10 });
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
