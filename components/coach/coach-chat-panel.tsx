"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Loader2, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  COACH_STORAGE_KEYS,
  clearCoachMessages,
  readCoachMessages,
  readStorage,
  writeCoachMessages,
  writeStorage,
} from "@/lib/coach/persistence";
import type { RuntimeModelOverrides } from "@/lib/ai/models";

const SUGGESTIONS = [
  "Analyse my last week of training and highlight what I should improve.",
  "Please analyse my HR in today's workout.",
  "What should I focus on in my next 7 days based on my schedule?",
];

const IS_DEV = process.env.NODE_ENV === "development";

type OverrideStep = "queryGeneration" | "embedding" | "coaching";
type Provider = "openai" | "ollama";
type DevRagSettings = {
  useDefault: boolean;
  enabled: boolean;
};

type DevModelOverrides = RuntimeModelOverrides;

const DEFAULT_OVERRIDES: DevModelOverrides = {
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
};

const DEFAULT_RAG_SETTINGS: DevRagSettings = {
  useDefault: true,
  enabled: true,
};

const sanitizeStep = (step: unknown): { provider: Provider; model: string } | null => {
  if (!step || typeof step !== "object") {
    return null;
  }

  const raw = step as { provider?: unknown; model?: unknown };
  if ((raw.provider !== "openai" && raw.provider !== "ollama") || typeof raw.model !== "string") {
    return null;
  }

  const model = raw.model.trim();
  if (!model) {
    return null;
  }

  return {
    provider: raw.provider,
    model,
  };
};

const sanitizeOverrides = (value: unknown): DevModelOverrides => {
  if (!value || typeof value !== "object") {
    return DEFAULT_OVERRIDES;
  }

  const raw = value as Record<string, unknown>;
  const queryGeneration = sanitizeStep(raw.queryGeneration) ?? DEFAULT_OVERRIDES.queryGeneration!;
  const embedding = sanitizeStep(raw.embedding) ?? DEFAULT_OVERRIDES.embedding!;
  const coaching = sanitizeStep(raw.coaching) ?? DEFAULT_OVERRIDES.coaching!;

  return {
    queryGeneration,
    embedding,
    coaching,
  };
};

const getMessageText = (message: UIMessage) => {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  const parts = (message as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) {
    return "";
  }

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
};

export const useCoachChatController = (options?: { persistMessages?: boolean }) => {
  const persistMessages = options?.persistMessages ?? true;
  const [input, setInput] = useState("");
  const [didHydrateMessages, setDidHydrateMessages] = useState(false);
  const [devOverrides, setDevOverrides] = useState<DevModelOverrides>(DEFAULT_OVERRIDES);
  const [devRagSettings, setDevRagSettings] = useState<DevRagSettings>(DEFAULT_RAG_SETTINGS);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/coach",
        body: IS_DEV
          ? {
              modelOverrides: devOverrides,
              ...(devRagSettings.useDefault
                ? {}
                : {
                    ragEnabled: devRagSettings.enabled,
                  }),
            }
          : undefined,
      }),
    [devOverrides, devRagSettings]
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });

  const isGenerating = useMemo(
    () => status === "submitted" || status === "streaming",
    [status]
  );

  useEffect(() => {
    if (!IS_DEV) {
      return;
    }
    const saved = readStorage<DevModelOverrides>(COACH_STORAGE_KEYS.devModelOverrides, DEFAULT_OVERRIDES);
    setDevOverrides(sanitizeOverrides(saved));
    const savedRagSetting = readStorage<unknown>(COACH_STORAGE_KEYS.devRagMode, DEFAULT_RAG_SETTINGS);
    // Backward compatibility for previous persisted string mode values.
    if (typeof savedRagSetting === "string") {
      if (savedRagSetting === "inherit") {
        setDevRagSettings({ useDefault: true, enabled: true });
      } else if (savedRagSetting === "enabled") {
        setDevRagSettings({ useDefault: false, enabled: true });
      } else if (savedRagSetting === "disabled") {
        setDevRagSettings({ useDefault: false, enabled: false });
      }
    } else if (
      savedRagSetting &&
      typeof savedRagSetting === "object" &&
      "useDefault" in savedRagSetting &&
      "enabled" in savedRagSetting &&
      typeof (savedRagSetting as { useDefault: unknown }).useDefault === "boolean" &&
      typeof (savedRagSetting as { enabled: unknown }).enabled === "boolean"
    ) {
      setDevRagSettings(savedRagSetting as DevRagSettings);
    } else {
      setDevRagSettings(DEFAULT_RAG_SETTINGS);
    }
  }, []);

  useEffect(() => {
    if (!IS_DEV) {
      return;
    }
    writeStorage(COACH_STORAGE_KEYS.devModelOverrides, devOverrides);
  }, [devOverrides]);

  useEffect(() => {
    if (!IS_DEV) {
      return;
    }
    writeStorage(COACH_STORAGE_KEYS.devRagMode, devRagSettings);
  }, [devRagSettings]);

  useEffect(() => {
    if (!persistMessages) {
      setDidHydrateMessages(true);
      return;
    }
    const persisted = readCoachMessages();
    if (persisted.length > 0) {
      setMessages(persisted);
    }
    setDidHydrateMessages(true);
  }, [persistMessages, setMessages]);

  useEffect(() => {
    if (!persistMessages || !didHydrateMessages) {
      return;
    }
    writeCoachMessages(messages);
  }, [didHydrateMessages, messages, persistMessages]);

  const updateProvider = (step: OverrideStep, provider: Provider) => {
    setDevOverrides((prev) => ({
      ...prev,
      [step]: {
        provider,
        model: prev[step]?.model ?? "",
      },
    }));
  };

  const updateModel = (step: OverrideStep, model: string) => {
    setDevOverrides((prev) => ({
      ...prev,
      [step]: {
        provider: prev[step]?.provider ?? "openai",
        model,
      },
    }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isGenerating) {
      return;
    }

    setInput("");
    await sendMessage({ text });
  };

  const sendSuggestion = async (text: string) => {
    if (isGenerating) {
      return;
    }
    await sendMessage({ text });
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    if (persistMessages) {
      clearCoachMessages();
    }
  };

  return {
    input,
    setInput,
    messages,
    status,
    error,
    isGenerating,
    devOverrides,
    devRagSettings,
    setDevRagSettings,
    updateProvider,
    updateModel,
    onSubmit,
    sendSuggestion,
    clearChat,
  };
};

type CoachChatController = ReturnType<typeof useCoachChatController>;

export function CoachChatPanel({ controller, className }: { controller: CoachChatController; className?: string }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className={cn("h-full flex flex-col", className)}>
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {IS_DEV && (
          <>
            <div className="max-w-4xl mx-auto mb-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen(true)}
                aria-label="Open developer coach settings"
                title="Developer coach settings"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Developer coach settings</DialogTitle>
                  <DialogDescription>
                    Override model providers/models and toggle RAG behavior for local testing.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">RAG mode</Label>
                    <div className="rounded-md border p-3">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="rag-enabled"
                            checked={controller.devRagSettings.enabled}
                            disabled={controller.devRagSettings.useDefault}
                            onCheckedChange={(checked) =>
                              controller.setDevRagSettings((prev) => ({
                                ...prev,
                                enabled: checked,
                              }))
                            }
                          />
                          <Label htmlFor="rag-enabled" className="text-sm font-normal">
                            RAG
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="rag-default"
                            checked={controller.devRagSettings.useDefault}
                            onCheckedChange={(checked) =>
                              controller.setDevRagSettings((prev) => ({
                                useDefault: checked === true,
                                enabled: checked === true ? DEFAULT_RAG_SETTINGS.enabled : prev.enabled,
                              }))
                            }
                          />
                          <Label htmlFor="rag-default" className="text-sm font-normal cursor-pointer">
                            default
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(["queryGeneration", "embedding", "coaching"] as const).map((step) => (
                      <div key={step} className="space-y-2">
                        <Label className="text-xs capitalize">{step}</Label>
                        <Select
                          value={controller.devOverrides[step]?.provider ?? "openai"}
                          onValueChange={(value) => controller.updateProvider(step, value as Provider)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">openai</SelectItem>
                            <SelectItem value="ollama">ollama</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={controller.devOverrides[step]?.model ?? ""}
                          onChange={(event) => controller.updateModel(step, event.target.value)}
                          placeholder="Model name"
                          className="h-8"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {controller.messages.length === 0 && (
          <div className="max-w-3xl mx-auto mt-8">
            <h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
            <p className="text-muted-foreground mt-2">
              Ask training questions and get advice grounded in your profile, schedule, and
              knowledge base.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="outline"
                  className="h-auto py-2 px-3 text-left whitespace-normal"
                  onClick={() => controller.sendSuggestion(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {controller.messages.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-4 pb-8">
            {controller.messages.map((message) => {
              const text = getMessageText(message);
              const isUser = message.role === "user";

              return (
                <div key={message.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-sm",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground border border-border"
                    )}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{text}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {controller.isGenerating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Coach is thinking...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t bg-background px-4 py-4 sm:px-6">
        <form onSubmit={controller.onSubmit} className="max-w-4xl mx-auto flex gap-2">
          <Input
            value={controller.input}
            onChange={(event) => controller.setInput(event.target.value)}
            placeholder="Ask your coach anything about your training..."
            disabled={controller.isGenerating}
          />
          <Button type="submit" disabled={controller.isGenerating || controller.input.trim().length === 0}>
            {controller.isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        {controller.error && (
          <p className="max-w-4xl mx-auto mt-2 text-sm text-red-600">{controller.error.message}</p>
        )}
      </div>
    </div>
  );
}
