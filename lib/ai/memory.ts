import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveModels } from "@/lib/ai/models";
import { extractMessageText } from "@/lib/ai/utils";

const MEMORY_CATEGORIES = [
  "goals",
  "preferences",
  "limitations",
  "training_patterns",
  "insights",
  "biographical",
] as const;

const MemoryExtractionSchema = z.object({
  memories: z.array(
    z.object({
      category: z.enum(MEMORY_CATEGORIES),
      content: z.string(),
      replaces: z.string().uuid().nullable(),
    })
  ),
});

type ExistingMemory = {
  id: string;
  category: string;
  content: string;
};

const buildExtractionPrompt = (
  lastUserMessage: string,
  lastAssistantMessage: string,
  existingMemories: ExistingMemory[]
) => {
  const existingSection =
    existingMemories.length > 0
      ? `\nExisting athlete memories:\n${existingMemories
          .map((m) => `- [${m.id}] (${m.category}) ${m.content}`)
          .join("\n")}\n`
      : "\nNo existing memories yet.\n";

  return `You are a memory extraction system for an AI cycling coach. Analyze the following conversation exchange and extract any persistent, cycling-relevant facts about the athlete.

Categories:
- goals: Racing targets, FTP goals, event dates, weight goals
- preferences: Training time preferences, indoor/outdoor preference, music, communication style
- limitations: Injuries, time constraints, equipment limitations, health conditions
- training_patterns: Observed patterns like "tends to skip recovery days", "responds well to sweet spot"
- insights: Coach observations about the athlete's fitness, strengths, weaknesses
- biographical: Age, experience level, location, job schedule, family commitments

Rules:
- Only extract facts that are worth remembering across conversations
- Return an empty array if nothing is worth remembering
- If a new fact updates/contradicts an existing memory, set "replaces" to the existing memory's ID
- Keep content concise (one sentence)
- Do not extract ephemeral details (today's weather, current mood)
${existingSection}
Latest exchange:
User: ${lastUserMessage}
Assistant: ${lastAssistantMessage}`;
};

export async function extractMemories(
  messages: Array<{ role: string; content?: unknown; parts?: unknown }>,
  userId: string,
  conversationId: string
) {
  const supabase = await createClient();

  // Find last user and assistant messages
  const reversed = [...messages].reverse();
  const lastUser = reversed.find((m) => m.role === "user");
  const lastAssistant = reversed.find((m) => m.role === "assistant");

  if (!lastUser || !lastAssistant) {
    console.log("[Memory] No user/assistant message pair found, skipping");
    return;
  }

  const userText = extractMessageText(lastUser);
  const assistantText = extractMessageText(lastAssistant);

  if (!userText || !assistantText) {
    console.log("[Memory] Could not extract text from messages, skipping", {
      userText: userText ? `${userText.slice(0, 50)}...` : "(empty)",
      assistantText: assistantText ? `${assistantText.slice(0, 50)}...` : "(empty)",
    });
    return;
  }

  // Load existing memories
  const { data: existingMemories } = await supabase
    .from("coach_memories")
    .select("id, category, content")
    .eq("user_id", userId)
    .limit(50);

  const existing: ExistingMemory[] = (existingMemories ?? []) as ExistingMemory[];

  const prompt = buildExtractionPrompt(userText, assistantText, existing);

  const { models } = resolveModels();
  const result = await generateObject({
    model: models.memoryExtraction,
    schema: MemoryExtractionSchema,
    prompt,
  });

  const { memories } = result.object;

  console.log("[Memory] Extraction result:", memories.length, "memories", memories);

  if (memories.length === 0) {
    return;
  }

  // Delete replaced memories — only allow IDs that we actually passed to the LLM
  const existingIds = new Set(existing.map((m) => m.id));
  const replaceIds = memories
    .map((m) => m.replaces)
    .filter((id): id is string => id != null && existingIds.has(id));

  if (replaceIds.length > 0) {
    await supabase
      .from("coach_memories")
      .delete()
      .in("id", replaceIds)
      .eq("user_id", userId);
  }

  // Insert new memories
  const rows = memories.map((m) => ({
    user_id: userId,
    category: m.category,
    content: m.content,
    source_conversation_id: conversationId,
  }));

  const { error: insertError } = await supabase.from("coach_memories").insert(rows);
  if (insertError) {
    console.error("[Memory] Failed to insert memories:", insertError.message);
  } else {
    console.log("[Memory] Saved", rows.length, "memories to DB");
  }
}
