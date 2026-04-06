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

/**
 * Replace absolute watt values in the description with % FTP.
 * LLMs can't do arithmetic reliably, so we pre-compute the conversion
 * and rewrite the text so the LLM only needs to copy percentages.
 * "252W" → "80% FTP", "< 170W" → "< 54% FTP", "400W+" → "127%+ FTP"
 */
const rewriteWattsAsFtp = (description: string, ftp: number): string => {
  return description.replace(
    /(<\s*)?(\d+)\s*W(\+?)/gi,
    (_match, prefix, watts, plus) => {
      const pct = Math.round(parseInt(watts) / ftp * 100);
      return `${prefix ?? ""}${pct}%${plus} FTP`;
    },
  );
};

const buildExtractionPrompt = (description: string, ftp?: number) => {
  const processedDescription = ftp ? rewriteWattsAsFtp(description, ftp) : description;

  return [
    "Convert the following cycling workout description into strict structured JSON.",
    "",
    "Rules:",
    "- Every interval MUST be wrapped as: { \"type\": \"interval\", \"data\": { \"durationSeconds\": <number>, \"intensityPercentStart\": <number> } }",
    "- Repeat groups MUST be: { \"type\": \"repeat\", \"data\": { \"count\": <number>, \"intervals\": [ { \"durationSeconds\": <number>, \"intensityPercentStart\": <number> }, ... ] } }",
    "- intensityPercentStart is the % FTP number from the description. Copy it exactly.",
    "- Only include intensityPercentEnd when the text explicitly says ramp/progressive/build.",
    "- For range prescriptions like '105-120% FTP', use a constant interval at the midpoint (e.g. 113%).",
    "- Convert ALL durations to seconds (e.g. 10 min = 600, 30s = 30).",
    "- category: one of recovery, endurance, tempo, sweet_spot, threshold, vo2max, anaerobic, race_simulation, custom.",
    "- Return ONLY the JSON object, no markdown or explanation.",
    "",
    "Example output:",
    '{',
    '  "name": "Sweet Spot Intervals",',
    '  "category": "sweet_spot",',
    '  "description": "4x8min sweet spot with 4min recovery",',
    '  "tags": ["sweet_spot", "intervals"],',
    '  "intervals": [',
    '    { "type": "interval", "data": { "name": "Warmup", "durationSeconds": 600, "intensityPercentStart": 55 } },',
    '    { "type": "repeat", "data": { "count": 4, "intervals": [',
    '      { "name": "Sweet Spot", "durationSeconds": 480, "intensityPercentStart": 90 },',
    '      { "name": "Recovery", "durationSeconds": 240, "intensityPercentStart": 50 }',
    '    ] } },',
    '    { "type": "interval", "data": { "name": "Cooldown", "durationSeconds": 300, "intensityPercentStart": 50 } }',
    '  ]',
    '}',
    "",
    "Workout description:",
    processedDescription,
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

/**
 * Extract duration in seconds from an object, trying multiple field names.
 * LLMs often use "duration", "durationMinutes", "seconds", etc.
 */
const extractDurationSeconds = (item: Record<string, unknown>): number | undefined => {
  const ds = toNumber(item.durationSeconds) ?? toNumber(item.duration_seconds);
  if (ds != null) return ds;

  const dm = toNumber(item.durationMinutes) ?? toNumber(item.duration_minutes);
  if (dm != null) return dm * 60;

  const raw = item.duration;
  if (typeof raw === "number" && raw > 0) return raw;
  if (typeof raw === "string") {
    const m = raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?)$/i);
    if (m) {
      const v = parseFloat(m[1]);
      const u = m[2].toLowerCase();
      if (u.startsWith("h")) return v * 3600;
      if (u.startsWith("m")) return v * 60;
      return v;
    }
  }

  return toNumber(item.seconds) ?? toNumber(item.time) ?? undefined;
};

/**
 * Extract intensity % FTP from an object, trying multiple field names.
 */
const extractIntensityFields = (item: Record<string, unknown>) => {
  const start = toNumber(item.intensityPercentStart)
    ?? toNumber(item.intensity_percent_start)
    ?? toNumber(item.intensityPercent)
    ?? toNumber(item.intensity_percent)
    ?? toNumber(item.intensity)
    ?? toNumber(item.power_percent)
    ?? toNumber(item.powerPercent);
  const end = toNumber(item.intensityPercentEnd)
    ?? toNumber(item.intensity_percent_end);
  return { intensityPercentStart: start, intensityPercentEnd: end };
};

/**
 * Normalize a single inner interval (inside a repeat group) into WorkoutInterval shape.
 */
const normalizeInnerInterval = (interval: unknown): unknown => {
  if (!isRecord(interval)) return interval;
  const duration = extractDurationSeconds(interval);
  const { intensityPercentStart, intensityPercentEnd } = extractIntensityFields(interval);
  const normalizedIntensity = normalizeIntervalIntensity({
    name: interval.name,
    intensityPercentStart,
    intensityPercentEnd,
  });
  return {
    name: typeof interval.name === "string" ? interval.name : undefined,
    durationSeconds: duration,
    intensityPercentStart: normalizedIntensity.intensityPercentStart,
    intensityPercentEnd: normalizedIntensity.intensityPercentEnd,
  };
};

const normalizeIntervalLikeItem = (item: unknown): unknown => {
  if (!isRecord(item)) return item;

  // Already in correct format — pass through
  if (item.type === "interval" && isRecord(item.data)) return item;
  if (item.type === "repeat" && isRecord(item.data)) return item;

  // Interval: has a duration field (any naming variant) at top level
  const duration = extractDurationSeconds(item);
  if (duration !== undefined) {
    const { intensityPercentStart, intensityPercentEnd } = extractIntensityFields(item);
    const normalizedIntensity = normalizeIntervalIntensity({
      name: item.name,
      intensityPercentStart,
      intensityPercentEnd,
    });
    return {
      type: "interval",
      data: {
        name: typeof item.name === "string" ? item.name : undefined,
        durationSeconds: duration,
        intensityPercentStart: normalizedIntensity.intensityPercentStart,
        intensityPercentEnd: normalizedIntensity.intensityPercentEnd,
      },
    };
  }

  // Repeat group: has count + intervals/steps array
  const count = toNumber(item.count) ?? toNumber(item.repeat) ?? toNumber(item.repeats);
  const innerArray = Array.isArray(item.intervals) ? item.intervals
    : Array.isArray(item.steps) ? item.steps
    : null;
  if (count != null && innerArray) {
    return {
      type: "repeat",
      data: {
        count,
        intervals: innerArray.map(normalizeInnerInterval),
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
  ftp?: number,
): Promise<ExtractedWorkout> {
  const { models } = resolveModels(modelOverrides);
  const prompt = buildExtractionPrompt(description.trim(), ftp);

  const result = await generateText({
    model: models.workoutExtraction,
    prompt,
  });

  const rawCandidate = parseJsonFromText(result.text);

  if (rawCandidate === null) {
    throw new Error(
      "Could not extract a workout from the provided text. " +
      "Make sure the description includes workout intervals with durations and intensities."
    );
  }

  const normalizedCandidate = normalizeExtractionCandidate(rawCandidate);
  const parsed = WorkoutExtractionSchema.safeParse(normalizedCandidate);

  if (!parsed.success) {
    console.error("Workout extraction validation errors:", parsed.error.issues);
    throw new Error(
      "Failed to parse workout structure. The description may not contain enough detail " +
      "to build a workout (needs intervals with durations and power targets)."
    );
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
