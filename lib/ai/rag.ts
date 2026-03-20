import { embed, generateObject, generateText } from "ai";
import { z } from "zod";
import type { CoachUserContext } from "@/lib/ai/context";
import { resolveModels, type RuntimeModelOverrides } from "@/lib/ai/models";
import type { CoachKnowledgeChunk } from "@/lib/ai/prompt";
import { createClient } from "@/lib/supabase/server";

/** Set to false to disable temporary AI step logging (inputs/outputs, excluding long system prompt). */
const LOG_AI_STEPS = true;

const QuerySchema = z.object({
  queries: z.array(z.string().min(4)).min(1).max(3),
});

const QUERY_SYSTEM_PROMPT = `You generate retrieval queries for a cycling knowledge base.
Use the rider question and context to infer what specific training topics are needed.
Return 1-3 short search queries that will retrieve useful coaching references.
Avoid repeating the same concept with different wording.`;

const parseQueriesFromText = (text: string): string[] => {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1] ?? trimmed;

  const asJson = (() => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  })();

  if (asJson) {
    const parsed = QuerySchema.safeParse(asJson);
    if (parsed.success) {
      return parsed.data.queries;
    }
  }

  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsedObject = JSON.parse(objectMatch[0]);
      const parsed = QuerySchema.safeParse(parsedObject);
      if (parsed.success) {
        return parsed.data.queries;
      }
    } catch {
      // ignore parse failure and fall through
    }
  }

  return [];
};

const formatWorkoutSummary = (
  workouts: CoachUserContext["recentScheduledWorkouts"],
  label: string
): string => {
  if (workouts.length === 0) return `${label}: none`;
  const lines = workouts
    .map((item) => {
      const workout = Array.isArray(item.workout) ? item.workout[0] : item.workout;
      if (!workout) return `${item.scheduled_date}: unknown workout`;
      return `${item.scheduled_date}: ${workout.name} (${workout.category})`;
    })
    .slice(0, 8);
  return `${label}:\n${lines.join("\n")}`;
};

const formatForQueryPlanning = (userMessage: string, userContext: CoachUserContext): string => {
  const recentSummary = formatWorkoutSummary(
    userContext.recentScheduledWorkouts,
    "Recent scheduled workouts (past 14 days)"
  );
  const upcomingSummary = formatWorkoutSummary(
    userContext.upcomingScheduledWorkouts,
    "Upcoming scheduled workouts (next 7 days)"
  );

  return [
    `User message: ${userMessage}`,
    `FTP: ${userContext.ftp ?? "unknown"}`,
    `Weight: ${userContext.weight ?? "unknown"}`,
    recentSummary,
    upcomingSummary,
  ].join("\n\n");
};

export async function generateSearchQueries(
  userMessage: string,
  userContext: CoachUserContext,
  modelOverrides?: RuntimeModelOverrides
): Promise<string[]> {
  const queryGenInput = formatForQueryPlanning(userMessage, userContext);
  if (LOG_AI_STEPS) {
    console.log("[AI Step: QueryGeneration] input (prompt, no system):", queryGenInput);
  }

  try {
    const { models, config } = resolveModels(modelOverrides);
    let rawQueries: string[] = [];

    if (config.queryGeneration.provider === "ollama") {
      const result = await generateText({
        model: models.queryGeneration,
        system: `${QUERY_SYSTEM_PROMPT}
Output must be valid JSON only, in this exact shape: {"queries":["query 1","query 2"]}.`,
        prompt: queryGenInput,
      });
      rawQueries = parseQueriesFromText(result.text);
    } else {
      const result = await generateObject({
        model: models.queryGeneration,
        schema: QuerySchema,
        system: QUERY_SYSTEM_PROMPT,
        prompt: queryGenInput,
      });
      rawQueries = result.object.queries;
    }

    const uniqueQueries = Array.from(new Set(rawQueries.map((query) => query.trim()).filter(Boolean)));
    if (LOG_AI_STEPS) {
      console.log("[AI Step: QueryGeneration] output:", uniqueQueries);
    }

    return uniqueQueries.length > 0 ? uniqueQueries : [userMessage];
  } catch (error) {
    console.warn("Failed to generate focused RAG queries, falling back to user message.", error);
    return [userMessage];
  }
}

type MatchKnowledgeChunkRow = {
  id: number | string;
  content: string;
  source: string | null;
  category: string | null;
  similarity: number;
};

export async function retrieveKnowledge(
  queries: string[],
  options?: {
    matchCount?: number;
    matchThreshold?: number;
    maxChunks?: number;
    modelOverrides?: RuntimeModelOverrides;
  }
): Promise<CoachKnowledgeChunk[]> {
  if (LOG_AI_STEPS) {
    console.log("[AI Step: Embedding + RAG] input queries:", queries);
  }

  if (queries.length === 0) {
    return [];
  }

  const { models } = resolveModels(options?.modelOverrides);
  const supabase = await createClient();
  const matchCount = options?.matchCount ?? 5;
  const matchThreshold = options?.matchThreshold ?? 0.45;
  const maxChunks = options?.maxChunks ?? 8;

  const results = await Promise.allSettled(
    queries.map(async (query, i) => {
      if (LOG_AI_STEPS) {
        console.log(`[AI Step: Embedding] input query ${i + 1}/${queries.length}:`, query);
      }
      const { embedding } = await embed({
        model: models.embedding,
        value: query,
      });
      if (LOG_AI_STEPS) {
        console.log(`[AI Step: Embedding] output: embedding computed (${embedding.length} dims)`);
      }

      const { data, error } = await supabase.rpc("match_knowledge_chunks", {
        query_embedding: embedding,
        match_count: matchCount,
        match_threshold: matchThreshold,
      });

      if (error) {
        console.warn("Knowledge retrieval RPC failed.", error.message);
        return [];
      }

      return Array.isArray(data) ? (data as MatchKnowledgeChunkRow[]) : [];
    })
  );

  const allRows: MatchKnowledgeChunkRow[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allRows.push(...result.value);
    } else {
      console.warn("Knowledge retrieval failed for a query.", result.reason);
    }
  }

  if (allRows.length === 0) {
    return [];
  }

  const dedupedById = new Map<number, CoachKnowledgeChunk>();

  for (const row of allRows) {
    const id = typeof row.id === "string" ? Number(row.id) : row.id;
    const existing = dedupedById.get(id);
    if (!existing || row.similarity > existing.similarity) {
      dedupedById.set(id, {
        id,
        content: row.content,
        source: row.source,
        category: row.category,
        similarity: row.similarity,
      });
    }
  }

  const chunks = Array.from(dedupedById.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxChunks);

  if (LOG_AI_STEPS) {
    console.log("[AI Step: RAG] output chunks:", chunks.length);
    chunks.forEach((c, i) => {
      console.log(
        `  [${i + 1}] id=${c.id} source=${c.source ?? "—"} category=${c.category ?? "—"} similarity=${c.similarity.toFixed(3)} content_preview=${c.content.slice(0, 120).replace(/\n/g, " ")}...`
      );
    });
  }

  return chunks;
}
