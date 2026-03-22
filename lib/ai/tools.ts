import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Creates the set of tools available to the AI coach.
 * Each tool can query (or act on) the user's training data on demand.
 */
export function createCoachTools(userId: string) {
  return {
    // ── Read tools ──────────────────────────────────────────────

    searchActivities: tool({
      description:
        "Search the athlete's past activities/rides by date range and/or name. " +
        "Use this when the athlete asks about specific rides, events, training camps, " +
        "or any historical period beyond the last 14 days already in context. " +
        "Returns up to 30 matching activities with key metrics.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
        nameSearch: z
          .string()
          .optional()
          .describe(
            "Optional text to match against activity names (case-insensitive partial match). " +
            "Use for specific events like 'cyclocross', 'tenerife', 'race', etc."
          ),
      }),
      execute: async ({ startDate, endDate, nameSearch }) => {
        const supabase = await createClient();

        let query = supabase
          .from("icu_activities")
          .select(
            "activity_date, name, type, moving_time, icu_training_load, " +
            "avg_power, normalized_power, max_power, avg_hr, max_hr, avg_cadence, " +
            "distance, elevation_gain, icu_ftp, calories, source"
          )
          .eq("user_id", userId)
          .gte("activity_date", startDate)
          .lte("activity_date", endDate)
          .order("activity_date", { ascending: true })
          .limit(30);

        if (nameSearch) {
          query = query.ilike("name", `%${nameSearch}%`);
        }

        const { data, error } = await query;
        if (error) return { error: error.message, activities: [] as unknown[] };
        if (!data || data.length === 0) {
          return {
            message: `No activities found between ${startDate} and ${endDate}${nameSearch ? ` matching "${nameSearch}"` : ""}.`,
            activities: [] as unknown[],
          };
        }

        const activities = (data as any[]).map((a: Record<string, unknown>) => ({
          date: a.activity_date,
          name: (a.name as string | null) ?? "Unnamed activity",
          type: (a.type as string | null) ?? "unknown",
          duration_min: a.moving_time ? Math.round(Number(a.moving_time) / 60) : null,
          tss: a.icu_training_load ? Math.round(Number(a.icu_training_load)) : null,
          avg_power_w: a.avg_power,
          normalized_power_w: a.normalized_power,
          max_power_w: a.max_power,
          avg_hr_bpm: a.avg_hr,
          max_hr_bpm: a.max_hr,
          avg_cadence_rpm: a.avg_cadence,
          distance_km: a.distance ? Number((Number(a.distance) / 1000).toFixed(1)) : null,
          elevation_m: a.elevation_gain ? Math.round(Number(a.elevation_gain)) : null,
          ftp_at_time: a.icu_ftp,
          calories: a.calories,
          source: a.source,
        }));

        return { count: activities.length, period: `${startDate} to ${endDate}`, activities };
      },
    }),

    getWellnessTrend: tool({
      description:
        "Get the athlete's fitness/fatigue trend (CTL, ATL, TSB, ramp rate, resting HR, HRV) for a date range. " +
        "Use when the athlete asks about their form, fitness, fatigue, recovery, or readiness during a specific period. " +
        "HRV and resting HR are strong recovery indicators.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();

        const { data, error } = await supabase
          .from("wellness")
          .select("date, ctl, atl, tsb, ramp_rate, resting_hr, hrv")
          .eq("user_id", userId)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: true })
          .limit(90);

        if (error) return { error: error.message, days: [] as unknown[] };
        if (!data || data.length === 0) {
          return {
            message: `No wellness data found between ${startDate} and ${endDate}.`,
            days: [] as unknown[],
          };
        }

        const days = (data as any[]).map((d: Record<string, unknown>) => ({
          date: d.date,
          ctl: d.ctl != null ? Math.round(Number(d.ctl)) : null,
          atl: d.atl != null ? Math.round(Number(d.atl)) : null,
          tsb: d.tsb != null ? Math.round(Number(d.tsb)) : null,
          ramp_rate: d.ramp_rate != null ? Number(Number(d.ramp_rate).toFixed(1)) : null,
          resting_hr: d.resting_hr != null ? Math.round(Number(d.resting_hr)) : null,
          hrv: d.hrv != null ? Math.round(Number(d.hrv)) : null,
        }));

        return { count: days.length, period: `${startDate} to ${endDate}`, days };
      },
    }),

    getTrainingLoad: tool({
      description:
        "Calculate training load summary statistics for a date range: total TSS, " +
        "number of rides, average TSS per ride, total duration, total distance, and total elevation. " +
        "Use when the athlete asks about training volume or load over a period.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();

        const { data, error } = await supabase
          .from("icu_activities")
          .select("icu_training_load, moving_time, distance, elevation_gain, avg_power, normalized_power, calories")
          .eq("user_id", userId)
          .gte("activity_date", startDate)
          .lte("activity_date", endDate);

        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { message: `No activities found between ${startDate} and ${endDate}.`, period: `${startDate} to ${endDate}` };
        }

        const rows = data as any as Record<string, unknown>[];
        const totalTss = rows.reduce((s, a) => s + (a.icu_training_load ? Number(a.icu_training_load) : 0), 0);
        const totalDurationMin = rows.reduce((s, a) => s + (a.moving_time ? Number(a.moving_time) / 60 : 0), 0);
        const totalDistanceKm = rows.reduce((s, a) => s + (a.distance ? Number(a.distance) / 1000 : 0), 0);
        const totalElevation = rows.reduce((s, a) => s + (a.elevation_gain ? Number(a.elevation_gain) : 0), 0);
        const totalCalories = rows.reduce((s, a) => s + (a.calories ? Number(a.calories) : 0), 0);
        const withPower = rows.filter((a) => a.avg_power != null);
        const avgPower = withPower.reduce((s, a) => s + Number(a.avg_power), 0) / (withPower.length || 1);

        return {
          period: `${startDate} to ${endDate}`,
          total_rides: rows.length,
          total_tss: Math.round(totalTss),
          avg_tss_per_ride: Math.round(totalTss / rows.length),
          total_duration_hours: Number((totalDurationMin / 60).toFixed(1)),
          total_distance_km: Number(totalDistanceKm.toFixed(1)),
          total_elevation_m: Math.round(totalElevation),
          total_calories: Math.round(totalCalories),
          avg_power_w: Math.round(avgPower),
        };
      },
    }),

    // Feature 1: Planned vs Actual (ride_sessions)
    getWorkoutCompliance: tool({
      description:
        "Compare planned (scheduled) workouts against actual trainer ride sessions for a date range. " +
        "Shows which scheduled workouts were completed on the trainer, skipped, or partially done, " +
        "with planned vs actual power, duration, and TSS. " +
        "Use when the athlete asks about workout adherence, execution quality, or indoor training consistency.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();

        const [{ data: scheduled }, { data: sessions }] = await Promise.all([
          supabase
            .from("scheduled_workouts")
            .select("id, scheduled_date, workout:workouts(id, name, category, duration_seconds, avg_intensity_percent)")
            .eq("user_id", userId)
            .gte("scheduled_date", startDate)
            .lte("scheduled_date", endDate)
            .order("scheduled_date", { ascending: true }),
          supabase
            .from("ride_sessions")
            .select("id, workout_id, started_at, duration_seconds, avg_power, normalized_power, tss, ftp_at_time, status, workout_completed")
            .eq("user_id", userId)
            .gte("started_at", `${startDate}T00:00:00`)
            .lte("started_at", `${endDate}T23:59:59`)
            .order("started_at", { ascending: true }),
        ]);

        if (!scheduled || scheduled.length === 0) {
          return { message: `No scheduled workouts found between ${startDate} and ${endDate}.`, items: [] as unknown[] };
        }

        const sessionByWorkout = new Map<string, Record<string, unknown>>();
        for (const s of (sessions as any[] ?? [])) {
          if (s.workout_id) sessionByWorkout.set(s.workout_id, s);
        }

        const items = (scheduled as any[]).map((sw: Record<string, unknown>) => {
          const w = Array.isArray(sw.workout) ? sw.workout[0] : sw.workout;
          if (!w) return { date: sw.scheduled_date, workout_name: "Unknown", status: "missing_data" };

          const session = sessionByWorkout.get(w.id as string);
          if (!session) {
            return {
              date: sw.scheduled_date,
              workout_name: w.name,
              category: w.category,
              planned_duration_min: w.duration_seconds ? Math.round(Number(w.duration_seconds) / 60) : null,
              status: "skipped",
            };
          }

          const plannedDur = w.duration_seconds ? Number(w.duration_seconds) : null;
          const actualDur = session.duration_seconds ? Number(session.duration_seconds) : null;
          const completionPct = plannedDur && actualDur ? Math.round((actualDur / plannedDur) * 100) : null;

          return {
            date: sw.scheduled_date,
            workout_name: w.name,
            category: w.category,
            status: session.workout_completed ? "completed" : session.status === "paused" ? "partial" : "completed",
            planned_duration_min: plannedDur ? Math.round(plannedDur / 60) : null,
            actual_duration_min: actualDur ? Math.round(actualDur / 60) : null,
            completion_percent: completionPct,
            actual_avg_power_w: session.avg_power,
            actual_np_w: session.normalized_power,
            actual_tss: session.tss ? Math.round(Number(session.tss)) : null,
          };
        });

        const completed = items.filter((i) => i.status === "completed").length;
        const skipped = items.filter((i) => i.status === "skipped").length;

        return {
          period: `${startDate} to ${endDate}`,
          total_scheduled: items.length,
          completed,
          skipped,
          partial: items.length - completed - skipped,
          compliance_percent: Math.round((completed / items.length) * 100),
          items,
        };
      },
    }),

    // Feature 5: Broader compliance (scheduled vs any activity on that day)
    getComplianceRate: tool({
      description:
        "Check how many scheduled workout days had actual riding activity (from any source: Strava, intervals.icu, or trainer). " +
        "This is a broader compliance check than getWorkoutCompliance — it matches any ride on a scheduled day, not just trainer sessions. " +
        "Use when the athlete asks about consistency, discipline, or how often they train vs their plan.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();

        const [{ data: scheduled }, { data: activities }] = await Promise.all([
          supabase
            .from("scheduled_workouts")
            .select("scheduled_date")
            .eq("user_id", userId)
            .gte("scheduled_date", startDate)
            .lte("scheduled_date", endDate),
          supabase
            .from("icu_activities")
            .select("activity_date")
            .eq("user_id", userId)
            .gte("activity_date", startDate)
            .lte("activity_date", endDate),
        ]);

        if (!scheduled || scheduled.length === 0) {
          return { message: `No scheduled workouts found between ${startDate} and ${endDate}.` };
        }

        const activityDates = new Set((activities as any[] ?? []).map((a: Record<string, unknown>) => a.activity_date));
        const scheduledDates = [...new Set((scheduled as any[]).map((s: Record<string, unknown>) => s.scheduled_date))];

        const matched = scheduledDates.filter((d) => activityDates.has(d));
        const missed = scheduledDates.filter((d) => !activityDates.has(d));
        const unscheduledRides = (activities as any[] ?? []).filter(
          (a: Record<string, unknown>) => !scheduledDates.includes(a.activity_date as string)
        ).length;

        return {
          period: `${startDate} to ${endDate}`,
          scheduled_days: scheduledDates.length,
          days_with_activity: matched.length,
          days_missed: missed.length,
          compliance_percent: Math.round((matched.length / scheduledDates.length) * 100),
          unscheduled_ride_days: unscheduledRides,
          missed_dates: missed,
        };
      },
    }),

    // Feature 6: Period-over-Period Comparison
    comparePeriods: tool({
      description:
        "Compare two date ranges side-by-side: TSS, volume, duration, distance, elevation, average power, and CTL change. " +
        "Use when the athlete asks 'am I improving?', 'how does this month compare to last month?', " +
        "or any before/after or period-vs-period question.",
      inputSchema: z.object({
        period1Start: z.string().describe("Start date of first period (YYYY-MM-DD)"),
        period1End: z.string().describe("End date of first period (YYYY-MM-DD)"),
        period2Start: z.string().describe("Start date of second period (YYYY-MM-DD)"),
        period2End: z.string().describe("End date of second period (YYYY-MM-DD)"),
      }),
      execute: async ({ period1Start, period1End, period2Start, period2End }) => {
        const supabase = await createClient();

        const loadPeriod = async (start: string, end: string) => {
          const [{ data: acts }, { data: wellStart }, { data: wellEnd }] = await Promise.all([
            supabase
              .from("icu_activities")
              .select("icu_training_load, moving_time, distance, elevation_gain, avg_power")
              .eq("user_id", userId)
              .gte("activity_date", start)
              .lte("activity_date", end),
            supabase
              .from("wellness")
              .select("ctl")
              .eq("user_id", userId)
              .eq("date", start)
              .maybeSingle(),
            supabase
              .from("wellness")
              .select("ctl")
              .eq("user_id", userId)
              .eq("date", end)
              .maybeSingle(),
          ]);

          const rows = (acts as any as Record<string, unknown>[]) ?? [];
          const totalTss = rows.reduce((s, a) => s + (a.icu_training_load ? Number(a.icu_training_load) : 0), 0);
          const totalMin = rows.reduce((s, a) => s + (a.moving_time ? Number(a.moving_time) / 60 : 0), 0);
          const totalKm = rows.reduce((s, a) => s + (a.distance ? Number(a.distance) / 1000 : 0), 0);
          const totalElev = rows.reduce((s, a) => s + (a.elevation_gain ? Number(a.elevation_gain) : 0), 0);
          const withPow = rows.filter((a) => a.avg_power != null);
          const avgPow = withPow.reduce((s, a) => s + Number(a.avg_power), 0) / (withPow.length || 1);

          return {
            rides: rows.length,
            total_tss: Math.round(totalTss),
            total_hours: Number((totalMin / 60).toFixed(1)),
            total_km: Number(totalKm.toFixed(1)),
            total_elevation_m: Math.round(totalElev),
            avg_power_w: Math.round(avgPow),
            ctl_start: wellStart?.ctl != null ? Math.round(Number(wellStart.ctl)) : null,
            ctl_end: wellEnd?.ctl != null ? Math.round(Number(wellEnd.ctl)) : null,
          };
        };

        const [p1, p2] = await Promise.all([
          loadPeriod(period1Start, period1End),
          loadPeriod(period2Start, period2End),
        ]);

        const delta = (a: number, b: number) => {
          if (a === 0) return b === 0 ? 0 : 100;
          return Math.round(((b - a) / a) * 100);
        };

        return {
          period1: { label: `${period1Start} to ${period1End}`, ...p1 },
          period2: { label: `${period2Start} to ${period2End}`, ...p2 },
          deltas: {
            rides: p2.rides - p1.rides,
            tss_percent: delta(p1.total_tss, p2.total_tss),
            hours_percent: delta(p1.total_hours, p2.total_hours),
            km_percent: delta(p1.total_km, p2.total_km),
            elevation_percent: delta(p1.total_elevation_m, p2.total_elevation_m),
            avg_power_change_w: p2.avg_power_w - p1.avg_power_w,
            ctl_change: p1.ctl_end != null && p2.ctl_end != null ? p2.ctl_end - p1.ctl_end : null,
          },
        };
      },
    }),

    // Feature 8: Peak Powers
    getPeakPowers: tool({
      description:
        "Get the athlete's best peak power values across activities in a date range. " +
        "Returns the best max power recorded per activity and overall, plus the activity with the highest peak. " +
        "Use when the athlete asks about peak performance, sprint power, power records, or strengths/weaknesses.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();

        const { data, error } = await supabase
          .from("icu_activities")
          .select("activity_date, name, type, max_power, avg_power, normalized_power, moving_time, icu_ftp")
          .eq("user_id", userId)
          .gte("activity_date", startDate)
          .lte("activity_date", endDate)
          .not("max_power", "is", null)
          .order("max_power", { ascending: false })
          .limit(50);

        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { message: `No activities with power data found between ${startDate} and ${endDate}.` };
        }

        const rows = data as any[];
        const best = rows[0];
        const topActivities = rows.slice(0, 10).map((a: Record<string, unknown>) => ({
          date: a.activity_date,
          name: (a.name as string | null) ?? "Activity",
          max_power_w: a.max_power,
          avg_power_w: a.avg_power,
          np_w: a.normalized_power,
          duration_min: a.moving_time ? Math.round(Number(a.moving_time) / 60) : null,
          ftp_at_time: a.icu_ftp,
        }));

        // Simple power profile from NP and avg power across activities
        const allNp = rows.filter((a: Record<string, unknown>) => a.normalized_power != null).map((a: Record<string, unknown>) => Number(a.normalized_power));
        const allAvg = rows.filter((a: Record<string, unknown>) => a.avg_power != null).map((a: Record<string, unknown>) => Number(a.avg_power));

        return {
          period: `${startDate} to ${endDate}`,
          activities_with_power: rows.length,
          best_max_power: { watts: best.max_power, date: best.activity_date, activity: best.name },
          best_normalized_power: allNp.length > 0 ? Math.max(...allNp) : null,
          avg_normalized_power: allNp.length > 0 ? Math.round(allNp.reduce((s, v) => s + v, 0) / allNp.length) : null,
          avg_power_across_rides: allAvg.length > 0 ? Math.round(allAvg.reduce((s, v) => s + v, 0) / allAvg.length) : null,
          top_activities: topActivities,
        };
      },
    }),

    // ── Write tools ─────────────────────────────────────────────

    // Feature 3a: Schedule an existing workout
    scheduleWorkout: tool({
      description:
        "Schedule an existing workout from the athlete's library onto a specific date on their calendar. " +
        "Use when the coach recommends a specific workout and the athlete agrees, or when the athlete asks to schedule something. " +
        "You need the workout ID (from the library) and a date.",
      inputSchema: z.object({
        workoutId: z.string().describe("UUID of the workout to schedule"),
        date: z.string().describe("Date to schedule in YYYY-MM-DD format"),
      }),
      execute: async ({ workoutId, date }) => {
        const supabase = await createClient();

        // Verify workout exists and user has access
        const { data: workout, error: lookupError } = await supabase
          .from("workouts")
          .select("id, name, category")
          .or(`user_id.eq.${userId},is_preset.eq.true`)
          .eq("id", workoutId)
          .maybeSingle();

        if (lookupError || !workout) {
          return { error: "Workout not found or not accessible." };
        }

        const { error } = await supabase.from("scheduled_workouts").insert({
          user_id: userId,
          workout_id: workoutId,
          scheduled_date: date,
        });

        if (error) return { error: error.message };

        return {
          success: true,
          message: `Scheduled "${(workout as any).name}" on ${date}.`,
          workout_name: (workout as any).name,
          workout_category: (workout as any).category,
          scheduled_date: date,
        };
      },
    }),

    // Schedule the workout described in <workout> tags in the current response.
    // This is a deferred action — the client handles actual creation after the response completes.
    scheduleDescribedWorkout: tool({
      description:
        "Schedule the workout you just described (in <workout> tags) onto the athlete's calendar. " +
        "You must describe the workout first using <workout> tags in the same response, then call this tool. " +
        "The system will automatically extract the workout from your response and create it.",
      inputSchema: z.object({
        date: z.string().describe("Date to schedule in YYYY-MM-DD format"),
      }),
      execute: async ({ date }) => {
        return { pending: true, date };
      },
    }),
  };
}
