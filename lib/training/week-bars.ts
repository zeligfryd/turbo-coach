/**
 * Scaling the week strip.
 *
 * Riding and off-bike work do not belong on one scale. A day is 60–300 riding
 * minutes and 8–45 off-bike ones, so a shared axis renders the off-bike work as
 * a hairline — and every fix for that lies in one direction or the other:
 *
 *   • A minimum height distorts the small end by an unbounded amount: 12
 *     minutes floored to 6px in a 36px track claims 17% of a two-hour ride.
 *   • A log scale distorts the large end instead. With log(1+x), 12 minutes
 *     reads as 53% of a two-hour ride — it makes the small values visible by
 *     flattening the difference the strip exists to show.
 *   • A square root is milder but still puts 10% of the work at 32% height.
 *
 * So they get a lane each, and neither claims to be comparable with the other.
 * Riding is scaled to the week's own biggest day, because what matters there is
 * relative shape. Off-bike is scaled against a fixed reference instead, so a
 * quiet week does not inflate a single ten-minute session into a full bar and
 * the lane means the same thing from one week to the next.
 */

/** Off-bike sessions run 8–45 minutes; half an hour fills the lane. */
export const OFF_BIKE_FULL_MIN = 30;

/** The riding lane never scales to less than an hour, so one short ride is not full height. */
export const RIDING_FLOOR_MIN = 60;

export type DayBars = {
  /** 0–1 of the riding lane. */
  riding: number;
  /** 0–1 of the off-bike lane. */
  offBike: number;
};

export function ridingPeak(days: { minutes: number }[]): number {
  return Math.max(RIDING_FLOOR_MIN, ...days.map((day) => day.minutes));
}

/**
 * Both fractions for one day.
 *
 * A day with any off-bike work gets at least a fifth of its lane: the lane is
 * only a few pixels tall, so below that a real session is indistinguishable
 * from an empty day — which was the original complaint. Bounded, unlike a floor
 * on a shared axis, because the lane is not carrying a comparison with riding.
 */
export function dayBars(
  day: { minutes: number; offBikeMinutes: number },
  peak: number,
): DayBars {
  return {
    riding: day.minutes > 0 ? Math.min(1, day.minutes / peak) : 0,
    offBike:
      day.offBikeMinutes > 0
        ? Math.min(1, Math.max(0.2, day.offBikeMinutes / OFF_BIKE_FULL_MIN))
        : 0,
  };
}
