import { tool, generateText, embed } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveModels } from "@/lib/ai/models";

/** Strip null/undefined values to reduce token usage. */
const compact = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as Partial<T>;

/**
 * Run a cheap model (Haiku) to compress verbose tool output into a terse
 * coaching summary. Keeps numbers and material facts; drops fluff.
 * Falls back to the raw JSON on any failure so the main model still gets data.
 */
async function compressWithHaiku(
  data: unknown,
  instructions: string,
): Promise<string> {
  try {
    const { models } = resolveModels();
    const result = await generateText({
      model: models.workoutExtraction,
      system:
        "You compress raw data for a cycling coach. Output terse prose with specific numbers, weekly/period aggregates, and patterns. No filler, no headers, no bullet markers unless genuinely listing items. Preserve units.",
      prompt: `${instructions}\n\nDATA:\n${JSON.stringify(data)}`,
    });
    const text = result.text.trim();
    return text || JSON.stringify(data);
  } catch (err) {
    console.warn("[Plan Coach] Haiku compression failed:", err);
    return JSON.stringify(data);
  }
}

export function createPlanReadTools(userId: string) {
  return {
    getFitnessTrend: tool({
      description:
        "Daily CTL/ATL/TSB + ramp rate for a date range. Use to reason about the rider's current fitness, freshness, and ramp tolerance when sizing weekly TSS.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date YYYY-MM-DD"),
        endDate: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("wellness")
          .select("date, ctl, atl, tsb, ramp_rate")
          .eq("user_id", userId)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date", { ascending: true })
          .limit(120);

        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { message: `No wellness data between ${startDate} and ${endDate}.` };
        }

        const days = (data as Array<Record<string, unknown>>).map((d) =>
          compact({
            date: d.date,
            ctl: d.ctl != null ? Math.round(Number(d.ctl)) : null,
            atl: d.atl != null ? Math.round(Number(d.atl)) : null,
            tsb: d.tsb != null ? Math.round(Number(d.tsb)) : null,
            ramp:
              d.ramp_rate != null ? Number(Number(d.ramp_rate).toFixed(1)) : null,
          }),
        );

        const first = days[0] as { ctl?: number; atl?: number; tsb?: number };
        const last = days[days.length - 1] as {
          ctl?: number;
          atl?: number;
          tsb?: number;
        };

        return {
          period: `${startDate} to ${endDate}`,
          days,
          deltas: {
            ctl: (last.ctl ?? 0) - (first.ctl ?? 0),
            atl: (last.atl ?? 0) - (first.atl ?? 0),
            tsb: (last.tsb ?? 0) - (first.tsb ?? 0),
          },
        };
      },
    }),

    getRecentActivities: tool({
      description:
        "Summary of the rider's rides in a date range. Returns a Haiku-compressed prose summary (training patterns, volume, intensity distribution, notable sessions) — NOT raw per-ride rows. Use for context on what the rider has been doing.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date YYYY-MM-DD"),
        endDate: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("activities")
          .select(
            "activity_date, name, type, moving_time, icu_training_load, avg_power, normalized_power, max_power, avg_hr, distance, elevation_gain, icu_ftp",
          )
          .eq("user_id", userId)
          .gte("activity_date", startDate)
          .lte("activity_date", endDate)
          .order("activity_date", { ascending: true })
          .limit(40);

        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { message: `No rides between ${startDate} and ${endDate}.` };
        }

        const rides = (data as Array<Record<string, unknown>>).map((a) =>
          compact({
            d: a.activity_date,
            name: a.name,
            min: a.moving_time ? Math.round(Number(a.moving_time) / 60) : null,
            tss: a.icu_training_load
              ? Math.round(Number(a.icu_training_load))
              : null,
            ap: a.avg_power,
            np: a.normalized_power,
            maxp: a.max_power,
            hr: a.avg_hr,
            km: a.distance ? Number((Number(a.distance) / 1000).toFixed(1)) : null,
            elev: a.elevation_gain ? Math.round(Number(a.elevation_gain)) : null,
            ftp: a.icu_ftp,
          }),
        );

        const summary = await compressWithHaiku(
          { period: `${startDate} to ${endDate}`, count: rides.length, rides },
          "Summarise these rides for a coach planning future training. Cover: total volume (rides, hours, TSS), typical weekly pattern (rest days, intensity days, long ride), intensity mix (endurance vs tempo/threshold vs vo2 — infer from IF = NP/FTP), any standout or concerning sessions. 4-8 short lines max.",
        );

        return {
          period: `${startDate} to ${endDate}`,
          ride_count: rides.length,
          summary,
        };
      },
    }),

    getPeakPowers: tool({
      description:
        "Best power values in a date range across several durations. Use to gauge the rider's current ceiling (sprint, VO2, threshold) and identify their strengths.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date YYYY-MM-DD"),
        endDate: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("activities")
          .select(
            "activity_date, name, max_power, avg_power, normalized_power, moving_time, icu_ftp",
          )
          .eq("user_id", userId)
          .gte("activity_date", startDate)
          .lte("activity_date", endDate)
          .not("max_power", "is", null)
          .order("max_power", { ascending: false })
          .limit(30);

        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { message: `No rides with power between ${startDate} and ${endDate}.` };
        }

        const rows = data as Array<Record<string, unknown>>;
        const nps = rows
          .map((a) => a.normalized_power as number | null)
          .filter((v): v is number => v != null);
        const aps = rows
          .map((a) => a.avg_power as number | null)
          .filter((v): v is number => v != null);

        const ftp = rows.find((a) => a.icu_ftp != null)?.icu_ftp as number | null;

        return {
          period: `${startDate} to ${endDate}`,
          ftp_on_record: ftp,
          best_max_power_w: rows[0].max_power,
          best_max_power_date: rows[0].activity_date,
          best_np_w: nps.length > 0 ? Math.max(...nps) : null,
          avg_np_across_rides_w:
            nps.length > 0
              ? Math.round(nps.reduce((s, v) => s + v, 0) / nps.length)
              : null,
          avg_ap_across_rides_w:
            aps.length > 0
              ? Math.round(aps.reduce((s, v) => s + v, 0) / aps.length)
              : null,
          top_5: rows.slice(0, 5).map((a) =>
            compact({
              date: a.activity_date,
              name: a.name,
              max_w: a.max_power,
              np_w: a.normalized_power,
              min: a.moving_time ? Math.round(Number(a.moving_time) / 60) : null,
            }),
          ),
        };
      },
    }),

    getWorkoutCompliance: tool({
      description:
        "Planned vs actual trainer sessions for a date range. Returns a Haiku-compressed summary of adherence patterns, not every row. Use to gauge whether the rider is hitting prescribed work.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date YYYY-MM-DD"),
        endDate: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const supabase = await createClient();
        const [{ data: scheduled }, { data: sessions }] = await Promise.all([
          supabase
            .from("scheduled_workouts")
            .select(
              "id, scheduled_date, workout:workouts(id, name, category, duration_seconds, avg_intensity_percent)",
            )
            .eq("user_id", userId)
            .gte("scheduled_date", startDate)
            .lte("scheduled_date", endDate)
            .order("scheduled_date", { ascending: true }),
          supabase
            .from("ride_sessions")
            .select(
              "workout_id, started_at, duration_seconds, avg_power, normalized_power, tss, status, workout_completed",
            )
            .eq("user_id", userId)
            .gte("started_at", `${startDate}T00:00:00`)
            .lte("started_at", `${endDate}T23:59:59`),
        ]);

        if (!scheduled || scheduled.length === 0) {
          return { message: `No scheduled workouts between ${startDate} and ${endDate}.` };
        }

        const sessionByWorkout = new Map<string, Record<string, unknown>>();
        for (const s of (sessions as Array<Record<string, unknown>>) ?? []) {
          const wid = s.workout_id as string | null;
          if (wid) sessionByWorkout.set(wid, s);
        }

        const items = (scheduled as Array<Record<string, unknown>>).map((sw) => {
          const w = Array.isArray(sw.workout)
            ? (sw.workout[0] as Record<string, unknown> | null)
            : (sw.workout as Record<string, unknown> | null);
          if (!w) return { d: sw.scheduled_date, status: "missing_data" };
          const session = sessionByWorkout.get(w.id as string);
          if (!session) {
            return compact({
              d: sw.scheduled_date,
              name: w.name,
              cat: w.category,
              plan_min: w.duration_seconds
                ? Math.round(Number(w.duration_seconds) / 60)
                : null,
              status: "skipped",
            });
          }
          const plannedDur = w.duration_seconds
            ? Number(w.duration_seconds)
            : null;
          const actualDur = session.duration_seconds
            ? Number(session.duration_seconds)
            : null;
          return compact({
            d: sw.scheduled_date,
            name: w.name,
            cat: w.category,
            status: session.workout_completed
              ? "done"
              : session.status === "paused"
                ? "partial"
                : "done",
            plan_min: plannedDur ? Math.round(plannedDur / 60) : null,
            actual_min: actualDur ? Math.round(actualDur / 60) : null,
            tss: session.tss ? Math.round(Number(session.tss)) : null,
          });
        });

        const done = items.filter((i) => i.status === "done").length;
        const skipped = items.filter((i) => i.status === "skipped").length;

        const summary = await compressWithHaiku(
          { period: `${startDate} to ${endDate}`, items },
          "Summarise workout compliance for a coach. Cover: completion rate, types of sessions being skipped vs completed, whether actual durations match planned, and any consistency patterns. 3-6 short lines max.",
        );

        return {
          period: `${startDate} to ${endDate}`,
          scheduled: items.length,
          done,
          skipped,
          partial: items.length - done - skipped,
          compliance_percent: Math.round((done / items.length) * 100),
          summary,
        };
      },
    }),

    searchKnowledgeBase: tool({
      description:
        "Semantic search across the ingested cycling training literature (Coggan, Friel, Seiler, etc.). Returns a Haiku-distilled extract of relevant coaching principles for the query — not raw chunks. Use when the rider asks for a rationale or when you want to ground a block design in accepted methodology.",
      inputSchema: z.object({
        query: z
          .string()
          .min(3)
          .max(200)
          .describe("Natural-language question, e.g. 'polarized base block structure'"),
      }),
      execute: async ({ query }) => {
        try {
          const { models } = resolveModels();
          const supabase = await createClient();

          const { embedding } = await embed({
            model: models.embedding,
            value: query,
          });

          const { data, error } = await supabase.rpc("match_knowledge_chunks", {
            query_embedding: embedding,
            match_count: 6,
            match_threshold: 0.4,
          });

          if (error) return { error: error.message, excerpt: null };
          const chunks = Array.isArray(data)
            ? (data as Array<Record<string, unknown>>)
            : [];
          if (chunks.length === 0) {
            return { message: `No relevant passages found for "${query}".` };
          }

          const extract = await compressWithHaiku(
            chunks.slice(0, 5).map((c) => ({
              source: c.source,
              category: c.category,
              content: c.content,
            })),
            `Distil coaching guidance relevant to the question: "${query}". Extract principles, ranges, and prescriptions. Cite source titles when a claim comes from a specific author. Skip filler. Max 8 lines.`,
          );

          return {
            query,
            chunk_count: chunks.length,
            sources: Array.from(
              new Set(
                chunks
                  .map((c) => c.source as string | null)
                  .filter((s): s is string => !!s),
              ),
            ),
            extract,
          };
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : "Knowledge search failed",
          };
        }
      },
    }),
  };
}

export type PlanReadTools = ReturnType<typeof createPlanReadTools>;
