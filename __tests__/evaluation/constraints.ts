/**
 * Reusable assertion helpers for validating LLM-generated pacing plans.
 * These check structural validity and domain-specific constraints.
 */

import { expect } from "vitest";
import type { PacingPlan } from "@/lib/race/types";

/** All required fields present and typed correctly. */
export function assertValidSchema(plan: PacingPlan) {
  expect(typeof plan.overallTargetNpW).toBe("number");
  expect(plan.overallTargetNpW).toBeGreaterThan(0);
  expect(typeof plan.estimatedFinishTimeMin).toBe("number");
  expect(plan.estimatedFinishTimeMin).toBeGreaterThan(0);
  expect(typeof plan.strategy).toBe("string");
  expect(plan.strategy.length).toBeGreaterThan(10);
  expect(Array.isArray(plan.segments)).toBe(true);
  expect(plan.segments.length).toBeGreaterThan(0);

  for (const seg of plan.segments) {
    expect(typeof seg.label).toBe("string");
    expect(seg.label.length).toBeGreaterThan(0);
    expect(typeof seg.startKm).toBe("number");
    expect(typeof seg.endKm).toBe("number");
    expect(typeof seg.targetPowerW).toBe("number");
    expect(typeof seg.targetPowerPercent).toBe("number");
    expect(typeof seg.estimatedTimeMin).toBe("number");
    expect(typeof seg.advice).toBe("string");
  }
}

/**
 * Watts ≈ round(FTP × percent/100), with a tolerance of ±5W.
 * Allows for rounding differences between LLM-generated values.
 */
export function assertPowerConsistency(plan: PacingPlan, ftp: number, toleranceW = 5) {
  for (const seg of plan.segments) {
    if (seg.targetPowerPercent > 0 && seg.targetPowerW > 0) {
      const expectedW = Math.round(ftp * (seg.targetPowerPercent / 100));
      expect(
        Math.abs(seg.targetPowerW - expectedW),
        `Segment "${seg.label}": ${seg.targetPowerW}W vs expected ${expectedW}W (${seg.targetPowerPercent}% of ${ftp}W FTP)`
      ).toBeLessThanOrEqual(toleranceW);
    }
  }
}

/**
 * Flat segments should have power within the duration bucket range.
 * Duration buckets: <1h 95-105%, 1-2h 90-95%, 2-3h 85-90%, 3-4h 80-86%, 4h+ 75-82%
 */
export function assertFlatTargetInRange(plan: PacingPlan, ftp: number) {
  const finishMin = plan.estimatedFinishTimeMin;
  let lower: number, upper: number;

  if (finishMin < 60) {
    lower = 95; upper = 105;
  } else if (finishMin < 120) {
    lower = 90; upper = 95;
  } else if (finishMin < 180) {
    lower = 85; upper = 90;
  } else if (finishMin < 240) {
    lower = 80; upper = 86;
  } else {
    lower = 75; upper = 82;
  }

  // Allow ±5% margin for LLM variability
  const margin = 5;

  for (const seg of plan.segments) {
    const label = seg.label.toLowerCase();
    if (label.includes("flat") || label.includes("start") || label.includes("opening")) {
      if (seg.targetPowerPercent > 0) {
        expect(
          seg.targetPowerPercent,
          `Flat segment "${seg.label}" at ${seg.targetPowerPercent}% FTP, expected ${lower}-${upper}%`
        ).toBeGreaterThanOrEqual(lower - margin);
        expect(
          seg.targetPowerPercent,
          `Flat segment "${seg.label}" at ${seg.targetPowerPercent}% FTP, expected ${lower}-${upper}%`
        ).toBeLessThanOrEqual(upper + margin);
      }
    }
  }
}

/**
 * Climb segments should be within the expected ranges:
 * - Short (<5min): 110-120% FTP
 * - Medium (5-20min): 100-108% FTP
 * - Long (20min+): 95-103% FTP
 */
export function assertClimbTargetsInRange(plan: PacingPlan, ftp: number) {
  const margin = 8; // LLM tolerance

  for (const seg of plan.segments) {
    const label = seg.label.toLowerCase();
    if (!label.includes("climb")) continue;
    if (seg.targetPowerPercent <= 0) continue;

    const estMin = seg.estimatedTimeMin;

    if (estMin < 5) {
      // Short climb
      expect(
        seg.targetPowerPercent,
        `Short climb "${seg.label}" (${estMin}min) at ${seg.targetPowerPercent}%`
      ).toBeGreaterThanOrEqual(110 - margin);
      expect(seg.targetPowerPercent).toBeLessThanOrEqual(120 + margin);
    } else if (estMin <= 20) {
      // Medium climb
      expect(
        seg.targetPowerPercent,
        `Medium climb "${seg.label}" (${estMin}min) at ${seg.targetPowerPercent}%`
      ).toBeGreaterThanOrEqual(100 - margin);
      expect(seg.targetPowerPercent).toBeLessThanOrEqual(108 + margin);
    } else {
      // Long climb
      expect(
        seg.targetPowerPercent,
        `Long climb "${seg.label}" (${estMin}min) at ${seg.targetPowerPercent}%`
      ).toBeGreaterThanOrEqual(95 - margin);
      expect(seg.targetPowerPercent).toBeLessThanOrEqual(103 + margin);
    }
  }
}

/**
 * Climb segment advice should mention W/kg.
 */
export function assertClimbAdviceContainsWkg(plan: PacingPlan) {
  for (const seg of plan.segments) {
    if (seg.label.toLowerCase().includes("climb") && seg.advice.length > 0) {
      expect(
        seg.advice.toLowerCase(),
        `Climb "${seg.label}" advice should mention W/kg`
      ).toMatch(/w\/kg|watts?\s*per\s*k(ilo)?g/i);
    }
  }
}

/**
 * Segments should cover the full route distance (±5km tolerance).
 */
export function assertSegmentCoverage(plan: PacingPlan, totalKm: number, toleranceKm = 5) {
  if (plan.segments.length === 0) return;

  const lastSeg = plan.segments[plan.segments.length - 1];
  const coveredKm = lastSeg.endKm;

  expect(
    Math.abs(coveredKm - totalKm),
    `Segments cover ${coveredKm}km but route is ${totalKm}km`
  ).toBeLessThanOrEqual(toleranceKm);
}
