import { describe, it, expect } from "vitest";
import { computeWeekShiftOperations } from "@/lib/plans/week-shift";

describe("computeWeekShiftOperations", () => {
  it("returns an empty plan when no rows are at/after fromIndex", () => {
    const ops = computeWeekShiftOperations(
      [
        { id: "a", order_index: 0 },
        { id: "b", order_index: 1 },
      ],
      2,
    );
    expect(ops).toEqual([]);
  });

  it("ignores rows before fromIndex", () => {
    const ops = computeWeekShiftOperations(
      [
        { id: "a", order_index: 0 },
        { id: "b", order_index: 1 },
        { id: "c", order_index: 2 },
      ],
      2,
    );
    expect(ops.map((o) => o.id)).toEqual(["c"]);
  });

  it("sorts by original order_index descending", () => {
    // Deliberately unsorted input.
    const ops = computeWeekShiftOperations(
      [
        { id: "w2", order_index: 2 },
        { id: "w0", order_index: 0 },
        { id: "w4", order_index: 4 },
        { id: "w1", order_index: 1 },
        { id: "w3", order_index: 3 },
      ],
      1,
    );
    expect(ops.map((o) => o.id)).toEqual(["w4", "w3", "w2", "w1"]);
  });

  it("assigns each row a final_index = original + 1", () => {
    const ops = computeWeekShiftOperations(
      [
        { id: "a", order_index: 2 },
        { id: "b", order_index: 3 },
        { id: "c", order_index: 4 },
      ],
      2,
    );
    expect(ops.map((o) => [o.id, o.finalIndex])).toEqual([
      ["c", 5],
      ["b", 4],
      ["a", 3],
    ]);
  });

  it("park indices are all unique and disjoint from every final index", () => {
    const ops = computeWeekShiftOperations(
      [
        { id: "a", order_index: 0 },
        { id: "b", order_index: 1 },
        { id: "c", order_index: 2 },
        { id: "d", order_index: 3 },
      ],
      0,
    );
    const parks = ops.map((o) => o.parkIndex);
    const finals = ops.map((o) => o.finalIndex);
    expect(new Set(parks).size).toBe(parks.length);
    for (const p of parks) expect(finals).not.toContain(p);
    // Park indices are strictly negative — they can never collide with any
    // live row (which is always >= 0).
    for (const p of parks) expect(p).toBeLessThan(0);
  });

  it("simulates a serial apply without constraint violations", () => {
    // Start state: 4 weeks at indices 0..3. We insert at index 1; rows 1..3
    // must end at 2..4. Simulate the two phases row-by-row and assert the
    // (block, order_index) uniqueness invariant holds at every step.
    const live = new Map<string, number>([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 3],
    ]);
    const ops = computeWeekShiftOperations(
      [
        { id: "a", order_index: 0 },
        { id: "b", order_index: 1 },
        { id: "c", order_index: 2 },
        { id: "d", order_index: 3 },
      ],
      1,
    );

    function assertUnique() {
      const vals = Array.from(live.values());
      expect(new Set(vals).size).toBe(vals.length);
    }

    for (const op of ops) {
      live.set(op.id, op.parkIndex);
      assertUnique();
    }
    for (const op of ops) {
      live.set(op.id, op.finalIndex);
      assertUnique();
    }

    expect(live.get("a")).toBe(0);
    expect(live.get("b")).toBe(2);
    expect(live.get("c")).toBe(3);
    expect(live.get("d")).toBe(4);
  });
});
