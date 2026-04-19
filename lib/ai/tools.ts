import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createIcuClient } from "@/lib/intervals/client";
import { createStravaClient } from "@/lib/strava/client";
import { getValidStravaToken } from "@/lib/strava/token";
import { computeAllMetrics } from "@/lib/activity/compute-metrics";
import type { IcuActivityDetail, IcuInterval, IcuPowerCurvePoint } from "@/lib/intervals/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Strip null/undefined values from an object to reduce token usage in LLM tool results. */
const compact = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as Partial<T>;

/**
 * Creates the set of tools available to the AI coach.
 * Each tool can query (or act on) the user's training data on demand.
 */
export function createCoachTools(userId: string) {
  return {
    // ── Read tools ──────────────────────────────────────────────

    searchActivities: tool({
      description:
        "Search activities by date range/name. Max 15 rides. For multi-week trends use getWeeklySummaries.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        endDate: z.string().describe("End date in YYYY-MM-DD format"),
        nameSearch: z
          .string()
          .optional()
          .describe("Partial name match (case-insensitive)"),
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
          .limit(15);

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

        const activities = (data as any[]).map((a: Record<string, unknown>) => compact({
          date: a.activity_date,
          name: (a.name as string | null) ?? "Unnamed activity",
          type: (a.type as string | null) ?? "unknown",
          duration_min: a.moving_time ? Math.round(Number(a.moving_time) / 60) : null,
          tss: a.icu_training_load ? Math.round(Number(a.icu_training_load)) : null,
          avg_power_w: a.avg_power,
          np_w: a.normalized_power,
          max_power_w: a.max_power,
          avg_hr: a.avg_hr,
          max_hr: a.max_hr,
          distance_km: a.distance ? Number((Number(a.distance) / 1000).toFixed(1)) : null,
          elevation_m: a.elevation_gain ? Math.round(Number(a.elevation_gain)) : null,
        }));

        return { count: activities.length, period: `${startDate} to ${endDate}`, activities };
      },
    }),

    getWellnessTrend: tool({
      description:
        "Daily fitness/fatigue trend (CTL, ATL, TSB, ramp, RHR, HRV) for a date range.",
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
        "Aggregate load totals (TSS, rides, hours, km, elevation) for a date range.",
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

    getWeeklySummaries: tool({
      description:
        "Per-week summaries (rides, TSS, hours, km, power, intensity distribution). Best for multi-week/month trends.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date YYYY-MM-DD (will be rounded to Monday)"),
        endDate: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();

        const { data, error } = await supabase
          .from("activities")
          .select("activity_date, moving_time, distance, elevation_gain, avg_power, normalized_power, icu_training_load, icu_ftp")
          .eq("user_id", userId)
          .gte("activity_date", startDate)
          .lte("activity_date", endDate)
          .order("activity_date", { ascending: true });

        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { message: `No activities found between ${startDate} and ${endDate}.`, weeks: [] };
        }

        // Group activities by ISO week (Monday start)
        const rows = data as any as Record<string, unknown>[];
        const weekMap = new Map<string, Record<string, unknown>[]>();

        for (const row of rows) {
          const date = new Date(row.activity_date as string + "T00:00:00Z");
          // Get Monday of the week
          const day = date.getUTCDay();
          const mondayOffset = day === 0 ? -6 : 1 - day;
          const monday = new Date(date);
          monday.setUTCDate(date.getUTCDate() + mondayOffset);
          const weekKey = monday.toISOString().slice(0, 10);

          const list = weekMap.get(weekKey) ?? [];
          list.push(row);
          weekMap.set(weekKey, list);
        }

        // Build per-week summaries
        const weeks = Array.from(weekMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([weekStart, activities]) => {
            const totalTss = activities.reduce((s, a) => s + (a.icu_training_load ? Number(a.icu_training_load) : 0), 0);
            const totalMin = activities.reduce((s, a) => s + (a.moving_time ? Number(a.moving_time) / 60 : 0), 0);
            const totalKm = activities.reduce((s, a) => s + (a.distance ? Number(a.distance) / 1000 : 0), 0);
            const totalElev = activities.reduce((s, a) => s + (a.elevation_gain ? Number(a.elevation_gain) : 0), 0);
            const withPower = activities.filter((a) => a.avg_power != null);
            const avgPower = withPower.length > 0
              ? Math.round(withPower.reduce((s, a) => s + Number(a.avg_power), 0) / withPower.length)
              : null;
            const withNp = activities.filter((a) => a.normalized_power != null);
            const avgNp = withNp.length > 0
              ? Math.round(withNp.reduce((s, a) => s + Number(a.normalized_power), 0) / withNp.length)
              : null;

            // Intensity distribution: count rides by IF bracket
            const ftp = activities.find((a) => a.icu_ftp != null)?.icu_ftp as number | null;
            let z1z2 = 0, z3 = 0, z4plus = 0;
            if (ftp) {
              for (const a of withNp) {
                const ifactor = Number(a.normalized_power) / ftp;
                if (ifactor < 0.76) z1z2++;
                else if (ifactor < 0.91) z3++;
                else z4plus++;
              }
            }

            return compact({
              week_start: weekStart,
              rides: activities.length,
              tss: Math.round(totalTss),
              hours: Number((totalMin / 60).toFixed(1)),
              distance_km: Number(totalKm.toFixed(0)),
              elevation_m: Math.round(totalElev),
              avg_power_w: avgPower,
              avg_np_w: avgNp,
              rides_easy: z1z2 > 0 ? z1z2 : null,
              rides_moderate: z3 > 0 ? z3 : null,
              rides_hard: z4plus > 0 ? z4plus : null,
            });
          });

        return { period: `${startDate} to ${endDate}`, total_weeks: weeks.length, weeks };
      },
    }),

    // Feature 1: Planned vs Actual (ride_sessions)
    getWorkoutCompliance: tool({
      description:
        "Planned vs actual trainer sessions (completion, power, TSS) for a date range.",
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
        "Scheduled days vs actual riding days. Broader adherence check.",
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
        "Compare two date ranges side-by-side (TSS, volume, power, CTL).",
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
        "Best peak power values across activities in a date range.",
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
        "Detailed single-activity analysis (intervals, peaks, zones). Lookup by ID or date+name.",
      inputSchema: z.object({
        activityId: z.string().optional().describe("Activity UUID"),
        date: z.string().optional().describe("Activity date YYYY-MM-DD"),
        nameSearch: z.string().optional().describe("Partial name match"),
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
        "Schedule a library workout on a date. For multiple, use batchScheduleWorkouts.",
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

    batchScheduleWorkouts: tool({
      description:
        "Schedule multiple library workouts on multiple dates in one call.",
      inputSchema: z.object({
        workouts: z.array(
          z.object({
            workoutId: z.string().describe("UUID of the workout from the library"),
            date: z.string().describe("Date to schedule in YYYY-MM-DD format"),
          })
        ).min(1).max(14).describe("List of workout+date pairs to schedule"),
      }),
      execute: async ({ workouts }) => {
        const supabase = await createClient();

        // Verify all workout IDs are accessible
        const ids = [...new Set(workouts.map((w) => w.workoutId))];
        const { data: foundWorkouts, error: lookupError } = await supabase
          .from("workouts")
          .select("id, name, category")
          .or(`user_id.eq.${userId},is_preset.eq.true`)
          .in("id", ids);

        if (lookupError) return { error: lookupError.message };

        const workoutMap = new Map(
          ((foundWorkouts ?? []) as any[]).map((w: any) => [w.id, w])
        );

        const rows: { user_id: string; workout_id: string; scheduled_date: string }[] = [];
        const skipped: string[] = [];

        for (const { workoutId, date } of workouts) {
          if (workoutMap.has(workoutId)) {
            rows.push({ user_id: userId, workout_id: workoutId, scheduled_date: date });
          } else {
            skipped.push(`${date} (workout ${workoutId} not found)`);
          }
        }

        if (rows.length === 0) {
          return { error: "None of the specified workouts were found in the library." };
        }

        const { error: insertError } = await supabase
          .from("scheduled_workouts")
          .insert(rows);

        if (insertError) return { error: insertError.message };

        const scheduled = rows.map((r) => ({
          date: r.scheduled_date,
          workout_name: (workoutMap.get(r.workout_id) as any)?.name,
          workout_category: (workoutMap.get(r.workout_id) as any)?.category,
        }));

        return {
          success: true,
          scheduled_count: rows.length,
          scheduled,
          ...(skipped.length > 0 ? { skipped } : {}),
        };
      },
    }),

    // Schedule the workout described in <workout> tags in the current response.
    // This is a deferred action — the client handles actual creation after the response completes.
    scheduleDescribedWorkout: tool({
      description:
        "Schedule a new workout from <workout> tags onto calendar. Tags MUST precede this call.",
      inputSchema: z.object({
        date: z.string().describe("Date to schedule in YYYY-MM-DD format"),
      }),
      execute: async ({ date }) => {
        return { pending: true, date };
      },
    }),

    listScheduledWorkouts: tool({
      description:
        "List scheduled workouts for a date range.",
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
        "Remove a scheduled workout from the calendar by ID.",
      inputSchema: z.object({
        scheduledWorkoutId: z.string().describe("scheduled_workout_id from listScheduledWorkouts"),
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

    getRaceEvents: tool({
      description:
        "Fetch race events with pacing plans and route profiles.",
      inputSchema: z.object({
        name: z.string().optional().describe("Partial race name filter"),
        include_past: z.boolean().optional().describe("Include past races (default: false)"),
      }),
      execute: async ({ name, include_past }) => {
        const supabase = await createClient();
        const today = new Date().toISOString().slice(0, 10);

        let q = supabase
          .from("race_events")
          .select("id, name, race_date, event_type, distance_km, elevation_m, readiness_score, readiness_interpretation, pacing_plan, gpx_data")
          .eq("user_id", userId)
          .order("race_date", { ascending: true })
          .limit(10);

        if (!include_past) {
          q = q.gte("race_date", today);
        }
        if (name) {
          q = q.ilike("name", `%${name}%`);
        }

        const { data, error } = await q;
        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { message: "No race events found.", races: [] as unknown[] };
        }

        const races = (data as any[]).map((r: Record<string, unknown>) => {
          const plan = r.pacing_plan as Record<string, unknown> | null;
          const gpx = r.gpx_data as Record<string, unknown> | null;

          return {
            id: r.id,
            name: r.name,
            race_date: r.race_date,
            event_type: r.event_type,
            distance_km: r.distance_km,
            elevation_m: r.elevation_m,
            readiness_score: r.readiness_score ?? null,
            readiness_interpretation: r.readiness_interpretation ?? null,
            pacing_plan: plan
              ? {
                  overall_target_np_w: plan.overallTargetNpW,
                  estimated_finish_min: plan.estimatedFinishTimeMin,
                  strategy: plan.strategy,
                  segments: Array.isArray(plan.segments)
                    ? (plan.segments as Record<string, unknown>[]).map((s) => ({
                        label: s.label,
                        km: `${s.startKm}–${s.endKm}`,
                        target_power_w: s.targetPowerW,
                        target_power_pct: s.targetPowerPercent,
                        estimated_time_min: s.estimatedTimeMin,
                        hr_zone: s.targetHrZone ?? null,
                        hr_bpm: s.targetHrBpm ?? null,
                        advice: s.advice,
                      }))
                    : [],
                }
              : null,
            route_segments: gpx && Array.isArray(gpx.segments)
              ? (gpx.segments as Record<string, unknown>[]).map((s) => ({
                  label: s.label,
                  km: `${s.startKm}–${s.endKm}`,
                  distance_km: s.distanceKm,
                  elevation_gain_m: s.elevationGainM,
                  avg_gradient_pct: s.avgGradientPercent,
                  type: s.type,
                }))
              : null,
          };
        });

        return { count: races.length, races };
      },
    }),

    searchWorkoutLibrary: tool({
      description:
        "Search workout library (presets + custom) by name or category.",
      inputSchema: z.object({
        query: z.string().optional().describe("Partial name search"),
        category: z.string().optional().describe("Filter by category"),
      }),
      execute: async ({ query, category }) => {
        const supabase = await createClient();

        // Returns presets (is_preset=true) and user's library workouts (is_library=true)
        let q = supabase
          .from("workouts")
          .select("id, name, category, description, duration_seconds, avg_intensity_percent, tags, is_preset")
          .or(`is_preset.eq.true,and(user_id.eq.${userId},is_library.eq.true)`)
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
  supabase: SupabaseServerClient,
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
  supabase: SupabaseServerClient,
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
  const np = d.icu_weighted_avg_watts ?? null;
  const ifactor = np && ftp ? Number((np / ftp).toFixed(2)) : null;
  const vi = d.icu_variability_index ? Number(d.icu_variability_index.toFixed(2)) : null;
  const workKj = d.icu_joules ? Math.round(d.icu_joules / 1000) : null;
  const workAboveFtpKj = d.icu_joules_above_ftp ? Math.round(d.icu_joules_above_ftp / 1000) : null;
  const tsb = d.icu_ctl != null && d.icu_atl != null ? Math.round(d.icu_ctl - d.icu_atl) : null;

  const metrics = compact({
    name: d.name,
    date: d.start_date_local?.slice(0, 10),
    duration_min: durationMin,
    distance_km: distanceKm,
    elevation_m: elevationM,
    avg_power_w: d.icu_average_watts,
    np_w: np,
    max_power_w: d.max_watts,
    if: ifactor,
    tss: d.icu_training_load ? Math.round(d.icu_training_load) : null,
    vi: vi,
    avg_hr: d.average_heartrate,
    max_hr: d.max_heartrate,
    ftp: ftp,
    ef: d.icu_efficiency_factor ? Number(d.icu_efficiency_factor.toFixed(2)) : null,
    decoupling_pct: d.decoupling != null ? Number(d.decoupling.toFixed(1)) : null,
  });

  // Peak powers at key durations (only include durations with data)
  const keyDurations = [5, 60, 300, 1200, 3600];
  const peaks: Record<string, number> = {};
  for (const sec of keyDurations) {
    const pt = powerCurve.find((p) => p.secs === sec);
    if (pt?.watts) {
      const label =
        sec < 60 ? `${sec}s` : sec < 3600 ? `${sec / 60}min` : `${sec / 3600}h`;
      peaks[label] = pt.watts;
    }
  }

  // Intervals summary (max 8)
  const intervalsFormatted = intervals.slice(0, 8).map((iv) => compact({
    label: iv.label ?? iv.type ?? "—",
    duration_s: iv.elapsed_time ?? iv.moving_time ?? null,
    avg_power_w: iv.average_watts ?? null,
    pct_ftp: iv.intensity ? Math.round(iv.intensity * 100) : null,
    np_w: iv.weighted_average_watts ?? null,
    avg_hr: iv.average_heartrate ?? null,
    zone: iv.zone ?? null,
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
