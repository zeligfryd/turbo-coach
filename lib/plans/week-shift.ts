export type WeekShiftRow = { id: string; order_index: number };

export type WeekShiftOp = {
  id: string;
  /** Non-colliding negative placeholder used during phase 1. */
  parkIndex: number;
  /** Target order_index applied in phase 2. */
  finalIndex: number;
};

/**
 * Compute the two-phase update plan for shifting weeks forward by +1 starting
 * at fromIndex.
 *
 * The database enforces a unique (block_id, order_index) constraint, so we
 * can't simply "UPDATE … SET order_index = order_index + 1" — it collides
 * as soon as the first row overlaps its neighbour. Instead, we park every
 * affected row at a disjoint negative index (phase 1) and then move each
 * one to its final +1 slot (phase 2).
 *
 * Rows are returned in descending original order_index so that a naive
 * serial application never produces two rows with the same final_index
 * mid-run.
 */
export function computeWeekShiftOperations(
  rows: WeekShiftRow[],
  fromIndex: number,
): WeekShiftOp[] {
  return rows
    .filter((r) => r.order_index >= fromIndex)
    .sort((a, b) => b.order_index - a.order_index)
    .map((r) => ({
      id: r.id,
      parkIndex: -(r.order_index + 2),
      finalIndex: r.order_index + 1,
    }));
}
