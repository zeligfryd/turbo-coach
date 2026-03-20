import type { ModelProvider, RuntimeModelOverrides, StepConfig } from "@/lib/ai/models";

/**
 * Extract plain text from a message object that may have `content` (string)
 * or `parts` (array of objects with `text` fields).
 * Works with UIMessage from ai-sdk as well as serialized message objects.
 */
export const extractMessageText = (
  message: { content?: unknown; parts?: unknown }
): string => {
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return message.content;
  }

  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part: unknown) => {
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
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

/**
 * Sanitize an untrusted model-overrides payload from a client request body.
 */
export const sanitizeModelOverrides = (value: unknown): RuntimeModelOverrides | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const overrides: RuntimeModelOverrides = {};

  const queryGeneration = toStepOverride(raw.queryGeneration);
  const embedding = toStepOverride(raw.embedding);
  const coaching = toStepOverride(raw.coaching);
  const workoutExtraction = toStepOverride(raw.workoutExtraction);

  if (queryGeneration) overrides.queryGeneration = queryGeneration;
  if (embedding) overrides.embedding = embedding;
  if (coaching) overrides.coaching = coaching;
  if (workoutExtraction) overrides.workoutExtraction = workoutExtraction;

  return Object.keys(overrides).length > 0 ? overrides : undefined;
};
