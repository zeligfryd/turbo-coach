import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CoachUserContext, CoachMemoryItem } from "@/lib/ai/context";
import { formatCoachUserContext } from "@/lib/ai/context";

export type CoachKnowledgeChunk = {
  id: number;
  content: string;
  source: string | null;
  category: string | null;
  similarity: number;
};

const BASE_COACH_PROMPT = readFileSync(
  join(process.cwd(), "lib", "ai", "coach-system-prompt.md"),
  "utf-8"
);

const formatRagContext = (chunks: CoachKnowledgeChunk[]): string => {
  if (chunks.length === 0) {
    return "Retrieved cycling knowledge: none.";
  }

  const lines = chunks.map((chunk, index) => {
    const source = chunk.source ?? "Unknown source";
    const category = chunk.category ?? "uncategorized";
    return `[${
      index + 1
    }] Source: ${source} | Category: ${category} | Similarity: ${chunk.similarity.toFixed(
      3
    )}\n${chunk.content}`;
  });

  return `Retrieved cycling knowledge:\n${lines.join("\n\n")}`;
};

const CATEGORY_LABELS: Record<string, string> = {
  goals: "Goals",
  preferences: "Preferences",
  limitations: "Limitations & injuries",
  training_patterns: "Training patterns",
  insights: "Coach insights",
  biographical: "Biographical",
};

const formatMemories = (memories: CoachMemoryItem[]): string => {
  if (memories.length === 0) {
    return "";
  }

  const grouped = new Map<string, string[]>();
  for (const m of memories) {
    const list = grouped.get(m.category) ?? [];
    list.push(m.content);
    grouped.set(m.category, list);
  }

  const sections = Array.from(grouped.entries()).map(([category, items]) => {
    const label = CATEGORY_LABELS[category] ?? category;
    return `**${label}:**\n${items.map((c) => `- ${c}`).join("\n")}`;
  });

  return `Athlete memory (persistent facts from past conversations):\n${sections.join("\n\n")}`;
};

export const buildCoachSystemPrompt = (params: {
  userContext: CoachUserContext;
  ragChunks: CoachKnowledgeChunk[];
}) => {
  const userContext = formatCoachUserContext(params.userContext);
  const ragContext = formatRagContext(params.ragChunks);
  const memoriesContext = formatMemories(params.userContext.memories);

  const today = new Date().toISOString().slice(0, 10);
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const parts = [BASE_COACH_PROMPT, `Today is ${dayName}, ${today}.`, userContext];
  if (memoriesContext) {
    parts.push(memoriesContext);
  }
  parts.push(ragContext);

  return parts.join("\n\n");
};
