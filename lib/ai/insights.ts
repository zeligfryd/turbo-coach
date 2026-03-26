import { generateText } from "ai";
import { resolveModels } from "@/lib/ai/models";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generate a weekly training summary for a user.
 * Called by the cron endpoint (or manually) for users with weekly_summary_enabled = true.
 */
export async function generateWeeklySummary(userId: string): Promise<string | null> {
  const supabase = await createClient();

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const toDate = (d: Date) => d.toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: activities },
    { data: wellness },
    { data: scheduled },
    { data: memories },
  ] = await Promise.all([
    supabase.from("users").select("ftp, weight").eq("id", userId).maybeSingle(),
    supabase
      .from("activities")
      .select("activity_date, name, type, moving_time, icu_training_load, avg_power, normalized_power, avg_hr, distance, elevation_gain")
      .eq("user_id", userId)
      .gte("activity_date", toDate(weekAgo))
      .lte("activity_date", toDate(today))
      .order("activity_date", { ascending: true }),
    supabase
      .from("wellness")
      .select("date, ctl, atl, tsb, ramp_rate, resting_hr, hrv")
      .eq("user_id", userId)
      .gte("date", toDate(weekAgo))
      .lte("date", toDate(today))
      .order("date", { ascending: true }),
    supabase
      .from("scheduled_workouts")
      .select("scheduled_date")
      .eq("user_id", userId)
      .gte("scheduled_date", toDate(weekAgo))
      .lte("scheduled_date", toDate(today)),
    supabase
      .from("coach_memories")
      .select("category, content")
      .eq("user_id", userId)
      .limit(20),
  ]);

  const acts = (activities as any[]) ?? [];
  if (acts.length === 0) {
    return null; // No activities, skip summary
  }

  const scheduledDates = new Set(((scheduled as any[]) ?? []).map((s: any) => s.scheduled_date));
  const activityDates = new Set(acts.map((a: any) => a.activity_date));
  const missedDays = [...scheduledDates].filter((d) => !activityDates.has(d));

  const totalTss = acts.reduce((s: number, a: any) => s + (a.icu_training_load ? Number(a.icu_training_load) : 0), 0);
  const totalDuration = acts.reduce((s: number, a: any) => s + (a.moving_time ? Number(a.moving_time) / 60 : 0), 0);
  const totalDistance = acts.reduce((s: number, a: any) => s + (a.distance ? Number(a.distance) / 1000 : 0), 0);
  const totalElevation = acts.reduce((s: number, a: any) => s + (a.elevation_gain ? Number(a.elevation_gain) : 0), 0);

  const wellnessDays = (wellness as any[]) ?? [];
  const latestWellness = wellnessDays[wellnessDays.length - 1];

  const memoryLines = ((memories as any[]) ?? []).map((m: any) => `- (${m.category}) ${m.content}`).join("\n");

  const prompt = `You are Turbo Coach, an AI cycling coach. Generate a concise weekly training summary for this athlete.

Athlete profile: FTP ${profile?.ftp ?? "unknown"}W, weight ${profile?.weight ?? "unknown"}kg

This week's training (${toDate(weekAgo)} to ${toDate(today)}):
- ${acts.length} rides, ${Math.round(totalTss)} TSS, ${(totalDuration / 60).toFixed(1)}h, ${totalDistance.toFixed(0)}km, ${Math.round(totalElevation)}m elevation
- Activities: ${acts.map((a: any) => `${a.activity_date}: ${a.name ?? a.type} (${a.moving_time ? Math.round(a.moving_time / 60) : 0}m, ${a.icu_training_load ? Math.round(a.icu_training_load) : 0} TSS, ${a.avg_power ?? "?"}W avg)`).join("; ")}
- Scheduled days: ${scheduledDates.size}, missed: ${missedDays.length}${missedDays.length > 0 ? ` (${missedDays.join(", ")})` : ""}
${latestWellness ? `- Latest wellness: CTL ${latestWellness.ctl ?? "?"}, ATL ${latestWellness.atl ?? "?"}, TSB ${latestWellness.tsb ?? "?"}, RHR ${latestWellness.resting_hr ?? "?"}, HRV ${latestWellness.hrv ?? "?"}` : ""}

${memoryLines ? `Known athlete context:\n${memoryLines}` : ""}

Write a brief (3-5 sentences) weekly summary covering:
1. Volume and load assessment (appropriate / too much / too little)
2. Key highlights or concerns
3. One actionable suggestion for the coming week

Be specific with numbers. Use a coach-like, encouraging tone. Do not use markdown headers.`;

  const { models } = resolveModels();
  const result = await generateText({
    model: models.coaching,
    prompt,
  });

  return result.text;
}

/**
 * Generate a post-ride analysis for a newly synced activity.
 * Called after sync completes for users with auto_analysis_enabled = true.
 */
export async function generatePostRideAnalysis(
  userId: string,
  activity: Record<string, unknown>
): Promise<string | null> {
  const supabase = await createClient();

  const [{ data: profile }, { data: memories }] = await Promise.all([
    supabase.from("users").select("ftp, weight").eq("id", userId).maybeSingle(),
    supabase
      .from("coach_memories")
      .select("category, content")
      .eq("user_id", userId)
      .limit(20),
  ]);

  const ftp = profile?.ftp ?? null;
  const intensityFactor = ftp && activity.normalized_power
    ? (Number(activity.normalized_power) / ftp).toFixed(2)
    : null;

  const memoryLines = ((memories as any[]) ?? []).map((m: any) => `- (${m.category}) ${m.content}`).join("\n");

  const prompt = `You are Turbo Coach, an AI cycling coach. Provide a brief post-ride analysis for this activity.

Athlete: FTP ${ftp ?? "unknown"}W, weight ${profile?.weight ?? "unknown"}kg

Activity: ${activity.name ?? activity.type ?? "Ride"}
- Date: ${activity.activity_date}
- Duration: ${activity.moving_time ? Math.round(Number(activity.moving_time) / 60) : "?"}m
- Distance: ${activity.distance ? (Number(activity.distance) / 1000).toFixed(1) : "?"}km
- Elevation: ${activity.elevation_gain ? Math.round(Number(activity.elevation_gain)) : "?"}m
- Avg Power: ${activity.avg_power ?? "?"}W | NP: ${activity.normalized_power ?? "?"}W | Max: ${activity.max_power ?? "?"}W
- IF: ${intensityFactor ?? "?"}
- TSS: ${activity.icu_training_load ? Math.round(Number(activity.icu_training_load)) : "?"}
- Avg HR: ${activity.avg_hr ?? "?"}bpm | Max HR: ${activity.max_hr ?? "?"}bpm
- Cadence: ${activity.avg_cadence ?? "?"}rpm

${memoryLines ? `Known athlete context:\n${memoryLines}` : ""}

Write 2-3 sentences analysing this ride:
- Was the intensity appropriate? What training zone was this predominantly in?
- Any notable observations (high IF, cardiac drift, good power numbers, etc.)
- Brief actionable takeaway

Be specific with numbers. Coach-like tone. No markdown headers.`;

  const { models } = resolveModels();
  const result = await generateText({
    model: models.coaching,
    prompt,
  });

  return result.text;
}
