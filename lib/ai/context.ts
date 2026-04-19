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

    return `- ${entry.scheduled_date} (${dayName(entry.scheduled_date)}): ${workout.name} (${workout.category}, ${duration}, avg ${intensity})`;
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
        .limit(8),
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
        .limit(7),
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

const formatRecentActivitiesSummary = (activities: RecentActivity[]): string => {
  if (activities.length === 0) {
    return "Recent actual activities: none synced.";
  }

  const totalTss = activities.reduce((s, a) => s + (a.icu_training_load ?? 0), 0);
  const totalMin = activities.reduce((s, a) => s + (a.moving_time ?? 0), 0);
  const totalKm = activities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000;
  const totalElev = activities.reduce((s, a) => s + (a.elevation_gain ?? 0), 0);
  const withPower = activities.filter((a) => a.normalized_power != null);
  const avgNp = withPower.length > 0
    ? Math.round(withPower.reduce((s, a) => s + a.normalized_power!, 0) / withPower.length)
    : null;

  // Show last 5 activities by name/date for quick reference
  const recent = activities.slice(0, 5).map((a) => {
    const duration = a.moving_time ? `${Math.round(a.moving_time / 60)}m` : "";
    const load = a.icu_training_load != null ? `TSS ${Math.round(a.icu_training_load)}` : "";
    const np = a.normalized_power != null ? `NP ${a.normalized_power}W` : "";
    const parts = [duration, load, np].filter(Boolean).join(", ");
    return `- ${a.activity_date} (${dayName(a.activity_date)}): ${a.name ?? a.type ?? "Activity"} (${parts})`;
  });

  const summaryLine = `Recent rides (last 14d): ${activities.length} rides, ${(totalMin / 3600).toFixed(1)}h, ${Math.round(totalTss)} TSS, ${totalKm.toFixed(0)}km, ${Math.round(totalElev)}m elev${avgNp ? `, avg NP ${avgNp}W` : ""}`;

  return [
    summaryLine,
    `Last ${recent.length} activities:`,
    ...recent,
    activities.length > 5 ? `  (+ ${activities.length - 5} more — use searchActivities tool for full details)` : "",
  ].filter(Boolean).join("\n");
};

const formatWellnessSummary = (days: WellnessDay[]): string => {
  if (days.length === 0) {
    return "Fitness/fatigue trend: no wellness data synced.";
  }

  // Show latest values + 7-day-ago values for trend
  const latest = days[0];
  const weekAgo = days.find((d, i) => i >= 6) ?? days[days.length - 1];

  const ctl = latest.ctl != null ? `CTL ${Math.round(latest.ctl)}` : "";
  const atl = latest.atl != null ? `ATL ${Math.round(latest.atl)}` : "";
  const tsb = latest.tsb != null ? `TSB ${Math.round(latest.tsb)}` : "";
  const ramp = latest.ramp_rate != null ? `ramp ${latest.ramp_rate.toFixed(1)}` : "";
  const restHr = latest.resting_hr != null ? `RHR ${latest.resting_hr}` : "";
  const hrv = latest.hrv != null ? `HRV ${latest.hrv}` : "";
  const parts = [ctl, atl, tsb, ramp, restHr, hrv].filter(Boolean).join(", ");

  const lines = [`Current fitness (${latest.date}): ${parts}`];

  if (weekAgo !== latest && weekAgo.ctl != null && latest.ctl != null) {
    const ctlDelta = Math.round(latest.ctl - weekAgo.ctl);
    const tsbDelta = weekAgo.tsb != null && latest.tsb != null ? Math.round(latest.tsb - weekAgo.tsb) : null;
    const trend = [
      `CTL ${ctlDelta >= 0 ? "+" : ""}${ctlDelta}`,
      tsbDelta != null ? `TSB ${tsbDelta >= 0 ? "+" : ""}${tsbDelta}` : "",
    ].filter(Boolean).join(", ");
    lines.push(`7-day trend: ${trend}`);
  }

  lines.push("Use getWellnessTrend tool for full daily breakdown.");

  return lines.join("\n");
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
    formatRecentActivitiesSummary(context.recentActivities),
    formatWellnessSummary(context.wellnessTrend),
    formatUpcomingRaces(context.upcomingRaces),
  ].join("\n\n");
};
