"use server";

import { createClient } from "@/lib/supabase/server";
import { extractMemories } from "@/lib/ai/memory";
import { revalidatePath } from "next/cache";

export type ConversationListItem = {
  id: string;
  title: string;
  updated_at: string;
  is_system: boolean;
  unread_count: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: unknown[];
  created_at: string;
  updated_at: string;
};

export type CoachMemory = {
  id: string;
  category: string;
  content: string;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getConversations(): Promise<{
  success: boolean;
  error?: string;
  conversations: ConversationListItem[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", conversations: [] };
    }

    const { data, error } = await supabase
      .from("coach_conversations")
      .select("id, title, updated_at, is_system, unread_count")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message, conversations: [] };
    }

    return { success: true, conversations: (data as ConversationListItem[]) ?? [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      conversations: [],
    };
  }
}

export async function getConversation(
  id: string
): Promise<{ success: boolean; error?: string; conversation: Conversation | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", conversation: null };
    }

    const { data, error } = await supabase
      .from("coach_conversations")
      .select("id, title, messages, created_at, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message, conversation: null };
    }

    return { success: true, conversation: data as Conversation | null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      conversation: null,
    };
  }
}

export async function createConversation(
  title?: string
): Promise<{ success: boolean; error?: string; id: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", id: null };
    }

    const { data, error } = await supabase
      .from("coach_conversations")
      .insert({
        user_id: user.id,
        title: title ?? "New conversation",
      })
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message, id: null };
    }

    return { success: true, id: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      id: null,
    };
  }
}

export async function saveConversationMessages(
  id: string,
  messages: unknown[],
  title?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const update: Record<string, unknown> = {
      messages,
      updated_at: new Date().toISOString(),
    };
    if (title) {
      update.title = title;
    }

    const { error } = await supabase
      .from("coach_conversations")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteConversation(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Prevent deletion of system conversations
    const { data: conv } = await supabase
      .from("coach_conversations")
      .select("is_system")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conv?.is_system) {
      return { success: false, error: "Cannot delete the Training Insights conversation" };
    }

    const { error } = await supabase
      .from("coach_conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function markConversationRead(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("coach_conversations")
      .update({ unread_count: 0 })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getCoachUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return 0;

    const { data } = await supabase
      .from("coach_conversations")
      .select("unread_count")
      .eq("user_id", user.id)
      .eq("is_system", true)
      .maybeSingle();

    return (data as { unread_count: number } | null)?.unread_count ?? 0;
  } catch {
    return 0;
  }
}

export async function getMemories(): Promise<{
  success: boolean;
  error?: string;
  memories: CoachMemory[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", memories: [] };
    }

    const { data, error } = await supabase
      .from("coach_memories")
      .select("id, category, content, source_conversation_id, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message, memories: [] };
    }

    return { success: true, memories: (data as CoachMemory[]) ?? [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      memories: [],
    };
  }
}

export async function deleteMemory(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("coach_memories")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── Coach Insights ──────────────────────────────────────────

export type CoachInsight = {
  id: string;
  type: "weekly_summary" | "post_ride_analysis";
  content: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export async function getUnreadInsights(): Promise<{
  success: boolean;
  error?: string;
  insights: CoachInsight[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", insights: [] };
    }

    const { data, error } = await supabase
      .from("coach_insights")
      .select("id, type, content, metadata, read, created_at")
      .eq("user_id", user.id)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return { success: false, error: error.message, insights: [] };
    }

    return { success: true, insights: (data as CoachInsight[]) ?? [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      insights: [],
    };
  }
}

export async function markInsightRead(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("coach_insights")
      .update({ read: true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function dismissAllInsights(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("coach_insights")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── User Coach Settings ─────────────────────────────────────

export type CoachSettings = {
  weekly_summary_enabled: boolean;
  auto_analysis_enabled: boolean;
};

export async function getCoachSettings(): Promise<{
  success: boolean;
  error?: string;
  settings: CoachSettings;
}> {
  const defaults: CoachSettings = { weekly_summary_enabled: false, auto_analysis_enabled: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", settings: defaults };
    }

    const { data, error } = await supabase
      .from("users")
      .select("weekly_summary_enabled, auto_analysis_enabled")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message, settings: defaults };
    }

    return {
      success: true,
      settings: {
        weekly_summary_enabled: (data as Record<string, unknown>)?.weekly_summary_enabled === true,
        auto_analysis_enabled: (data as Record<string, unknown>)?.auto_analysis_enabled === true,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      settings: defaults,
    };
  }
}

export async function updateCoachSettings(
  settings: Partial<CoachSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof settings.weekly_summary_enabled === "boolean") {
      update.weekly_summary_enabled = settings.weekly_summary_enabled;
    }
    if (typeof settings.auto_analysis_enabled === "boolean") {
      update.auto_analysis_enabled = settings.auto_analysis_enabled;
    }

    const { error } = await supabase
      .from("users")
      .update(update)
      .eq("id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── Create & Schedule Workout from Coach Description ────────

export async function createAndScheduleCoachWorkout(
  extractedWorkout: {
    name: string;
    category: string;
    description: string | null;
    tags: string[];
    intervals: unknown[];
  },
  scheduledDate: string,
): Promise<{ success: boolean; error?: string; workoutName?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { data: created, error: insertError } = await supabase
      .from("workouts")
      .insert({
        name: extractedWorkout.name,
        category: extractedWorkout.category,
        description: extractedWorkout.description,
        tags: extractedWorkout.tags,
        intervals: extractedWorkout.intervals,
        user_id: user.id,
        is_preset: false,
        is_public: false,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return { success: false, error: insertError?.message ?? "Failed to create workout" };
    }

    const { error: schedError } = await supabase.from("scheduled_workouts").insert({
      user_id: user.id,
      workout_id: created.id,
      scheduled_date: scheduledDate,
    });

    if (schedError) {
      return { success: false, error: schedError.message };
    }

    revalidatePath("/calendar");
    return { success: true, workoutName: extractedWorkout.name };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── Memory Extraction ───────────────────────────────────────

export async function triggerMemoryExtraction(
  conversationId: string,
  messages: Array<{ role: string; content?: unknown; parts?: unknown }>
): Promise<void> {
  console.log("[Memory] triggerMemoryExtraction called", {
    conversationId,
    messageCount: messages.length,
    roles: messages.map((m) => m.role),
  });
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log("[Memory] Auth failed, skipping");
      return;
    }

    await extractMemories(messages, user.id, conversationId);
  } catch (err) {
    console.warn("[Memory] Extraction failed:", err);
  }
}
