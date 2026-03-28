import { createClient } from "@/lib/supabase/server";
import { daysUntilRace } from "@/lib/race/readiness";
import type { PowerProfile } from "@/lib/power/types";

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

type RecentActivity = {
  activity_date: string;
  name: string | null;
  type: string | null;
  moving_time: number | null;
  icu_training_load: number | null;
  avg_power: number | null;
  normalized_power: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_cadence: number | null;
  distance: number | null;
  elevation_gain: number | null;
  calories: number | null;
};

type WellnessDay = {
  date: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  ramp_rate: number | null;
  resting_hr: number | null;
  hrv: number | null;
};

export type CoachMemoryItem = {
  id: string;
  category: string;
  content: string;
};

type UpcomingRace = {
  id: string;
  name: string;
  race_date: string;
  event_type: string;
  distance_km: number | null;
  elevation_m: number | null;
  readiness_score: number | null;
};

export type CoachUserContext = {
  ftp: number | null;
  weight: number | null;
  recentScheduledWorkouts: ScheduledWorkoutItem[];
  upcomingScheduledWorkouts: ScheduledWorkoutItem[];
  recentActivities: RecentActivity[];
  wellnessTrend: WellnessDay[];
  memories: CoachMemoryItem[];
  upcomingRaces: UpcomingRace[];
  powerProfile: PowerProfile | null;
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
      return `- ${entry.scheduled_date} (${dayName(entry.scheduled_date)}): Missing workout details`;
    }

    const duration = workout.duration_seconds ? `${Math.round(workout.duration_seconds / 60)}m` : "n/a";
    const intensity =
      typeof workout.avg_intensity_percent === "number"
        ? `${workout.avg_intensity_percent}%`
        : "n/a";
    const intervalSummary = formatIntervalSummary(workout.intervals);

    return `- ${entry.scheduled_date} (${dayName(entry.scheduled_date)}): ${workout.name} (${workout.category}, ${duration}, avg ${intensity}) | ${intervalSummary}`;
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

  const raceLookahead = new Date(today);
  raceLookahead.setDate(today.getDate() + 180);

  const [
    { data: profile },
    { data: recentScheduledWorkouts },
    { data: upcomingScheduledWorkouts },
    { data: recentActivitiesData },
    { data: wellnessData },
    { data: memoriesData },
    { data: racesData },
    { data: powerCurveCache },
  ] = await Promise.all([
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
      supabase
        .from("activities")
        .select(
          "activity_date, name, type, moving_time, icu_training_load, avg_power, normalized_power, avg_hr, max_hr, avg_cadence, distance, elevation_gain, calories"
        )
        .eq("user_id", userId)
        .gte("activity_date", toDate(recentStart))
        .lte("activity_date", toDate(today))
        .order("activity_date", { ascending: false }),
      supabase
        .from("wellness")
        .select("date, ctl, atl, tsb, ramp_rate, resting_hr, hrv")
        .eq("user_id", userId)
        .gte("date", toDate(recentStart))
        .lte("date", toDate(today))
        .order("date", { ascending: false })
        .limit(14),
      supabase
        .from("coach_memories")
        .select("id, category, content")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("race_events")
        .select("id, name, race_date, event_type, distance_km, elevation_m, readiness_score")
        .eq("user_id", userId)
        .gte("race_date", toDate(today))
        .lte("race_date", toDate(raceLookahead))
        .order("race_date", { ascending: true })
        .limit(5),
      supabase
        .from("power_curve_cache")
        .select("profile")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  const memories = (memoriesData as CoachMemoryItem[] | null) ?? [];
  if (memories.length > 0) {
    console.log("[Memory] Loaded", memories.length, "memories for context");
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const powerProfile = (powerCurveCache as any)?.profile as PowerProfile | null ?? null;

  const context: CoachUserContext = {
    ftp: profile?.ftp ?? null,
    weight: profile?.weight ?? null,
    recentScheduledWorkouts: (recentScheduledWorkouts as ScheduledWorkoutItem[] | null) ?? [],
    upcomingScheduledWorkouts: (upcomingScheduledWorkouts as ScheduledWorkoutItem[] | null) ?? [],
    recentActivities: (recentActivitiesData as RecentActivity[] | null) ?? [],
    wellnessTrend: (wellnessData as WellnessDay[] | null) ?? [],
    memories,
    upcomingRaces: (racesData as UpcomingRace[] | null) ?? [],
    powerProfile,
  };

  return context;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const dayName = (dateStr: string) => DAY_NAMES[new Date(dateStr + "T00:00:00Z").getUTCDay()];

const formatRecentActivities = (activities: RecentActivity[]): string => {
  if (activities.length === 0) {
    return "Recent actual activities: none synced.";
  }

  const lines = activities.map((a) => {
    const duration = a.moving_time ? `${Math.round(a.moving_time / 60)}m` : "n/a";
    const load =
      a.icu_training_load != null ? `Load ${Math.round(a.icu_training_load)}` : "";
    const power = a.avg_power != null ? `avg ${a.avg_power}W` : "";
    const np = a.normalized_power != null ? `NP ${a.normalized_power}W` : "";
    const hr = a.avg_hr != null ? `${a.avg_hr}bpm` : "";
    const maxHr = a.max_hr != null ? `max ${a.max_hr}bpm` : "";
    const cadence = a.avg_cadence != null ? `${a.avg_cadence}rpm` : "";
    const dist = a.distance != null ? `${(a.distance / 1000).toFixed(1)}km` : "";
    const elev = a.elevation_gain != null ? `${Math.round(a.elevation_gain)}m elev` : "";
    const cal = a.calories != null ? `${a.calories}kcal` : "";
    const metrics = [duration, dist, elev, load, power, np, hr, maxHr, cadence, cal].filter(Boolean).join(", ");
    return `- ${a.activity_date} (${dayName(a.activity_date)}): ${a.name ?? a.type ?? "Activity"} (${metrics})`;
  });

  return `Recent actual activities:\n${lines.join("\n")}`;
};

const formatWellnessTrend = (days: WellnessDay[]): string => {
  if (days.length === 0) {
    return "Fitness/fatigue trend: no wellness data synced.";
  }

  const lines = days.map((d) => {
    const ctl = d.ctl != null ? `CTL ${Math.round(d.ctl)}` : "";
    const atl = d.atl != null ? `ATL ${Math.round(d.atl)}` : "";
    const tsb = d.tsb != null ? `TSB ${Math.round(d.tsb)}` : "";
    const ramp = d.ramp_rate != null ? `ramp ${d.ramp_rate.toFixed(1)}` : "";
    const restHr = d.resting_hr != null ? `RHR ${d.resting_hr}` : "";
    const hrv = d.hrv != null ? `HRV ${d.hrv}` : "";
    const parts = [ctl, atl, tsb, ramp, restHr, hrv].filter(Boolean).join(", ");
    return `- ${d.date} (${dayName(d.date)}): ${parts}`;
  });

  return `Fitness/fatigue trend (last 14 days):\n${lines.join("\n")}`;
};

const formatUpcomingRaces = (races: UpcomingRace[]): string => {
  if (races.length === 0) {
    return "Upcoming races: none.";
  }

  const lines = races.map((r) => {
    const days = daysUntilRace(r.race_date);
    const dist = r.distance_km != null ? `${r.distance_km}km` : "";
    const elev = r.elevation_m != null ? `${Math.round(r.elevation_m)}m elev` : "";
    const score = r.readiness_score != null ? `readiness ${r.readiness_score}/100` : "";
    const parts = [dist, elev, score].filter(Boolean).join(", ");
    return `- ${r.race_date} (${days} days): ${r.name} (${r.event_type}${parts ? `, ${parts}` : ""})`;
  });

  return `Upcoming races:\n${lines.join("\n")}`;
};

const formatPowerProfile = (profile: PowerProfile | null): string => {
  if (!profile) return "Power profile: not yet computed (needs more ride data).";

  const scores = Object.entries(profile.scores)
    .map(([k, v]) => `${k}: ${v}/6`)
    .join(", ");

  const peaks = Object.entries(profile.allTimePeaks)
    .map(([k, v]) => {
      const wkg = profile.peakWkg[k];
      return `${k}: ${v}W${wkg != null ? ` (${wkg} W/kg)` : ""}`;
    })
    .join(", ");

  return [
    `Power profile type: ${profile.type}`,
    `Scores (Coggan 1-6): ${scores}`,
    `All-time peaks: ${peaks}`,
    `Biggest weakness: ${profile.weakness}`,
    `Profile description: ${profile.description}`,
  ].join("\n");
};

export const formatCoachUserContext = (context: CoachUserContext): string => {
  const profileLines = [
    `FTP: ${context.ftp ?? "unknown"} watts`,
    `Weight: ${context.weight ?? "unknown"} kg`,
  ];

  return [
    "User context:",
    profileLines.map((line) => `- ${line}`).join("\n"),
    formatPowerProfile(context.powerProfile),
    formatScheduledWorkouts(context.recentScheduledWorkouts, "Recent"),
    formatScheduledWorkouts(context.upcomingScheduledWorkouts, "Upcoming"),
    formatRecentActivities(context.recentActivities),
    formatWellnessTrend(context.wellnessTrend),
    formatUpcomingRaces(context.upcomingRaces),
  ].join("\n\n");
};
