import { generateText } from "ai";
import { z } from "zod";
import { resolveModels, type RuntimeModelOverrides } from "@/lib/ai/models";
import { BuilderItemSchema } from "@/lib/workouts/types";
import type { BuilderItem } from "@/lib/workouts/types";

// ── Schemas ──────────────────────────────────────────────────────────

const WorkoutExtractionSchema = z.object({
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()).optional().default([]),
  intervals: z.array(BuilderItemSchema),
});

export type ExtractedWorkout = z.infer<typeof WorkoutExtractionSchema>;

// ── Prompt ───────────────────────────────────────────────────────────

const buildExtractionPrompt = (description: string) => {
  return [
    "Convert the following cycling workout description into strict structured JSON.",
    "",
    "Rules:",
    "- Use FTP-based interval structure compatible with the app.",
    "- Allowed item types are interval and repeat groups.",
    "- For interval items, include durationSeconds and intensityPercentStart (and intensityPercentEnd only for ramps).",
    "- For range prescriptions like '105-120% FTP', use a constant interval at the midpoint (e.g. 113%) unless the text explicitly says ramp/progressive/from-to.",
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

// ── JSON parsing helpers ─────────────────────────────────────────────

const parseJsonFromText = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return null;

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

// ── Normalization helpers ────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const RAMP_KEYWORDS = /\b(ramp|progressive|build(?:ing)?|increase|decrease|from\s+\d+.*to\s+\d+)\b/i;

const toNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const normalizeIntervalIntensity = (interval: {
  name?: unknown;
  intensityPercentStart?: unknown;
  intensityPercentEnd?: unknown;
}) => {
  const start = toNumber(interval.intensityPercentStart);
  const end = toNumber(interval.intensityPercentEnd);
  const name = typeof interval.name === "string" ? interval.name : "";

  if (start === null) {
    return {
      intensityPercentStart: interval.intensityPercentStart,
      intensityPercentEnd: interval.intensityPercentEnd,
    };
  }

  if (end === null || end === start) {
    return { intensityPercentStart: start, intensityPercentEnd: undefined };
  }

  // Most coach-prescribed ranges like "105-120% FTP" mean a steady target zone.
  // Keep true ramps only when the interval text explicitly indicates ramp behavior.
  if (!RAMP_KEYWORDS.test(name)) {
    return {
      intensityPercentStart: Math.round((start + end) / 2),
      intensityPercentEnd: undefined,
    };
  }

  return { intensityPercentStart: start, intensityPercentEnd: end };
};

const normalizeIntervalLikeItem = (item: unknown): unknown => {
  if (!isRecord(item)) return item;

  if (item.type === "interval" && isRecord(item.data)) return item;
  if (item.type === "repeat" && isRecord(item.data)) return item;

  // Common LLM output: raw interval object.
  if ("durationSeconds" in item) {
    const normalizedIntensity = normalizeIntervalIntensity(item);
    return {
      type: "interval",
      data: {
        name: typeof item.name === "string" ? item.name : undefined,
        durationSeconds: item.durationSeconds,
        intensityPercentStart: normalizedIntensity.intensityPercentStart,
        intensityPercentEnd: normalizedIntensity.intensityPercentEnd,
      },
    };
  }

  // Common LLM output: repeat-like object.
  if ("count" in item && Array.isArray(item.intervals)) {
    return {
      type: "repeat",
      data: {
        count: item.count,
        intervals: item.intervals.map((interval) => {
          if (!isRecord(interval)) return interval;
          const normalizedIntensity = normalizeIntervalIntensity(interval);
          return {
            name: typeof interval.name === "string" ? interval.name : undefined,
            durationSeconds: interval.durationSeconds,
            intensityPercentStart: normalizedIntensity.intensityPercentStart,
            intensityPercentEnd: normalizedIntensity.intensityPercentEnd,
          };
        }),
      },
    };
  }

  return item;
};

const collectIntervalCandidates = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectIntervalCandidates(entry));
  }
  if (!isRecord(value)) return [];

  if (
    ("durationSeconds" in value && typeof value.durationSeconds === "number") ||
    ("count" in value && Array.isArray(value.intervals)) ||
    value.type === "interval" ||
    value.type === "repeat"
  ) {
    return [value];
  }

  return Object.values(value).flatMap((entry) => collectIntervalCandidates(entry));
};

const normalizeExtractionCandidate = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  const source = isRecord(value.workout) ? value.workout : value;
  const directIntervals = Array.isArray(source.intervals) ? source.intervals : [];
  const fallbackIntervals = directIntervals.length > 0 ? [] : collectIntervalCandidates(source);
  const intervals = directIntervals.length > 0 ? directIntervals : fallbackIntervals;

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

// ── Public API ───────────────────────────────────────────────────────

/**
 * Extract a structured workout from a free-text description using the workoutExtraction model.
 * Shared by the extract-workout API route and the createWorkout coach tool.
 */
export async function extractWorkoutFromDescription(
  description: string,
  modelOverrides?: RuntimeModelOverrides,
): Promise<ExtractedWorkout> {
  const { models } = resolveModels(modelOverrides);
  const prompt = buildExtractionPrompt(description.trim());

  const result = await generateText({
    model: models.workoutExtraction,
    prompt,
  });

  const rawCandidate = parseJsonFromText(result.text);
  const normalizedCandidate = normalizeExtractionCandidate(rawCandidate);
  const parsed = WorkoutExtractionSchema.safeParse(normalizedCandidate);

  if (!parsed.success) {
    throw new Error("Failed to parse extracted workout JSON");
  }

  return parsed.data;
}

/**
 * Extract only the intervals (BuilderItem[]) from a workout description.
 * Convenience wrapper used by the createWorkout tool.
 */
export async function parseWorkoutDescription(
  description: string,
): Promise<{ intervals: BuilderItem[] } | { error: string }> {
  try {
    const result = await extractWorkoutFromDescription(description);
    return { intervals: result.intervals };
  } catch (error) {
    console.error("Workout parsing failed:", error);
    return {
      error: `Failed to parse workout description: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
