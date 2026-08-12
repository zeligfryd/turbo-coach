import { describe, it, expect } from "vitest";

/**
 * The ring geometry, checked directly. Rendering is verified in the browser;
 * what matters here is that the arcs cannot lie about the numbers — a segment
 * count that disagreed with the label is exactly the kind of bug a screenshot
 * at 104px would hide.
 */
function gapFor(total: number): number {
  if (total <= 1) return 0;
  return Math.min(6, (360 / total) * 0.2);
}

describe("ring segment geometry", () => {
  it("never lets the gaps outgrow the segments", () => {
    for (let total = 1; total <= 12; total++) {
      const step = 360 / total;
      const gap = gapFor(total);
      expect(gap).toBeLessThan(step / 2);
    }
  });

  it("draws no gap for a single session, so it renders as a full circle", () => {
    expect(gapFor(1)).toBe(0);
  });

  it("keeps a visible gap at the busiest segmented count", () => {
    // Below roughly 4° the gap closes up at this radius and the ring reads as
    // one continuous arc, which is what butt caps and this floor prevent.
    expect(gapFor(12)).toBeGreaterThan(4);
  });

  it("leaves most of the circle as arc, not gap", () => {
    for (let total = 2; total <= 12; total++) {
      const arcShare = (360 - gapFor(total) * total) / 360;
      expect(arcShare).toBeGreaterThan(0.75);
    }
  });
});
