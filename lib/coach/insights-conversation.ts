import type { SupabaseClient } from "@supabase/supabase-js";

export const INSIGHTS_CONVERSATION_TITLE = "Training Insights";

/**
 * Find or create the system "Training Insights" conversation for a user.
 */
export async function getOrCreateInsightsConversation(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("coach_conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("is_system", true)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("coach_conversations")
    .insert({
      user_id: userId,
      title: INSIGHTS_CONVERSATION_TITLE,
      is_system: true,
      messages: [],
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create insights conversation: ${error.message}`);
  return created.id;
}

/**
 * Atomically append an insight as an assistant message to the system conversation.
 */
export async function appendInsightMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  content: string,
  insightType: "weekly_summary" | "post_ride_analysis",
  metadata?: Record<string, unknown>
): Promise<void> {
  let label: string;
  if (insightType === "weekly_summary" && metadata?.week_start && metadata?.week_end) {
    label = `Weekly Summary (${metadata.week_start} – ${metadata.week_end})`;
  } else if (insightType === "weekly_summary") {
    label = "Weekly Summary";
  } else {
    const activityName = metadata?.activity_name ?? "Ride";
    const activityDate = metadata?.activity_date ?? "";
    label = `Ride Analysis: ${activityName}${activityDate ? ` (${activityDate})` : ""}`;
  }

  const message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: `**${label}**\n\n${content}`,
    createdAt: new Date().toISOString(),
    insightType,
    ...(metadata ? { insightMetadata: metadata } : {}),
  };

  const { error } = await supabase.rpc("append_insight_message", {
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_message: message,
  });

  if (error) throw new Error(`Failed to append insight message: ${error.message}`);
}
