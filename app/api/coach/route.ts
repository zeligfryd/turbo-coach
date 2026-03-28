import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { loadCoachUserContext } from "@/lib/ai/context";
import { resolveModels } from "@/lib/ai/models";
import { buildCoachSystemPrompt } from "@/lib/ai/prompt";
import { generateSearchQueries, retrieveKnowledge } from "@/lib/ai/rag";
import { createCoachTools } from "@/lib/ai/tools";
import { extractMessageText, sanitizeModelOverrides } from "@/lib/ai/utils";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api/rate-limit";

/** Enabled in development only — logs AI step inputs/outputs to the server console. */
const LOG_AI_STEPS = process.env.NODE_ENV !== "production";


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

/** Build a system-prompt section from client-supplied race context. Returns null if invalid. */
const sanitizeRaceContext = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.name !== "string" || typeof obj.race_date !== "string") return null;

  const name = obj.name.slice(0, 200);
  const date = obj.race_date.slice(0, 10);
  const eventType = typeof obj.event_type === "string" ? obj.event_type.slice(0, 50) : "unknown";
  const distanceKm = typeof obj.distance_km === "number" ? obj.distance_km : null;
  const elevationM = typeof obj.elevation_m === "number" ? obj.elevation_m : null;
  const readiness = typeof obj.readiness_score === "number" ? obj.readiness_score : null;

  const lines = [
    `Current race context (the athlete is viewing this race):`,
    `- Race: ${name}`,
    `- Date: ${date}`,
    `- Type: ${eventType}`,
    ...(distanceKm != null ? [`- Distance: ${distanceKm} km`] : []),
    ...(elevationM != null ? [`- Elevation: ${Math.round(elevationM)} m`] : []),
    ...(readiness != null ? [`- Readiness score: ${readiness}/100`] : []),
  ];

  // Include route profile if present
  const routeSegments = Array.isArray(obj.route_segments) ? obj.route_segments : [];
  if (routeSegments.length > 0) {
    lines.push(`- Route profile:`);
    for (const seg of routeSegments.slice(0, 20)) {
      if (!seg || typeof seg !== "object") continue;
      const s = seg as Record<string, unknown>;
      const label = typeof s.label === "string" ? s.label : "Segment";
      const startKm = typeof s.startKm === "number" ? s.startKm : null;
      const endKm = typeof s.endKm === "number" ? s.endKm : null;
      const elevGain = typeof s.elevationGainM === "number" ? s.elevationGainM : null;
      const gradient = typeof s.avgGradientPercent === "number" ? s.avgGradientPercent : null;
      const type = typeof s.type === "string" ? s.type : null;

      const kmRange = startKm != null && endKm != null ? ` km ${startKm}–${endKm}` : "";
      const terrainParts = [
        type,
        elevGain != null ? `${Math.round(elevGain)}m gain` : null,
        gradient != null ? `avg ${gradient.toFixed(1)}%` : null,
      ].filter(Boolean).join(", ");
      lines.push(`  • ${label}${kmRange}: ${terrainParts}`);
    }
  }

  // Include full pacing plan if present
  const plan = obj.pacing_plan;
  if (plan && typeof plan === "object") {
    const p = plan as Record<string, unknown>;
    const npW = typeof p.overallTargetNpW === "number" ? p.overallTargetNpW : null;
    const finishMin = typeof p.estimatedFinishTimeMin === "number" ? p.estimatedFinishTimeMin : null;
    const strategy = typeof p.strategy === "string" ? p.strategy.slice(0, 1000) : null;

    lines.push(`- Pacing plan:`);
    if (npW != null) lines.push(`  - Overall target NP: ${npW} W`);
    if (finishMin != null) lines.push(`  - Estimated finish: ${Math.round(finishMin)} min`);
    if (strategy) lines.push(`  - Strategy: ${strategy}`);

    const segments = Array.isArray(p.segments) ? p.segments : [];
    if (segments.length > 0) {
      lines.push(`  - Segments:`);
      for (const seg of segments.slice(0, 20)) {
        if (!seg || typeof seg !== "object") continue;
        const s = seg as Record<string, unknown>;
        const label = typeof s.label === "string" ? s.label : "Segment";
        const startKm = typeof s.startKm === "number" ? s.startKm : null;
        const endKm = typeof s.endKm === "number" ? s.endKm : null;
        const powerW = typeof s.targetPowerW === "number" ? s.targetPowerW : null;
        const powerPct = typeof s.targetPowerPercent === "number" ? s.targetPowerPercent : null;
        const timeMin = typeof s.estimatedTimeMin === "number" ? s.estimatedTimeMin : null;
        const hrZone = typeof s.targetHrZone === "string" ? s.targetHrZone : null;
        const hrBpm = typeof s.targetHrBpm === "string" ? s.targetHrBpm : null;
        const advice = typeof s.advice === "string" ? s.advice.slice(0, 300) : null;

        const kmRange = startKm != null && endKm != null ? ` (km ${startKm}–${endKm})` : "";
        const power = powerW != null ? `${powerW}W` : "";
        const pct = powerPct != null ? ` (${powerPct}% FTP)` : "";
        const time = timeMin != null ? ` ~${Math.round(timeMin)}min` : "";
        const hr = hrBpm ? ` HR ${hrBpm}` : hrZone ? ` HR ${hrZone}` : "";
        lines.push(`    • ${label}${kmRange}: ${power}${pct}${time}${hr}${advice ? ` — ${advice}` : ""}`);
      }
    }
  }

  lines.push(`Use this context to provide specific, relevant advice about this race when the athlete asks.`);

  return lines.join("\n");
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

    const rateLimitResponse = await checkRateLimit(supabase, user.id, {
      key: "coach",
      windowSeconds: 60,
      maxRequests: 20,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const requestBody = (await request.json()) as {
      messages?: UIMessage[];
      modelOverrides?: unknown;
      ragEnabled?: unknown;
      raceContext?: unknown;
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

    const lastUserMessage = messages.findLast((message) => message.role === "user");
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

    const raceContextSection = sanitizeRaceContext(requestBody.raceContext);
    const systemPrompt = [
      baseSystemPrompt,
      ...(raceContextSection ? [raceContextSection] : []),
      ENFORCED_WORKOUT_TAG_RULES,
    ].join("\n\n");

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
      stopWhen: stepCountIs(5),
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
