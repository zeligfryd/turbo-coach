import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveModels,
  type ModelProvider,
  type RuntimeModelOverrides,
  type StepConfig,
} from "@/lib/ai/models";
import { createClient } from "@/lib/supabase/server";
import { BuilderItemSchema } from "@/lib/workouts/types";

const ExtractionRequestSchema = z.object({
  description: z.string().min(1),
  modelOverrides: z.unknown().optional(),
});

const WorkoutExtractionSchema = z.object({
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()).optional().default([]),
  intervals: z.array(BuilderItemSchema),
});

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

const buildExtractionPrompt = (description: string) => {
  return [
    "Convert the following cycling workout description into strict structured JSON.",
    "",
    "Rules:",
    "- Use FTP-based interval structure compatible with the app.",
    "- Allowed item types are interval and repeat groups.",
    "- For interval items, include durationSeconds and intensityPercentStart (and intensityPercentEnd only for ramps).",
    "- For repeat groups, include count and a non-empty intervals array.",
    "- Convert durations to seconds.",
    "- category should be one of: recovery, endurance, tempo, sweet_spot, threshold, vo2max, anaerobic, race_simulation, custom.",
    "- Include tags when clear from the description; otherwise return an empty array.",
    "- Return only the JSON object, no markdown or explanation.",
    "",
    "Workout description:",
    description,
  ].join("\n");
};

const parseJsonFromText = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Try fenced JSON output first.
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/);
  const fenced = fencedMatch?.[1]?.trim();
  if (fenced) {
    try {
      return JSON.parse(fenced);
    } catch {
      // Fallback to object boundaries below.
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const normalizeIntervalLikeItem = (item: unknown): unknown => {
  if (!isRecord(item)) {
    return item;
  }

  // Already in target BuilderItem interval shape.
  if (item.type === "interval" && isRecord(item.data)) {
    return item;
  }

  // Already in target BuilderItem repeat shape.
  if (item.type === "repeat" && isRecord(item.data)) {
    return item;
  }

  // Common LLM output: raw interval object.
  if ("durationSeconds" in item) {
    return {
      type: "interval",
      data: {
        name: typeof item.name === "string" ? item.name : undefined,
        durationSeconds: item.durationSeconds,
        intensityPercentStart: item.intensityPercentStart,
        intensityPercentEnd: item.intensityPercentEnd,
      },
    };
  }

  // Common LLM output: repeat-like object.
  if ("count" in item && Array.isArray(item.intervals)) {
    return {
      type: "repeat",
      data: {
        count: item.count,
        intervals: item.intervals.map((interval) =>
          isRecord(interval)
            ? {
                name: typeof interval.name === "string" ? interval.name : undefined,
                durationSeconds: interval.durationSeconds,
                intensityPercentStart: interval.intensityPercentStart,
                intensityPercentEnd: interval.intensityPercentEnd,
              }
            : interval
        ),
      },
    };
  }

  return item;
};

const normalizeExtractionCandidate = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return value;
  }

  // Some models return { workout: { ...fields } } instead of top-level fields.
  const source = isRecord(value.workout) ? value.workout : value;
  const intervals = Array.isArray(source.intervals) ? source.intervals : [];

  return {
    name: typeof source.name === "string" ? source.name : "Coach Workout",
    category: typeof source.category === "string" ? source.category : "custom",
    description:
      source.description == null
        ? null
        : typeof source.description === "string"
          ? source.description
          : String(source.description),
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    intervals: intervals.map((item) => normalizeIntervalLikeItem(item)),
  };
};

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

    const payload = ExtractionRequestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const isDev = process.env.NODE_ENV === "development";
    const modelOverrides = isDev ? sanitizeModelOverrides(payload.data.modelOverrides) : undefined;
    const { models } = resolveModels(modelOverrides);
    const prompt = buildExtractionPrompt(payload.data.description.trim());

    const result = await generateText({
      model: models.workoutExtraction,
      prompt,
    });
    const rawCandidate = parseJsonFromText(result.text);
    const normalizedCandidate = normalizeExtractionCandidate(rawCandidate);
    const parsed = WorkoutExtractionSchema.safeParse(normalizedCandidate);
    if (!parsed.success) {
      return NextResponse.json({ error: "Failed to parse extracted workout JSON" }, { status: 422 });
    }

    return NextResponse.json(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
