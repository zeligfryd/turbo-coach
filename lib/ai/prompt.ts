import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CoachUserContext } from "@/lib/ai/context";
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

export const buildCoachSystemPrompt = (params: {
  userContext: CoachUserContext;
  ragChunks: CoachKnowledgeChunk[];
}) => {
  const userContext = formatCoachUserContext(params.userContext);
  const ragContext = formatRagContext(params.ragChunks);

  return [BASE_COACH_PROMPT, userContext, ragContext].join("\n\n");
};
