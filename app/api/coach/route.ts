import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { loadCoachUserContext } from "@/lib/ai/context";
import { resolveModels } from "@/lib/ai/models";
import { buildCoachSystemPrompt } from "@/lib/ai/prompt";
import { generateSearchQueries, retrieveKnowledge } from "@/lib/ai/rag";
import { createCoachTools } from "@/lib/ai/tools";
import { extractMessageText, sanitizeModelOverrides } from "@/lib/ai/utils";
import { createClient } from "@/lib/supabase/server";

/** Set to false to disable temporary AI step logging (inputs/outputs, excluding long system prompt). */
const LOG_AI_STEPS = true;


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
- Inside <workout> tags, use ONLY plain markdown (headings, bold, bullets, text). NEVER use XML/HTML tags like <name>, <category>, <interval>, <intervals>, or any other angle-bracket tags inside workout blocks.
- You may include prose, bullets, and markdown outside workout tags.
- The ONLY tags allowed in your entire response are <workout> and </workout>. No other angle-bracket tags anywhere.
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

    const tools = createCoachTools(user.id);

    const result = streamText({
      model: models.coaching,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(3),
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
