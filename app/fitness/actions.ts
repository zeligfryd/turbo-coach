"use server";

import { createClient } from "@/lib/supabase/server";
import { computePmc, type FitnessDay, type DailyLoad } from "@/lib/fitness/pmc";

export type { FitnessDay } from "@/lib/fitness/pmc";

export type DailyActivityLoad = {
  date: string;
  load: number;
};

/**
 * Fetch all activities, deduplicate across sources, and compute the full
 * fitness curve (CTL/ATL/TSB) from scratch using our PMC implementation.
 */
export async function getFitnessData() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", fitness: [], dailyLoads: [] };
    }

    const { data: activities, error } = await supabase
      .from("activities")
      .select("activity_date, icu_training_load, source")
      .eq("user_id", user.id)
      .not("icu_training_load", "is", null)
      .gt("icu_training_load", 0)
      .order("activity_date", { ascending: true });

    if (error) {
      return { success: false, error: error.message, fitness: [], dailyLoads: [] };
    }

    if (!activities || activities.length === 0) {
      return { success: true, fitness: [], dailyLoads: [] };
    }

    // Deduplicate across sources: per day, prefer ICU load over Strava
    const byDate = new Map<string, { icu: number; strava: number }>();
    for (const a of activities as { activity_date: string; icu_training_load: number; source: string }[]) {
      const date = a.activity_date;
      const load = Number(a.icu_training_load) || 0;
      const entry = byDate.get(date) ?? { icu: 0, strava: 0 };
      if (a.source === "intervals.icu") {
        entry.icu += load;
      } else {
        entry.strava += load;
      }
      byDate.set(date, entry);
    }

    const dailyLoads: DailyActivityLoad[] = [];
    const pmcInput: DailyLoad[] = [];

    for (const [date, { icu, strava }] of byDate) {
      const load = Math.round(icu > 0 ? icu : strava);
      dailyLoads.push({ date, load });
      pmcInput.push({ date, load });
    }

    dailyLoads.sort((a, b) => a.date.localeCompare(b.date));
    pmcInput.sort((a, b) => a.date.localeCompare(b.date));

    // Extend to today so the curve shows decay to the current date
    const today = new Date().toISOString().slice(0, 10);
    if (pmcInput[pmcInput.length - 1].date < today) {
      pmcInput.push({ date: today, load: 0 });
    }

    const fitness = computePmc(pmcInput);

    return { success: true, fitness, dailyLoads };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      fitness: [],
      dailyLoads: [],
    };
  }
}
