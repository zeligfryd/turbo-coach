"use server";

import { createClient } from "@/lib/supabase/server";
import { extractMemories } from "@/lib/ai/memory";

export type ConversationListItem = {
  id: string;
  title: string;
  updated_at: string;
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
      .select("id, title, updated_at")
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
