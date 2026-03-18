import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { loadCoachUserContext } from "@/lib/ai/context";
import {
  resolveModels,
  type ModelProvider,
  type RuntimeModelOverrides,
  type StepConfig,
} from "@/lib/ai/models";
import { buildCoachSystemPrompt } from "@/lib/ai/prompt";
import { generateSearchQueries, retrieveKnowledge } from "@/lib/ai/rag";
import { createClient } from "@/lib/supabase/server";

/** Set to false to disable temporary AI step logging (inputs/outputs, excluding long system prompt). */
const LOG_AI_STEPS = true;

const extractMessageText = (message: UIMessage): string => {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }

  const parts = (message as { parts?: unknown }).parts;
  if (Array.isArray(parts)) {
    return parts
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
};

const isModelProvider = (value: unknown): value is ModelProvider => {
  return value === "openai" || value === "ollama";
};

const toStepOverride = (value: unknown): Partial<StepConfig> | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as { provider?: unknown; model?: unknown };
  const override: Partial<StepConfig> = {};

  if (isModelProvider(raw.provider)) {
    override.provider = raw.provider;
  }
  if (typeof raw.model === "string" && raw.model.trim().length > 0) {
    override.model = raw.model.trim();
  }

  return Object.keys(override).length > 0 ? override : undefined;
};

const sanitizeModelOverrides = (value: unknown): RuntimeModelOverrides | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const overrides: RuntimeModelOverrides = {};

  const queryGeneration = toStepOverride(raw.queryGeneration);
  const embedding = toStepOverride(raw.embedding);
  const coaching = toStepOverride(raw.coaching);
  const workoutExtraction = toStepOverride(raw.workoutExtraction);

  if (queryGeneration) {
    overrides.queryGeneration = queryGeneration;
  }
  if (embedding) {
    overrides.embedding = embedding;
  }
  if (coaching) {
    overrides.coaching = coaching;
  }
  if (workoutExtraction) {
    overrides.workoutExtraction = workoutExtraction;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  if (value == null) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const sanitizeBoolean = (value: unknown): boolean | undefined => {
  return typeof value === "boolean" ? value : undefined;
};

const ENFORCED_WORKOUT_TAG_RULES = `
CRITICAL OUTPUT FORMAT RULES:
- If your answer includes any concrete workout prescription (single workout OR weekly/day-by-day plan with intervals/intensities), you MUST wrap each prescribed workout block in <workout>...</workout>.
- This includes "Day 1 / Day 2" schedules, interval prescriptions, and any executable session details.
- You may include prose, bullets, and markdown outside workout tags.
- Do NOT use any XML/HTML-like tags other than <workout> and </workout>.
- Never omit tags for concrete workouts.
`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const requestBody = (await request.json()) as {
      messages?: UIMessage[];
      modelOverrides?: unknown;
      ragEnabled?: unknown;
    };
    const { messages } = requestBody;
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const isDev = process.env.NODE_ENV === "development";
    const modelOverrides = isDev ? sanitizeModelOverrides(requestBody.modelOverrides) : undefined;
    const ragEnabledOverride = isDev ? sanitizeBoolean(requestBody.ragEnabled) : undefined;
    const ragEnabledByEnv = parseBooleanEnv(process.env.COACH_RAG_ENABLED, true);
    const isRagEnabled = ragEnabledOverride ?? ragEnabledByEnv;
    const { models } = resolveModels(modelOverrides);

    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    const userMessageText = lastUserMessage ? extractMessageText(lastUserMessage) : "";

    const userContext = await loadCoachUserContext(user.id);
    let ragChunks: Awaited<ReturnType<typeof retrieveKnowledge>> = [];
    if (isRagEnabled) {
      const searchQueries = await generateSearchQueries(userMessageText, userContext, modelOverrides);
      ragChunks = await retrieveKnowledge(searchQueries, { modelOverrides });
    }
    const baseSystemPrompt = buildCoachSystemPrompt({
      userContext,
      ragChunks,
    });
    const systemPrompt = [baseSystemPrompt, ENFORCED_WORKOUT_TAG_RULES].join("\n\n");

    const modelMessages = await convertToModelMessages(messages);

    if (LOG_AI_STEPS) {
      console.log("[AI Config] RAG", {
        env: ragEnabledByEnv,
        override: ragEnabledOverride,
        effective: isRagEnabled,
      });
      console.log("[AI Step: Coaching] input messages (conversation only, no system):", {
        count: modelMessages.length,
        messages: modelMessages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : Array.isArray(m.content)
                ? m.content.map((p) => (typeof p === "string" ? p : (p as { type: string; text?: string }).text ?? "")).join("")
                : String(m.content),
        })),
      });
    }

    const result = streamText({
      model: models.coaching,
      system: systemPrompt,
      messages: modelMessages,
    });

    if (LOG_AI_STEPS) {
      result.text.then((text) => {
        console.log("[AI Step: Coaching] output (full response):", text);
      });
    }

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
