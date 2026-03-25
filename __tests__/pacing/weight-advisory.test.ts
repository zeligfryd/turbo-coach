import { describe, it, expect } from "vitest";
import { buildWeightAdvisory } from "@/lib/pacing/prompt";

describe("buildWeightAdvisory", () => {
  describe("STRONG tier (weight >= 85 && elevation >= 2500)", () => {
    it("90kg + 3000m → STRONG", () => {
      const result = buildWeightAdvisory(90, 3000);
      expect(result.join("\n")).toContain("STRONG");
    });

    it("85kg + 2500m → STRONG (boundary)", () => {
      const result = buildWeightAdvisory(85, 2500);
      expect(result.join("\n")).toContain("STRONG");
    });

    it("includes weight and elevation in message", () => {
      const result = buildWeightAdvisory(90, 3000);
      expect(result.join("\n")).toContain("90kg");
      expect(result.join("\n")).toContain("3000m");
    });
  });

  describe("MODERATE tier (weight >= 80 && elevation >= 2000)", () => {
    it("82kg + 2200m → MODERATE", () => {
      const result = buildWeightAdvisory(82, 2200);
      expect(result.join("\n")).toContain("MODERATE");
    });

    it("80kg + 2000m → MODERATE (boundary)", () => {
      const result = buildWeightAdvisory(80, 2000);
      expect(result.join("\n")).toContain("MODERATE");
    });

    it("84kg + 2499m → MODERATE (just below STRONG elevation)", () => {
      const result = buildWeightAdvisory(84, 2499);
      expect(result.join("\n")).toContain("MODERATE");
    });
  });

  describe("LIGHT tier (weight >= 75 && elevation >= 1500)", () => {
    it("76kg + 1600m → LIGHT", () => {
      const result = buildWeightAdvisory(76, 1600);
      expect(result.join("\n")).toContain("WEIGHT NOTE");
    });

    it("75kg + 1500m → LIGHT (boundary)", () => {
      const result = buildWeightAdvisory(75, 1500);
      expect(result.join("\n")).toContain("WEIGHT NOTE");
    });
  });

  describe("no advisory", () => {
    it("74kg + 1500m → none (weight below threshold)", () => {
      const result = buildWeightAdvisory(74, 1500);
      expect(result).toEqual([]);
    });

    it("85kg + 1000m → none (high weight, low elevation)", () => {
      const result = buildWeightAdvisory(85, 1000);
      expect(result).toEqual([]);
    });

    it("null weight → none", () => {
      const result = buildWeightAdvisory(null, 3000);
      expect(result).toEqual([]);
    });

    it("70kg + 500m → none (both below all thresholds)", () => {
      const result = buildWeightAdvisory(70, 500);
      expect(result).toEqual([]);
    });
  });

  describe("tier priority (STRONG > MODERATE > LIGHT)", () => {
    it("85kg + 2500m returns STRONG not MODERATE", () => {
      const result = buildWeightAdvisory(85, 2500);
      const text = result.join("\n");
      expect(text).toContain("STRONG");
      expect(text).not.toContain("MODERATE");
    });

    it("80kg + 2000m returns MODERATE not LIGHT", () => {
      const result = buildWeightAdvisory(80, 2000);
      const text = result.join("\n");
      expect(text).toContain("MODERATE");
      expect(text).not.toContain("WEIGHT NOTE");
    });
  });
});
