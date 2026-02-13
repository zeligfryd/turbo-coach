import { createClient } from "@/lib/supabase/server";

type WorkoutItem = {
  id: string;
  name: string;
  category: string;
  duration_seconds: number | null;
  avg_intensity_percent: number | null;
  intervals: unknown;
};

type ScheduledWorkoutItem = {
  id: string;
  scheduled_date: string;
  workout: WorkoutItem | WorkoutItem[] | null;
};

export type CoachUserContext = {
  ftp: number | null;
  weight: number | null;
  recentScheduledWorkouts: ScheduledWorkoutItem[];
  upcomingScheduledWorkouts: ScheduledWorkoutItem[];
};

const formatIntervalSummary = (intervals: unknown): string => {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    return "No interval structure available.";
  }

  const summary = intervals
    .slice(0, 6)
    .map((item) => {
      if (!item || typeof item !== "object" || !("type" in item)) {
        return "Unknown interval block";
      }

      const typedItem = item as { type: string; data?: Record<string, unknown> };
      if (typedItem.type === "interval") {
        const duration = typedItem.data?.durationSeconds;
        const start = typedItem.data?.intensityPercentStart;
        const end = typedItem.data?.intensityPercentEnd;
        if (typeof duration === "number") {
          if (typeof start === "number" && typeof end === "number" && start !== end) {
            return `${Math.round(duration / 60)}m ramp ${start}%->${end}%`;
          }
          if (typeof start === "number") {
            return `${Math.round(duration / 60)}m @ ${start}%`;
          }
        }
        return "Interval block";
      }

      if (typedItem.type === "repeat") {
        const count = typedItem.data?.count;
        const inner = typedItem.data?.intervals;
        const innerCount = Array.isArray(inner) ? inner.length : 0;
        return `Repeat x${typeof count === "number" ? count : "?"} (${innerCount} intervals)`;
      }

      return "Unknown interval block";
    })
    .join(", ");

  return intervals.length > 6 ? `${summary}, ...` : summary;
};

const normalizeWorkout = (workout: WorkoutItem | WorkoutItem[] | null): WorkoutItem | null => {
  if (Array.isArray(workout)) {
    return workout[0] ?? null;
  }
  return workout;
};

const formatScheduledWorkouts = (
  workouts: ScheduledWorkoutItem[],
  label: "Recent" | "Upcoming"
): string => {
  if (workouts.length === 0) {
    return `${label} scheduled workouts: none.`;
  }

  const lines = workouts.map((entry) => {
    const workout = normalizeWorkout(entry.workout);
    if (!workout) {
      return `- ${entry.scheduled_date}: Missing workout details`;
    }

    const duration = workout.duration_seconds ? `${Math.round(workout.duration_seconds / 60)}m` : "n/a";
    const intensity =
      typeof workout.avg_intensity_percent === "number"
        ? `${workout.avg_intensity_percent}%`
        : "n/a";
    const intervalSummary = formatIntervalSummary(workout.intervals);

    return `- ${entry.scheduled_date}: ${workout.name} (${workout.category}, ${duration}, avg ${intensity}) | ${intervalSummary}`;
  });

  return `${label} scheduled workouts:\n${lines.join("\n")}`;
};

export async function loadCoachUserContext(userId: string): Promise<CoachUserContext> {
  const supabase = await createClient();

  const today = new Date();
  const recentStart = new Date(today);
  recentStart.setDate(today.getDate() - 14);
  const upcomingEnd = new Date(today);
  upcomingEnd.setDate(today.getDate() + 7);

  const toDate = (value: Date) => value.toISOString().slice(0, 10);

  const [{ data: profile }, { data: recentScheduledWorkouts }, { data: upcomingScheduledWorkouts }] =
    await Promise.all([
      supabase.from("users").select("ftp, weight").eq("id", userId).maybeSingle(),
      supabase
        .from("scheduled_workouts")
        .select(
          `
            id,
            scheduled_date,
            workout:workouts (
              id,
              name,
              category,
              duration_seconds,
              avg_intensity_percent,
              intervals
            )
          `
        )
        .eq("user_id", userId)
        .gte("scheduled_date", toDate(recentStart))
        .lte("scheduled_date", toDate(today))
        .order("scheduled_date", { ascending: false })
        .limit(12),
      supabase
        .from("scheduled_workouts")
        .select(
          `
            id,
            scheduled_date,
            workout:workouts (
              id,
              name,
              category,
              duration_seconds,
              avg_intensity_percent,
              intervals
            )
          `
        )
        .eq("user_id", userId)
        .gt("scheduled_date", toDate(today))
        .lte("scheduled_date", toDate(upcomingEnd))
        .order("scheduled_date", { ascending: true })
        .limit(10),
    ]);

  return {
    ftp: profile?.ftp ?? null,
    weight: profile?.weight ?? null,
    recentScheduledWorkouts: (recentScheduledWorkouts as ScheduledWorkoutItem[] | null) ?? [],
    upcomingScheduledWorkouts: (upcomingScheduledWorkouts as ScheduledWorkoutItem[] | null) ?? [],
  };
}

export const formatCoachUserContext = (context: CoachUserContext): string => {
  const profileLines = [
    `FTP: ${context.ftp ?? "unknown"} watts`,
    `Weight: ${context.weight ?? "unknown"} kg`,
  ];

  return [
    "User context:",
    profileLines.map((line) => `- ${line}`).join("\n"),
    formatScheduledWorkouts(context.recentScheduledWorkouts, "Recent"),
    formatScheduledWorkouts(context.upcomingScheduledWorkouts, "Upcoming"),
  ].join("\n\n");
};
