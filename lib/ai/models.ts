import { createOpenAI } from "@ai-sdk/openai";

export type ModelProvider = "openai" | "ollama";
export type ModelStep = "queryGeneration" | "embedding" | "coaching" | "workoutExtraction";

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
    provider: "openai",
    model: "text-embedding-3-small",
  },
  coaching: {
    provider: "openai",
    model: "gpt-4o-mini",
  },
  workoutExtraction: {
    provider: "openai",
    model: "gpt-4o-mini",
  },
};

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
  // Ollama's OpenAI-compatible API works reliably with chat/completions semantics.
  // Using chat() here avoids Responses API metadata validation mismatches.
  return config.provider === "ollama" ? ollama.chat(config.model) : openai(config.model);
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
    },
    config,
  };
};

export const modelConfig = getModelConfig();
