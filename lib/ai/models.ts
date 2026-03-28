import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

export type ModelProvider = "openai" | "anthropic" | "ollama";
export type ModelStep = "queryGeneration" | "embedding" | "coaching" | "workoutExtraction" | "memoryExtraction";

export type StepConfig = {
  provider: ModelProvider;
  model: string;
};

export type ModelsConfig = Record<ModelStep, StepConfig>;
export type RuntimeModelOverrides = Partial<Record<ModelStep, Partial<StepConfig>>>;

const DEFAULT_CONFIG: ModelsConfig = {
  queryGeneration: {
    provider: "ollama",
    model: "qwen2.5:14b-instruct",
  },
  embedding: {
    // Anthropic has no embeddings API — this must stay on OpenAI
    provider: "openai",
    model: "text-embedding-3-small",
  },
  coaching: {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
  },
  workoutExtraction: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
  },
  memoryExtraction: {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
  },
};

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ollama = createOpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
});

const readStepConfig = (step: ModelStep): StepConfig => {
  const provider = process.env[`AI_${step.toUpperCase()}_PROVIDER`] as ModelProvider | undefined;
  const model = process.env[`AI_${step.toUpperCase()}_MODEL`];

  return {
    provider: provider ?? DEFAULT_CONFIG[step].provider,
    model: model ?? DEFAULT_CONFIG[step].model,
  };
};

const resolveStepConfig = (
  step: ModelStep,
  overrides?: RuntimeModelOverrides
): StepConfig => {
  const envConfig = readStepConfig(step);
  const override = overrides?.[step];

  return {
    provider: override?.provider ?? envConfig.provider,
    model: override?.model ?? envConfig.model,
  };
};

const getLanguageModel = (config: StepConfig) => {
  if (config.provider === "anthropic") return anthropic(config.model);
  // Ollama's OpenAI-compatible API works reliably with chat/completions semantics.
  // Using chat() here avoids Responses API metadata validation mismatches.
  if (config.provider === "ollama") return ollama.chat(config.model);
  return openai(config.model);
};

const getEmbeddingModel = (config: StepConfig) => {
  return config.provider === "ollama"
    ? ollama.textEmbeddingModel(config.model)
    : openai.textEmbeddingModel(config.model);
};

export const getModelConfig = (overrides?: RuntimeModelOverrides): ModelsConfig => {
  return {
    queryGeneration: resolveStepConfig("queryGeneration", overrides),
    embedding: resolveStepConfig("embedding", overrides),
    coaching: resolveStepConfig("coaching", overrides),
    workoutExtraction: resolveStepConfig("workoutExtraction", overrides),
    memoryExtraction: resolveStepConfig("memoryExtraction", overrides),
  };
};

export const resolveModels = (overrides?: RuntimeModelOverrides) => {
  const config = getModelConfig(overrides);
  return {
    models: {
      queryGeneration: getLanguageModel(config.queryGeneration),
      embedding: getEmbeddingModel(config.embedding),
      coaching: getLanguageModel(config.coaching),
      workoutExtraction: getLanguageModel(config.workoutExtraction),
      memoryExtraction: getLanguageModel(config.memoryExtraction),
    },
    config,
  };
};
