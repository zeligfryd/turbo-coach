import type { SupabaseClient } from "@supabase/supabase-js";

import { matchPlannedToRides, type PlannedRow, type RiddenRow } from "../reconcile";

/** How far back to look for planned sessions a sync might settle. */
const LOOKBACK_DAYS = 400;

/**
 * Mark planned workouts done where a synced ride shows they happened.
 *
 * Runs after every activity sync. Idempotent: only rows still 'planned' are
 * considered, and each is stamped with the ride that settled it, so a second
 * pass finds nothing to do.
 *
 * Deliberately silent about failure to the caller's flow — a sync that
 * imported rides correctly should not be reported as failed because the
 * bookkeeping afterwards went wrong.
 */
export async function reconcilePlannedWorkouts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ reconciled: number }> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [{ data: planned }, { data: ridden }] = await Promise.all([
    supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, day_part, created_at")
      .eq("user_id", userId)
      .eq("status", "planned")
      .gte("scheduled_date", since),
    supabase
      .from("activities")
      .select("id, activity_date, moving_time")
      .eq("user_id", userId)
      .gte("activity_date", since),
  ]);

  if (!planned?.length || !ridden?.length) return { reconciled: 0 };

  const pairings = matchPlannedToRides(planned as PlannedRow[], ridden as RiddenRow[]);
  if (pairings.length === 0) return { reconciled: 0 };

  // One statement per pairing: each row takes a different activity id, so
  // there is no single bulk update that expresses this.
  const writes = await Promise.all(
    pairings.map((pair) =>
      supabase
        .from("scheduled_workouts")
        .update({ status: "done", completed_activity_id: pair.activityId })
        .eq("id", pair.scheduledWorkoutId)
        .eq("status", "planned"), // never overwrite a status set since we read
    ),
  );

  return { reconciled: writes.filter((w) => !w.error).length };
}
