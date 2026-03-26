import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createIcuClient } from "@/lib/intervals/client";
import { createStravaClient } from "@/lib/strava/client";
import { getValidStravaToken } from "@/lib/strava/token";
import { computeAllMetrics } from "@/lib/activity/compute-metrics";
import type { IcuActivityDetail, IcuInterval, IcuPowerCurvePoint } from "@/lib/intervals/types";

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
          .from("activities")
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
          .from("activities")
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
            .from("activities")
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
              .from("activities")
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
          .from("activities")
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

    getActivityDetail: tool({
      description:
        "Fetch detailed analysis of a single activity including intervals, peak powers, and advanced metrics. " +
        "Use when the athlete asks about a specific ride's execution, intervals, pacing, efficiency, " +
        "or wants a deep analysis beyond the summary data in context. " +
        "Look up by activity database UUID, or by date and optional name search.",
      inputSchema: z.object({
        activityId: z
          .string()
          .optional()
          .describe("UUID of the activity from the database (if known from context)"),
        date: z
          .string()
          .optional()
          .describe("Activity date YYYY-MM-DD (used if activityId not known)"),
        nameSearch: z
          .string()
          .optional()
          .describe("Partial name match (used with date to disambiguate)"),
      }),
      execute: async ({ activityId, date, nameSearch }) => {
        const supabase = await createClient();

        // Resolve activity row
        let activityRow: Record<string, unknown> | null = null;

        if (activityId) {
          const { data } = await supabase
            .from("activities")
            .select("external_id, source, name, activity_date, icu_ftp, moving_time, distance, avg_power, normalized_power, avg_hr, max_hr, avg_cadence, calories, elevation_gain, max_power, icu_training_load")
            .eq("id", activityId)
            .eq("user_id", userId)
            .maybeSingle();
          if (data) {
            activityRow = data;
          }
        } else if (date) {
          let query = supabase
            .from("activities")
            .select("external_id, source, name, activity_date, icu_ftp, moving_time, distance, avg_power, normalized_power, avg_hr, max_hr, avg_cadence, calories, elevation_gain, max_power, icu_training_load")
            .eq("user_id", userId)
            .eq("activity_date", date)
            .limit(1);
          if (nameSearch) {
            query = query.ilike("name", `%${nameSearch}%`);
          }
          const { data } = await query;
          if (data && data.length > 0) {
            activityRow = data[0] as Record<string, unknown>;
          }
        }

        if (!activityRow) {
          return { error: "Activity not found. Try providing a date or more specific search." };
        }

        if (activityRow.source === "strava") {
          return handleStravaActivityForCoach(supabase, userId, activityRow);
        }

        // ICU-sourced activity — use ICU API
        return handleIcuActivityForCoach(supabase, userId, activityRow);
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
        "Schedule a NEW workout you described in <workout> tags onto the athlete's calendar. " +
        "CRITICAL: You MUST write the full workout in <workout>...</workout> tags BEFORE calling this tool in the same response. " +
        "If you found a matching workout via searchWorkoutLibrary, use scheduleWorkout instead — do NOT use this tool. " +
        "Only use this tool when creating a brand new workout that doesn't exist in the library.",
      inputSchema: z.object({
        date: z.string().describe("Date to schedule in YYYY-MM-DD format"),
      }),
      execute: async ({ date }) => {
        return { pending: true, date };
      },
    }),

    listScheduledWorkouts: tool({
      description:
        "List workouts currently scheduled on the athlete's calendar for a date range. " +
        "Use this to see what's planned before making changes (removing, replacing, or adding workouts).",
      inputSchema: z.object({
        startDate: z.string().describe("Start date YYYY-MM-DD"),
        endDate: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();

        const { data, error } = await supabase
          .from("scheduled_workouts")
          .select("id, scheduled_date, workout:workouts(id, name, category, duration_seconds, avg_intensity_percent)")
          .eq("user_id", userId)
          .gte("scheduled_date", startDate)
          .lte("scheduled_date", endDate)
          .order("scheduled_date", { ascending: true });

        if (error) return { error: error.message, workouts: [] as unknown[] };
        if (!data || data.length === 0) {
          return { message: `No workouts scheduled between ${startDate} and ${endDate}.`, workouts: [] as unknown[] };
        }

        const workouts = (data as any[]).map((sw: Record<string, unknown>) => {
          const w = Array.isArray(sw.workout) ? sw.workout[0] : sw.workout;
          return {
            scheduled_workout_id: sw.id,
            date: sw.scheduled_date,
            workout_id: w?.id ?? null,
            name: w?.name ?? "Unknown",
            category: w?.category ?? null,
            duration_min: w?.duration_seconds ? Math.round(Number(w.duration_seconds) / 60) : null,
            intensity_pct: w?.avg_intensity_percent ?? null,
          };
        });

        return { count: workouts.length, period: `${startDate} to ${endDate}`, workouts };
      },
    }),

    removeScheduledWorkout: tool({
      description:
        "Remove a scheduled workout from the athlete's calendar. " +
        "Use listScheduledWorkouts first to get the scheduled_workout_id. " +
        "Use when the athlete asks to clear a day, remove a workout, or when replacing one workout with another.",
      inputSchema: z.object({
        scheduledWorkoutId: z.string().describe("The scheduled_workout_id (NOT the workout_id) from listScheduledWorkouts"),
      }),
      execute: async ({ scheduledWorkoutId }) => {
        const supabase = await createClient();

        // Verify ownership and get workout name for confirmation
        const { data: sw } = await supabase
          .from("scheduled_workouts")
          .select("id, scheduled_date, workout:workouts(name)")
          .eq("id", scheduledWorkoutId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!sw) {
          return { error: "Scheduled workout not found." };
        }

        const { error } = await supabase
          .from("scheduled_workouts")
          .delete()
          .eq("id", scheduledWorkoutId)
          .eq("user_id", userId);

        if (error) return { error: error.message };

        const wName = Array.isArray((sw as any).workout) ? (sw as any).workout[0]?.name : (sw as any).workout?.name;

        return {
          success: true,
          message: `Removed "${wName ?? "workout"}" from ${(sw as any).scheduled_date}.`,
        };
      },
    }),

    searchWorkoutLibrary: tool({
      description:
        "Search the athlete's workout library (presets + custom workouts). " +
        "ALWAYS use this before creating a new workout from scratch — check if a similar workout already exists. " +
        "If a good match is found, use scheduleWorkout to schedule it directly instead of creating a duplicate.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Text to search workout names (case-insensitive partial match). Leave empty to list all."),
        category: z
          .string()
          .optional()
          .describe("Filter by category: 'endurance', 'threshold', 'vo2max', 'sprint', 'recovery', 'sweetspot', etc."),
      }),
      execute: async ({ query, category }) => {
        const supabase = await createClient();

        let q = supabase
          .from("workouts")
          .select("id, name, category, description, duration_seconds, avg_intensity_percent, tags, is_preset")
          .or(`user_id.eq.${userId},is_preset.eq.true`)
          .order("name", { ascending: true })
          .limit(20);

        if (query) {
          q = q.ilike("name", `%${query}%`);
        }
        if (category) {
          q = q.ilike("category", `%${category}%`);
        }

        const { data, error } = await q;
        if (error) return { error: error.message, workouts: [] as unknown[] };
        if (!data || data.length === 0) {
          return {
            message: `No workouts found${query ? ` matching "${query}"` : ""}${category ? ` in category "${category}"` : ""}. You can create a new one.`,
            workouts: [] as unknown[],
          };
        }

        const workouts = (data as any[]).map((w: Record<string, unknown>) => ({
          workout_id: w.id,
          name: w.name,
          category: w.category,
          description: w.description ? String(w.description).slice(0, 100) : null,
          duration_min: w.duration_seconds ? Math.round(Number(w.duration_seconds) / 60) : null,
          intensity_pct: w.avg_intensity_percent ?? null,
          tags: w.tags,
          is_preset: w.is_preset,
        }));

        return { count: workouts.length, workouts };
      },
    }),
  };
}

// ── Strava activity handler for coach tool ──────────────────

async function handleStravaActivityForCoach(
  supabase: any,
  userId: string,
  activity: Record<string, unknown>
) {
  const { accessToken } = await getValidStravaToken(supabase, userId);
  const client = createStravaClient(accessToken);
  const stravaId = activity.external_id as string;

  // Fetch streams from Strava (no detail needed — we have DB data + compute metrics)
  let stravaStreams;
  try {
    stravaStreams = await client.fetchActivityStreams(stravaId);
  } catch (err) {
    // Fall back to DB-only data if streams fail
    return formatBasicActivityForCoach(activity);
  }

  // Get user's FTP from profile
  const { data: profile } = await supabase
    .from("users")
    .select("ftp, weight")
    .eq("id", userId)
    .maybeSingle();

  const ftp = (profile?.ftp ?? activity.icu_ftp ?? null) as number | null;
  const weight = profile?.weight as number | null;

  const watts = stravaStreams?.watts ?? [];
  const heartrate = stravaStreams?.heartrate ?? null;
  const cadence = stravaStreams?.cadence ?? null;
  const durationSeconds = (activity.moving_time as number) ?? watts.length;

  if (watts.length === 0) {
    return formatBasicActivityForCoach(activity);
  }

  const computed = computeAllMetrics(watts, heartrate, cadence, ftp, durationSeconds);

  // Build power curve points with W/kg
  const powerCurve = computed.powerCurve.map((p) => ({
    secs: p.secs,
    watts: p.watts,
    watts_per_kg: weight ? Number((p.watts / weight).toFixed(2)) : null,
  }));

  // Build IcuActivityDetail-shaped object for the formatter
  const detail: IcuActivityDetail = {
    id: stravaId,
    type: (activity.type as string) ?? "Ride",
    name: (activity.name as string) ?? "Activity",
    description: null,
    start_date_local: activity.activity_date as string,
    distance: activity.distance as number | null,
    moving_time: activity.moving_time as number | null,
    elapsed_time: activity.moving_time as number | null,
    icu_training_load: computed.tss ?? (activity.icu_training_load as number | null),
    icu_intensity: computed.intensityFactor,
    icu_ftp: ftp,
    icu_average_watts: computed.avgPower,
    icu_weighted_avg_watts: computed.normalizedPower,
    max_watts: computed.maxPower,
    average_heartrate: computed.avgHr,
    max_heartrate: computed.maxHr,
    average_cadence: computed.avgCadence,
    calories: activity.calories as number | null,
    total_elevation_gain: activity.elevation_gain as number | null,
    icu_atl: null,
    icu_ctl: null,
    icu_variability_index: computed.variabilityIndex,
    icu_efficiency_factor: computed.efficiencyFactor,
    icu_power_hr: computed.powerHr,
    decoupling: computed.decoupling,
    trimp: computed.trimp,
    icu_joules: watts.reduce((a, b) => a + Math.max(0, b), 0),
    icu_joules_above_ftp: ftp ? watts.reduce((a, w) => a + Math.max(0, w - ftp), 0) : null,
    icu_max_wbal_depletion: computed.wbalMaxDepletion,
    average_speed: null,
    max_speed: null,
    icu_weight_kg: weight,
    icu_pm_ftp: null,
    icu_pm_p_max: null,
    icu_pm_w_prime: null,
    icu_w_prime: null,
    p_max: null,
    icu_power_hr_z2: null,
    carbs_used: null,
    icu_hrr: null,
    feel: null,
    rpe: null,
  };

  // Convert detected intervals to IcuInterval format
  const intervals: IcuInterval[] = computed.intervals.map((iv) => ({
    type: iv.type,
    label: iv.label,
    start_index: iv.startIndex,
    end_index: iv.endIndex,
    elapsed_time: iv.elapsedTime,
    moving_time: iv.elapsedTime,
    average_watts: iv.avgWatts,
    max_watts: iv.maxWatts,
    average_heartrate: iv.avgHr,
    max_heartrate: iv.maxHr,
    average_cadence: iv.avgCadence,
    zone: iv.zone,
    intensity: iv.intensity,
    weighted_average_watts: null,
    distance: null,
    joules: null,
    joules_above_ftp: null,
    wbal_start: null,
    wbal_end: null,
    total_elevation_gain: null,
    average_speed: null,
    training_load: null,
    decoupling: null,
  }));

  return formatActivityDetailForCoach(detail, intervals, powerCurve, ftp);
}

// ── ICU activity handler for coach tool ─────────────────────

async function handleIcuActivityForCoach(
  supabase: any,
  userId: string,
  activity: Record<string, unknown>
) {
  const { data: conn } = await supabase
    .from("icu_connections")
    .select("api_key, athlete_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn) {
    return formatBasicActivityForCoach(activity);
  }

  const client = createIcuClient(conn.api_key, conn.athlete_id);
  const icuActivityId = activity.external_id as string;

  const [detailResult, pcResult] = await Promise.allSettled([
    client.fetchActivityDetail(icuActivityId),
    client.fetchPowerCurve(icuActivityId),
  ]);

  if (detailResult.status === "rejected") {
    return formatBasicActivityForCoach(activity);
  }

  const detail: IcuActivityDetail = detailResult.value;
  const powerCurve: IcuPowerCurvePoint[] =
    pcResult.status === "fulfilled" ? pcResult.value : [];
  const intervals: IcuInterval[] = detail.icu_intervals ?? [];
  const ftp = detail.icu_ftp ?? (activity.icu_ftp as number | null);

  return formatActivityDetailForCoach(detail, intervals, powerCurve, ftp);
}

// ── Fallback: format from DB data only ──────────────────────

function formatBasicActivityForCoach(activity: Record<string, unknown>) {
  return {
    metrics: {
      name: activity.name ?? "Activity",
      date: activity.activity_date,
      duration_min: activity.moving_time ? Math.round(Number(activity.moving_time) / 60) : null,
      distance_km: activity.distance ? Number((Number(activity.distance) / 1000).toFixed(1)) : null,
      elevation_m: activity.elevation_gain ? Math.round(Number(activity.elevation_gain)) : null,
      avg_power_w: activity.avg_power,
      normalized_power_w: activity.normalized_power,
      max_power_w: activity.max_power,
      tss: activity.icu_training_load ? Math.round(Number(activity.icu_training_load)) : null,
      avg_hr_bpm: activity.avg_hr,
      max_hr_bpm: activity.max_hr,
      avg_cadence_rpm: activity.avg_cadence,
      calories: activity.calories,
      ftp_at_time: activity.icu_ftp,
    },
    peak_powers: {},
    intervals: [],
    interval_count: 0,
    time_in_zones_min: null,
    note: "Detailed streams unavailable — showing summary metrics only.",
  };
}

// ── Helper: format activity detail for coach consumption ──────

function formatActivityDetailForCoach(
  d: IcuActivityDetail,
  intervals: IcuInterval[],
  powerCurve: Array<{ secs: number; watts: number; watts_per_kg?: number | null }>,
  ftp: number | null
) {
  const durationMin = d.moving_time ? Math.round(d.moving_time / 60) : null;
  const distanceKm = d.distance ? Number((d.distance / 1000).toFixed(1)) : null;
  const elevationM = d.total_elevation_gain ? Math.round(d.total_elevation_gain) : null;
  const avgSpeedKmh = d.average_speed ? Number((d.average_speed * 3.6).toFixed(1)) : null;
  const np = d.icu_weighted_avg_watts ?? null;
  const ifactor = np && ftp ? Number((np / ftp).toFixed(2)) : null;
  const vi = d.icu_variability_index ? Number(d.icu_variability_index.toFixed(2)) : null;
  const workKj = d.icu_joules ? Math.round(d.icu_joules / 1000) : null;
  const workAboveFtpKj = d.icu_joules_above_ftp ? Math.round(d.icu_joules_above_ftp / 1000) : null;
  const tsb = d.icu_ctl != null && d.icu_atl != null ? Math.round(d.icu_ctl - d.icu_atl) : null;
  const eftp = d.icu_pm_ftp ?? null;
  const wPrime = d.icu_pm_w_prime ?? d.icu_w_prime ?? null;
  const pmax = d.icu_pm_p_max ?? d.p_max ?? null;

  const metrics: Record<string, unknown> = {
    name: d.name,
    date: d.start_date_local?.slice(0, 10),
    type: d.type,
    duration_min: durationMin,
    distance_km: distanceKm,
    elevation_m: elevationM,
    avg_speed_kmh: avgSpeedKmh,
    avg_power_w: d.icu_average_watts,
    normalized_power_w: np,
    max_power_w: d.max_watts,
    intensity_factor: ifactor,
    tss: d.icu_training_load ? Math.round(d.icu_training_load) : null,
    variability_index: vi,
    avg_hr_bpm: d.average_heartrate,
    max_hr_bpm: d.max_heartrate,
    trimp: d.trimp ? Math.round(d.trimp) : null,
    avg_cadence_rpm: d.average_cadence,
    ftp_at_time: ftp,
    eftp_w: eftp,
    w_prime_j: wPrime,
    pmax_w: pmax,
    power_hr: d.icu_power_hr ? Number(d.icu_power_hr.toFixed(2)) : null,
    efficiency_factor: d.icu_efficiency_factor ? Number(d.icu_efficiency_factor.toFixed(2)) : null,
    decoupling_pct: d.decoupling != null ? Number(d.decoupling.toFixed(1)) : null,
    work_kj: workKj,
    work_above_ftp_kj: workAboveFtpKj,
    calories: d.calories,
    carbs_used_g: d.carbs_used,
    wbal_max_depletion_j: d.icu_max_wbal_depletion,
    ctl: d.icu_ctl != null ? Math.round(d.icu_ctl) : null,
    atl: d.icu_atl != null ? Math.round(d.icu_atl) : null,
    tsb: tsb,
    hrr: d.icu_hrr?.hrr ?? null,
  };

  // Peak powers at key durations
  const keyDurations = [5, 15, 30, 60, 120, 300, 600, 1200, 3600];
  const peaks: Record<string, number | null> = {};
  for (const sec of keyDurations) {
    const pt = powerCurve.find((p) => p.secs === sec);
    const label =
      sec < 60 ? `${sec}s` : sec < 3600 ? `${sec / 60}min` : `${sec / 3600}h`;
    peaks[label] = pt?.watts ?? null;
  }

  // Intervals summary (max 20)
  const intervalsFormatted = intervals.slice(0, 20).map((iv) => ({
    label: iv.label ?? iv.type ?? "—",
    type: iv.type,
    duration_s: iv.elapsed_time ?? iv.moving_time ?? null,
    avg_power_w: iv.average_watts ?? null,
    pct_ftp: iv.intensity ? Math.round(iv.intensity * 100) : null,
    np_w: iv.weighted_average_watts ?? null,
    avg_hr: iv.average_heartrate ?? null,
    max_hr: iv.max_heartrate ?? null,
    zone: iv.zone ?? null,
    cadence: iv.average_cadence ?? null,
  }));

  // Time-in-zone from intervals (if we have ftp)
  let timeInZones: Record<string, number> | null = null;
  if (ftp && intervals.length > 0) {
    const zones: Record<string, number> = {
      Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0,
    };
    for (const iv of intervals) {
      const dur = iv.elapsed_time ?? iv.moving_time ?? 0;
      const pct = iv.average_watts && ftp ? (iv.average_watts / ftp) * 100 : 0;
      if (pct <= 55) zones.Z1 += dur;
      else if (pct <= 75) zones.Z2 += dur;
      else if (pct <= 90) zones.Z3 += dur;
      else if (pct <= 105) zones.Z4 += dur;
      else if (pct <= 120) zones.Z5 += dur;
      else if (pct <= 150) zones.Z6 += dur;
      else zones.Z7 += dur;
    }
    // Convert to minutes
    timeInZones = Object.fromEntries(
      Object.entries(zones)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => [k, Math.round(v / 60)])
    );
  }

  return {
    metrics,
    peak_powers: peaks,
    intervals: intervalsFormatted,
    interval_count: intervals.length,
    time_in_zones_min: timeInZones,
  };
}
