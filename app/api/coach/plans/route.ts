import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { resolveModels } from "@/lib/ai/models";
import { buildPlanCoachSystemPrompt } from "@/lib/ai/plan-prompt";
import { createPlanCoachTools } from "@/lib/ai/plan-tools";
import { createPlanReadTools } from "@/lib/ai/plan-read-tools";
import { sanitizeModelOverrides } from "@/lib/ai/utils";
import { getPlan, listArchetypes, savePlanCoachConversation } from "@/app/plans/actions";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { loadRiderSnapshot } from "@/lib/plans/rider-snapshot";

const LOG_AI_STEPS = process.env.NODE_ENV !== "production";

const MAX_HISTORY = 20;
const TOOL_RESULT_TRUNCATE = 200;

// Tool outputs that always look like `{ success: true, ... }`. We don't need
// to keep their payload in-context once they've fired — the mutation is
// already reflected in the plan tree embedded in the system prompt.
const SUCCESS_STUB_TOOLS = new Set([
  "addBlock",
  "updateBlock",
  "deleteBlock",
  "addWeek",
  "updateWeek",
  "deleteWeek",
  "duplicateWeek",
  "swapWeeks",
  "insertRecoveryWeek",
  "setDayNotes",
  "addDayItem",
  "updateDayItem",
  "deleteDayItem",
  "updatePlanMetadata",
  "proposeBlockStructure",
  "fillBlockSkeleton",
]);

function compactMessages(messages: UIMessage[]): UIMessage[] {
  const trimmed =
    messages.length > MAX_HISTORY ? messages.slice(-MAX_HISTORY) : messages;
  return trimmed.map((msg) => {
    if (!msg.parts) return msg;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compactedParts = (msg.parts as any[]).map((part: any) => {
      const partType = part.type as string;
      if (!partType.startsWith("tool-") && partType !== "dynamic-tool") return part;
      if (part.state !== "output-available" || part.output == null) return part;
      const toolName = part.toolName ?? partType.replace("tool-", "");
      // Successful mutations collapse to a single-word stub — the plan tree
      // in the system prompt already shows the result.
      if (
        SUCCESS_STUB_TOOLS.has(toolName) &&
        typeof part.output === "object" &&
        part.output !== null &&
        (part.output as { success?: boolean }).success === true
      ) {
        return { ...part, output: "ok" };
      }
      const outputStr =
        typeof part.output === "string" ? part.output : JSON.stringify(part.output);
      if (outputStr.length <= TOOL_RESULT_TRUNCATE) return part;
      return { ...part, output: `[${toolName}: ${outputStr.length} chars — truncated]` };
    });
    return { ...msg, parts: compactedParts };
  });
}

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

    const rateLimitResponse = await checkRateLimit(supabase, user.id, {
      key: "coach-plans",
      windowSeconds: 60,
      maxRequests: 20,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json()) as {
      messages?: UIMessage[];
      modelOverrides?: unknown;
      planId?: unknown;
    };

    const planId = typeof body.planId === "string" ? body.planId : null;
    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }
    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    // Ownership check: getPlan() fails if the plan isn't owned by the user.
    const [planResult, archetypeResult] = await Promise.all([
      getPlan(planId),
      listArchetypes(),
    ]);
    if (!planResult.success || !planResult.plan) {
      return NextResponse.json(
        { error: planResult.error ?? "Plan not found" },
        { status: 404 },
      );
    }

    const modelOverrides = sanitizeModelOverrides(body.modelOverrides);
    const { models } = resolveModels(modelOverrides);

    const today = new Date().toISOString().slice(0, 10);
    const rider = await loadRiderSnapshot(supabase, user.id, planResult.plan, today);
    const systemPrompt = buildPlanCoachSystemPrompt({
      plan: planResult.plan,
      archetypes: archetypeResult.success ? archetypeResult.archetypes : [],
      today,
      rider,
    });

    const modelMessages = await convertToModelMessages(compactMessages(body.messages));
    const tools = {
      ...createPlanCoachTools(planId),
      ...createPlanReadTools(user.id),
    };

    if (LOG_AI_STEPS) {
      console.log("[AI Step: Plan Coach] input", {
        planId,
        count: modelMessages.length,
      });
    }

    const result = streamText({
      model: models.coaching,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      maxRetries: 1,
      stopWhen: stepCountIs(8),
      onError: ({ error }) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn("[Plan Coach] stream error:", msg);
      },
      onFinish: () => {
        // Refresh the plan editor so tool-driven mutations surface immediately.
        revalidatePath(`/plans/${planId}`);
      },
    });

    if (LOG_AI_STEPS) {
      result.text.then((text) => {
        console.log("[AI Step: Plan Coach] output:", text.slice(0, 400));
      });
    }

    return result.toUIMessageStreamResponse({
      originalMessages: body.messages,
      onFinish: async ({ messages }) => {
        try {
          await savePlanCoachConversation(planId, messages);
        } catch (err) {
          console.warn("[Plan Coach] persist failed:", err);
        }
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const isRateLimit = message.includes("rate limit") || message.includes("429");
    if (isRateLimit) {
      return NextResponse.json(
        { error: "Plan coach is busy — try again in a moment." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
