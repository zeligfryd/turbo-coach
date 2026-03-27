"use server";

import { createClient } from "@/lib/supabase/server";
import { computePmc, type FitnessDay, type DailyLoad } from "@/lib/fitness/pmc";

export type { FitnessDay } from "@/lib/fitness/pmc";

export type DailyActivityLoad = {
  date: string;
  load: number;
};

/**
 * Fetch all activities and compute the full fitness curve (CTL/ATL/TSB)
 * from scratch using our PMC implementation.
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
      .select("activity_date, icu_training_load")
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

    // Sum training load per day (multiple rides on the same day get summed)
    const byDate = new Map<string, number>();
    for (const a of activities as { activity_date: string; icu_training_load: number }[]) {
      const load = Number(a.icu_training_load) || 0;
      byDate.set(a.activity_date, (byDate.get(a.activity_date) ?? 0) + load);
    }

    const dailyLoads: DailyActivityLoad[] = [];
    const pmcInput: DailyLoad[] = [];

    for (const [date, load] of byDate) {
      const rounded = Math.round(load);
      dailyLoads.push({ date, load: rounded });
      pmcInput.push({ date, load: rounded });
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
