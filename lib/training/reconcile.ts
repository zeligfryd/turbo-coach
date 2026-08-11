/**
 * Pairing planned workouts with the rides that actually happened.
 *
 * The plan is written by hand; the rides arrive from intervals.icu. Nothing
 * used to connect them, so a planned workout stayed 'planned' forever even
 * when the ride was sitting on the same day — turning the calendar into a
 * backlog only manual ticking could clear.
 *
 * Kept pure and separate from the Supabase call so the pairing rule can be
 * tested directly. `reconcilePlannedWorkouts` in service/reconcile.ts does the
 * IO around it.
 */

export type PlannedRow = {
  id: string;
  scheduled_date: string; // YYYY-MM-DD
  day_part: string;
  created_at: string | null;
};

export type RiddenRow = {
  id: string;
  activity_date: string; // YYYY-MM-DD
  moving_time: number | null;
};

export type Pairing = { scheduledWorkoutId: string; activityId: string };

const DAY_PART_ORDER: Record<string, number> = { am: 0, midday: 1, pm: 2 };

function byPlanOrder(a: PlannedRow, b: PlannedRow): number {
  const part = (DAY_PART_ORDER[a.day_part] ?? 9) - (DAY_PART_ORDER[b.day_part] ?? 9);
  if (part !== 0) return part;
  const created = (a.created_at ?? "").localeCompare(b.created_at ?? "");
  return created !== 0 ? created : a.id.localeCompare(b.id);
}

function byRideSize(a: RiddenRow, b: RiddenRow): number {
  const size = (b.moving_time ?? -1) - (a.moving_time ?? -1);
  return size !== 0 ? size : a.id.localeCompare(b.id);
}

function groupByDate<T>(rows: T[], date: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = date(row);
    const bucket = out.get(key);
    if (bucket) bucket.push(row);
    else out.set(key, [row]);
  }
  return out;
}

/**
 * Which planned workouts a set of rides settles.
 *
 * One ride satisfies at most one workout. Where a day holds several of each,
 * the nth planned session pairs with the nth ride — longest ride first, since
 * a day with a long ride and a spin is far more likely to be the main session
 * plus an extra than the reverse.
 *
 * A day with two planned workouts and one ride therefore settles one and
 * leaves the other outstanding. That is deliberate: letting a single ride
 * satisfy everything scheduled that day would overstate what was done, and the
 * whole point of this is that the record should be able to be trusted.
 */
export function matchPlannedToRides(planned: PlannedRow[], ridden: RiddenRow[]): Pairing[] {
  const ridesByDate = groupByDate(ridden, (r) => r.activity_date);
  const pairings: Pairing[] = [];

  for (const [date, sessions] of groupByDate(planned, (p) => p.scheduled_date)) {
    const rides = ridesByDate.get(date);
    if (!rides || rides.length === 0) continue;

    const orderedSessions = [...sessions].sort(byPlanOrder);
    const orderedRides = [...rides].sort(byRideSize);

    for (let i = 0; i < Math.min(orderedSessions.length, orderedRides.length); i++) {
      pairings.push({
        scheduledWorkoutId: orderedSessions[i].id,
        activityId: orderedRides[i].id,
      });
    }
  }

  return pairings;
}

/**
 * A planned session whose day has passed with no ride to show for it.
 *
 * Derived rather than stored. Marking these 'skipped' in the database would be
 * writing a judgement we cannot actually make — a ride may sync late, or the
 * session may have happened without a recording. Leaving the row alone and
 * deriving the state means the calendar can show it quietly without the record
 * claiming something untrue.
 */
export function isMissed(scheduledDate: string, status: string, today: string): boolean {
  return status === "planned" && scheduledDate < today;
}
