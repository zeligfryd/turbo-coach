import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePostRideAnalysis } from "@/lib/ai/insights";
import {
  getOrCreateInsightsConversation,
  appendInsightMessage,
} from "@/lib/coach/insights-conversation";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Check if the user has auto_analysis_enabled, find activities from today
 * that haven't been analysed yet, and generate post-ride analyses.
 */
export async function triggerPostRideAnalysis(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  // Check user setting
  const { data: settings } = await supabase
    .from("users")
    .select("auto_analysis_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (!(settings as any)?.auto_analysis_enabled) {
    return;
  }

  // Find recent activities (last 2 days) that don't have an analysis yet
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const cutoff = twoDaysAgo.toISOString().slice(0, 10);

  const { data: activities } = await supabase
    .from("activities")
    .select(
      "id, activity_date, name, type, moving_time, icu_training_load, " +
      "avg_power, normalized_power, max_power, avg_hr, max_hr, avg_cadence, " +
      "distance, elevation_gain, calories"
    )
    .eq("user_id", userId)
    .gte("activity_date", cutoff)
    .order("activity_date", { ascending: false })
    .limit(5);

  if (!activities || activities.length === 0) {
    return;
  }

  // Check which activities already have an analysis
  const activityIds = (activities as any[]).map((a: any) => a.id);
  const { data: existingInsights } = await supabase
    .from("coach_insights")
    .select("metadata")
    .eq("user_id", userId)
    .eq("type", "post_ride_analysis")
    .gte("created_at", `${cutoff}T00:00:00`);

  const analysedIds = new Set(
    ((existingInsights as any[]) ?? [])
      .map((i: any) => i.metadata?.activity_id)
      .filter(Boolean)
  );

  const unanalysed = (activities as any[]).filter(
    (a: any) => !analysedIds.has(a.id)
  );

  if (unanalysed.length === 0) {
    return;
  }

  // Generate analysis for the most recent unanalysed activity only (avoid burst of LLM calls)
  const activity = unanalysed[0] as Record<string, unknown>;
  try {
    const analysis = await generatePostRideAnalysis(userId, activity);
    if (analysis) {
      const convId = await getOrCreateInsightsConversation(supabase, userId);
      await appendInsightMessage(supabase, convId, userId, analysis, "post_ride_analysis", {
        activity_id: activity.id,
        activity_name: activity.name ?? activity.type ?? "Ride",
        activity_date: activity.activity_date,
      });
      // Insert a minimal record for deduplication (so the same activity isn't analyzed twice)
      await supabase.from("coach_insights").insert({
        user_id: userId,
        type: "post_ride_analysis",
        content: "",
        metadata: { activity_id: activity.id },
        read: true,
      });
      console.log("[PostRide] Generated analysis for activity", activity.id);
    }
  } catch (err) {
    console.error("[PostRide] Failed to generate analysis:", err);
  }
}
