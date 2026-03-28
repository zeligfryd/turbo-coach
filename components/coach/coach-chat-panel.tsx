"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { CalendarPlus, Check, Cog, Database, Loader2, Send, X } from "lucide-react";
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
  readCoachMessages,
  readStorage,
  removeCoachMessagesKey,
  writeStorage,
} from "@/lib/coach/persistence";
import {
  createAndScheduleCoachWorkout,
  createConversation,
  getConversation,
  saveConversationMessages,
  triggerMemoryExtraction,
} from "@/app/coach/actions";
import { extractMessageText } from "@/lib/ai/utils";
import type { RuntimeModelOverrides } from "@/lib/ai/models";

const SUGGESTIONS = [
  "Analyse my last week of training and highlight what I should improve.",
  "Please analyse my HR in today's workout.",
  "What should I focus on in my next 7 days based on my schedule?",
];

const IS_DEV = process.env.NODE_ENV === "development";

type OverrideStep = "queryGeneration" | "embedding" | "coaching" | "workoutExtraction";
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
    model: "gpt-5.4-mini",
  },
  workoutExtraction: {
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
  const workoutExtraction = sanitizeStep(raw.workoutExtraction) ?? DEFAULT_OVERRIDES.workoutExtraction!;

  return {
    queryGeneration,
    embedding,
    coaching,
    workoutExtraction,
  };
};

const getMessageText = (message: UIMessage) => extractMessageText(message);

type MessageSegment =
  | { type: "text"; content: string }
  | { type: "workout"; content: string; isClosed: boolean };

const OPEN_WORKOUT_TAG = "<workout>";
const CLOSE_WORKOUT_TAG = "</workout>";

const stripTrailingPartialWorkoutTag = (text: string): string => {
  if (!text) {
    return text;
  }

  for (const tag of [OPEN_WORKOUT_TAG, CLOSE_WORKOUT_TAG]) {
    for (let i = 1; i < tag.length; i += 1) {
      const partial = tag.slice(0, i);
      if (text.endsWith(partial)) {
        return text.slice(0, -i);
      }
    }
  }

  return text;
};

const parseMessageSegments = (text: string): MessageSegment[] => {
  const safeText = stripTrailingPartialWorkoutTag(text);
  if (!safeText) {
    return [{ type: "text", content: "" }];
  }

  const segments: MessageSegment[] = [];
  let buffer = "";
  let cursor = 0;
  let inWorkout = false;

  while (cursor < safeText.length) {
    if (!inWorkout && safeText.startsWith(OPEN_WORKOUT_TAG, cursor)) {
      if (buffer.length > 0) {
        segments.push({ type: "text", content: buffer });
      }
      buffer = "";
      inWorkout = true;
      cursor += OPEN_WORKOUT_TAG.length;
      continue;
    }

    if (inWorkout && safeText.startsWith(CLOSE_WORKOUT_TAG, cursor)) {
      segments.push({
        type: "workout",
        content: buffer.trim(),
        isClosed: true,
      });
      buffer = "";
      inWorkout = false;
      cursor += CLOSE_WORKOUT_TAG.length;
      continue;
    }

    // Hide malformed closing tags rather than showing raw tags in chat.
    if (!inWorkout && safeText.startsWith(CLOSE_WORKOUT_TAG, cursor)) {
      cursor += CLOSE_WORKOUT_TAG.length;
      continue;
    }

    buffer += safeText[cursor];
    cursor += 1;
  }

  if (buffer.length > 0) {
    if (inWorkout) {
      segments.push({
        type: "workout",
        content: buffer.trim(),
        isClosed: false,
      });
    } else {
      segments.push({
        type: "text",
        content: buffer,
      });
    }
  }

  return segments.length > 0 ? segments : [{ type: "text", content: safeText }];
};

const TOOL_LABELS: Record<string, string> = {
  searchActivities: "Searching activities",
  getWellnessTrend: "Retrieving fitness trend",
  getTrainingLoad: "Calculating training load",
  getWorkoutCompliance: "Checking workout compliance",
  getComplianceRate: "Checking training consistency",
  comparePeriods: "Comparing periods",
  getPeakPowers: "Analysing peak powers",
  scheduleWorkout: "Scheduling workout",
  batchScheduleWorkouts: "Scheduling workouts",
  scheduleDescribedWorkout: "Scheduling workout",
};

type ToolPartInfo = {
  toolCallId: string;
  toolName: string;
  state: string;
  output?: unknown;
};

const extractToolParts = (message: UIMessage): ToolPartInfo[] => {
  if (!message.parts) return [];
  const results: ToolPartInfo[] = [];
  for (const p of message.parts) {
    const raw = p as Record<string, unknown>;
    const type = (raw.type as string) ?? "";
    if (!type.startsWith("tool-") && type !== "dynamic-tool") continue;
    const toolName =
      type === "dynamic-tool"
        ? (raw.toolName as string) ?? "unknown"
        : type.replace(/^tool-/, "");
    results.push({
      toolCallId: raw.toolCallId as string,
      toolName,
      state: raw.state as string,
      output: raw.output,
    });
  }
  return results;
};

type RaceContextData = {
  id: string;
  name: string;
  race_date: string;
  event_type: string;
  distance_km: number | null;
  elevation_m: number | null;
  readiness_score?: number | null;
  route_segments?: {
    label: string;
    startKm: number;
    endKm: number;
    distanceKm: number;
    elevationGainM: number;
    avgGradientPercent: number;
    type: "climb" | "descent" | "flat";
  }[] | null;
  pacing_plan?: {
    overallTargetNpW: number;
    estimatedFinishTimeMin: number;
    strategy: string;
    segments: {
      label: string;
      startKm: number;
      endKm: number;
      targetPowerW: number;
      targetPowerPercent: number;
      estimatedTimeMin: number;
      advice: string;
      targetHrZone: string | null;
      targetHrBpm: string | null;
    }[];
  } | null;
};

type ControllerOptions = {
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onConversationUpdated?: () => void;
  raceContext?: RaceContextData;
};

export const useCoachChatController = (options?: ControllerOptions) => {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(
    options?.conversationId ?? null
  );
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [loadConversationError, setLoadConversationError] = useState<string | null>(null);
  const [didMigrateLegacy, setDidMigrateLegacy] = useState(false);
  const [devOverrides, setDevOverrides] = useState<DevModelOverrides>(DEFAULT_OVERRIDES);
  const [devRagSettings, setDevRagSettings] = useState<DevRagSettings>(DEFAULT_RAG_SETTINGS);
  const prevStatusRef = useRef<string>("");
  const savingRef = useRef(false);
  // Stable ref for callbacks to avoid effect re-runs when parent re-renders
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const raceContext = options?.raceContext ?? null;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/coach",
        body: {
          ...(IS_DEV
            ? {
                modelOverrides: devOverrides,
                ...(devRagSettings.useDefault
                  ? {}
                  : {
                      ragEnabled: devRagSettings.enabled,
                    }),
              }
            : {}),
          ...(raceContext ? { raceContext } : {}),
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devOverrides, devRagSettings, raceContext]
  );

  const { messages, sendMessage, stop, status, error, setMessages } = useChat({
    transport,
  });

  const isGenerating = useMemo(
    () => status === "submitted" || status === "streaming",
    [status]
  );

  // Dev settings hydration
  useEffect(() => {
    if (!IS_DEV) {
      return;
    }
    const saved = readStorage<DevModelOverrides>(COACH_STORAGE_KEYS.devModelOverrides, DEFAULT_OVERRIDES);
    setDevOverrides(sanitizeOverrides(saved));
    const savedRagSetting = readStorage<unknown>(COACH_STORAGE_KEYS.devRagMode, DEFAULT_RAG_SETTINGS);
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

  // Load conversation from DB when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    let cancelled = false;
    setIsLoadingConversation(true);
    setLoadConversationError(null);

    getConversation(conversationId).then((result) => {
      if (cancelled) return;
      setIsLoadingConversation(false);
      if (result.success && result.conversation) {
        const msgs = result.conversation.messages as UIMessage[];
        if (msgs.length > 0) {
          setMessages(msgs);
        }
      } else {
        setLoadConversationError(result.error ?? "Failed to load conversation");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId, setMessages]);

  // One-time localStorage migration
  useEffect(() => {
    if (didMigrateLegacy) return;
    setDidMigrateLegacy(true);

    const legacy = readCoachMessages();
    if (legacy.length === 0) return;

    const firstUserMsg = legacy.find((m) => m.role === "user");
    const title = firstUserMsg
      ? getMessageText(firstUserMsg).slice(0, 80) || "Migrated conversation"
      : "Migrated conversation";

    createConversation(title).then((result) => {
      if (!result.success || !result.id) return;
      saveConversationMessages(result.id, legacy, title).then(() => {
        removeCoachMessagesKey();
        setConversationId(result.id);
        setMessages(legacy);
        optionsRef.current?.onConversationCreated?.(result.id!);
      });
    });
  }, [didMigrateLegacy, setMessages]);

  // Save after assistant response completes (streaming → ready)
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prev !== "streaming" || status !== "ready") {
      return;
    }
    if (messages.length === 0 || savingRef.current) {
      return;
    }

    savingRef.current = true;

    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg
      ? getMessageText(firstUserMsg).slice(0, 80) || "New conversation"
      : "New conversation";

    const doSave = async () => {
      try {
        let savedId = conversationId;
        if (!savedId) {
          const result = await createConversation(title);
          if (!result.success || !result.id) return;
          savedId = result.id;
          setConversationId(savedId);
          await saveConversationMessages(savedId, messages, title);
          optionsRef.current?.onConversationCreated?.(savedId);
        } else {
          await saveConversationMessages(savedId, messages);
          optionsRef.current?.onConversationUpdated?.();
        }
        // Fire-and-forget memory extraction
        triggerMemoryExtraction(savedId, messages).catch(console.warn);
      } catch (err) {
        console.warn("Failed to save conversation:", err);
      } finally {
        savingRef.current = false;
      }
    };

    doSave();
  }, [status, messages, conversationId]);

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

  const saveCurrentBeforeSwitch = useCallback(() => {
    stop();
    if (conversationId && messages.length > 0 && !savingRef.current) {
      saveConversationMessages(conversationId, messages).catch(console.warn);
    }
  }, [stop, conversationId, messages]);

  const startNewConversation = useCallback(() => {
    saveCurrentBeforeSwitch();
    setMessages([]);
    setInput("");
    setConversationId(null);
  }, [saveCurrentBeforeSwitch, setMessages]);

  const loadConversation = useCallback(
    (id: string) => {
      saveCurrentBeforeSwitch();
      setMessages([]);
      setInput("");
      setConversationId(id);
    },
    [saveCurrentBeforeSwitch, setMessages]
  );

  return {
    input,
    setInput,
    messages,
    status,
    error,
    isGenerating,
    isLoadingConversation,
    loadConversationError,
    conversationId,
    raceContext,
    devOverrides,
    devRagSettings,
    setDevRagSettings,
    updateProvider,
    updateModel,
    onSubmit,
    sendSuggestion,
    startNewConversation,
    loadConversation,
  };
};

type CoachChatController = ReturnType<typeof useCoachChatController>;

export function CoachChatPanel({
  controller,
  className,
  showSettingsTrigger = true,
  settingsOpen: controlledSettingsOpen,
  onSettingsOpenChange,
  unreadFromCount,
}: {
  controller: CoachChatController;
  className?: string;
  showSettingsTrigger?: boolean;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  /** Number of unread messages from the end of the conversation. Used to auto-scroll to the first unread. */
  unreadFromCount?: number | null;
}) {
  const router = useRouter();
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
  const [loadingByWorkoutKey, setLoadingByWorkoutKey] = useState<Record<string, "builder" | "schedule" | false>>({});
  const [errorByWorkoutKey, setErrorByWorkoutKey] = useState<Record<string, string>>({});
  const [schedulingKey, setSchedulingKey] = useState<string | null>(null);
  const [scheduledKeys, setScheduledKeys] = useState<Record<string, string>>({});
  type ExtractedWorkout = { name: string; category: string; description: string | null; tags: string[]; intervals: unknown[] };
  const extractionCacheRef = useRef<Record<string, ExtractedWorkout>>({});

  // Track whether user has intentionally scrolled away from the bottom.
  // Ignores scroll events caused by our own programmatic scrolling.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom > 80) {
        userScrolledUpRef.current = true;
      }
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Re-engage auto-scroll when a new assistant response starts streaming.
  const prevStatusRef = useRef(controller.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = controller.status;
    if (prev !== "streaming" && controller.status === "streaming") {
      userScrolledUpRef.current = false;
    }
  }, [controller.status]);

  // Auto-scroll to bottom during streaming, unless the user has scrolled up.
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    // Use instant scroll (not smooth) so the animation doesn't fight with user input
    // and doesn't fire intermediate scroll events that would interfere with the flag.
    isProgrammaticScrollRef.current = true;
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => { isProgrammaticScrollRef.current = false; });
  }, [controller.messages, controller.status]);

  // Track the unread count for this load so we scroll once
  const pendingUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    if (unreadFromCount && unreadFromCount > 0) {
      pendingUnreadRef.current = unreadFromCount;
    }
  }, [unreadFromCount]);

  // When conversation finishes loading, scroll to first unread (or bottom)
  useEffect(() => {
    if (!controller.isLoadingConversation) {
      const unread = pendingUnreadRef.current;
      pendingUnreadRef.current = null;

      if (unread && unread > 0 && controller.messages.length > 0) {
        const targetIndex = controller.messages.length - unread;
        // Delay slightly to ensure DOM has rendered
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-message-index="${targetIndex}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            userScrolledUpRef.current = true;
            return;
          }
          // Fallback: scroll to bottom
          scrollEndRef.current?.scrollIntoView({ behavior: "instant" });
        });
      } else {
        userScrolledUpRef.current = false;
        scrollEndRef.current?.scrollIntoView({ behavior: "instant" });
      }
    }
  }, [controller.isLoadingConversation, controller.messages.length]);
  const settingsOpen = controlledSettingsOpen ?? internalSettingsOpen;
  const setSettingsOpen = onSettingsOpenChange ?? setInternalSettingsOpen;

  /** Extract a workout from its description, using the cache if available. */
  const extractWorkout = async (key: string, workoutDescription: string): Promise<ExtractedWorkout> => {
    const cached = extractionCacheRef.current[key];
    if (cached) return cached;

    const response = await fetch("/api/coach/extract-workout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: workoutDescription.trim(),
        runKey: `${Date.now()}-${key}`,
        ...(IS_DEV ? { modelOverrides: controller.devOverrides } : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Workout extraction API error:", response.status, errorBody);
      throw new Error("Failed to extract workout");
    }

    const data = (await response.json()) as ExtractedWorkout;
    extractionCacheRef.current[key] = data;
    return data;
  };

  const openInBuilder = async (key: string, workoutDescription: string) => {
    if (!workoutDescription.trim()) return;

    setLoadingByWorkoutKey((prev) => ({ ...prev, [key]: "builder" }));
    setErrorByWorkoutKey((prev) => ({ ...prev, [key]: "" }));

    try {
      const data = await extractWorkout(key, workoutDescription);

      writeStorage(COACH_STORAGE_KEYS.prefillWorkout, {
        metadata: {
          name: data.name,
          category: data.category,
          description: data.description,
          tags: Array.isArray(data.tags) ? data.tags : [],
        },
        items: data.intervals,
      });

      router.push("/workouts/builder?mode=create&from=coach");
    } catch (error) {
      console.error("Workout extraction failed:", error);
      setErrorByWorkoutKey((prev) => ({
        ...prev,
        [key]: "Could not extract workout. Please try again.",
      }));
    } finally {
      setLoadingByWorkoutKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  const scheduleWorkout = async (key: string, workoutDescription: string, date: string) => {
    if (!workoutDescription.trim() || !date) return;

    setLoadingByWorkoutKey((prev) => ({ ...prev, [key]: "schedule" }));
    setErrorByWorkoutKey((prev) => ({ ...prev, [key]: "" }));
    setSchedulingKey(null);

    try {
      const data = await extractWorkout(key, workoutDescription);
      const result = await createAndScheduleCoachWorkout(data, date);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to schedule workout");
      }
      setScheduledKeys((prev) => ({ ...prev, [key]: date }));
    } catch (error) {
      console.error("Workout scheduling failed:", error);
      setErrorByWorkoutKey((prev) => ({
        ...prev,
        [key]: "Could not schedule this workout. Please try again.",
      }));
    } finally {
      setLoadingByWorkoutKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Auto-schedule: after the stream completes, process all pending scheduleDescribedWorkout tool calls
  const prevStreamStatusRef = useRef(controller.status);
  const autoSchedulingRef = useRef(false);
  useEffect(() => {
    const prev = prevStreamStatusRef.current;
    prevStreamStatusRef.current = controller.status;

    if (prev !== "streaming" || controller.status !== "ready") return;
    if (autoSchedulingRef.current) return;

    // Find the last assistant message
    const lastAssistantMsg = [...controller.messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistantMsg) return;

    // Collect ALL pending scheduleDescribedWorkout tool results (in order)
    const toolParts = extractToolParts(lastAssistantMsg);
    const pendingSchedules = toolParts.filter(
      (tp) =>
        tp.toolName === "scheduleDescribedWorkout" &&
        tp.state === "output-available" &&
        (tp.output as Record<string, unknown>)?.pending === true
    );
    if (pendingSchedules.length === 0) return;

    // Extract all closed <workout> blocks from the message, preserving their
    // original segment index so the key matches the render's segmentKey format.
    const messageText = getMessageText(lastAssistantMsg);
    const allSegments = parseMessageSegments(messageText);
    const workoutSegments = allSegments
      .map((s, i) => ({ ...s, segmentIndex: i }))
      .filter(
        (s): s is Extract<MessageSegment, { type: "workout" }> & { segmentIndex: number } =>
          s.type === "workout" && s.isClosed
      );

    if (workoutSegments.length === 0) {
      console.warn(
        "Coach called scheduleDescribedWorkout but no <workout> tags found in response. " +
        "No workouts were scheduled."
      );
      return;
    }

    // Pair each tool call with its corresponding <workout> block by position.
    // Use the segment's original index so the key matches the render's segmentKey
    // (${message.id}-${segmentIndex}) — required for scheduledKeys/errorByWorkoutKey to surface in UI.
    // If there are more tool calls than workout blocks, the last block is reused as a fallback.
    const pairs = pendingSchedules.map((tp, i) => {
      const ws = workoutSegments[Math.min(i, workoutSegments.length - 1)];
      return {
        date: (tp.output as Record<string, unknown>).date as string,
        workout: ws,
        key: `${lastAssistantMsg.id}-${ws.segmentIndex}`,
      };
    }).filter((p) => !!p.date);

    autoSchedulingRef.current = true;
    console.log(`[AutoSchedule] Starting: ${pairs.length} workout(s) to schedule`, pairs.map(p => ({ date: p.date, key: p.key })));
    (async () => {
      try {
        // Run sequentially to avoid concurrent LLM extraction failures.
        for (const { date, workout, key } of pairs) {
          let data;
          try {
            data = await extractWorkout(key, workout.content);
          } catch (firstErr) {
            // LLM extraction is non-deterministic — retry once before giving up.
            console.warn(`Auto-schedule: extraction failed for ${date}, retrying…`, firstErr);
            // Clear the failed entry from cache so the retry makes a fresh request.
            extractionCacheRef.current[key] = undefined as unknown as ExtractedWorkout;
            try {
              data = await extractWorkout(key, workout.content);
            } catch (retryErr) {
              console.warn(`Auto-schedule: retry also failed for ${date}:`, retryErr);
              setErrorByWorkoutKey((prev) => ({
                ...prev,
                [key]: "Couldn't extract workout structure. Use the Schedule button to try again.",
              }));
              continue;
            }
          }
          try {
            const result = await createAndScheduleCoachWorkout(data, date);
            if (result.success) {
              setScheduledKeys((prev) => ({ ...prev, [key]: date }));
            } else {
              console.warn(`Auto-schedule server error for ${date}:`, result.error);
              setErrorByWorkoutKey((prev) => ({
                ...prev,
                [key]: result.error ?? "Failed to schedule. You can try manually.",
              }));
            }
          } catch (err) {
            console.warn(`Auto-schedule: scheduling failed for ${date}:`, err);
            setErrorByWorkoutKey((prev) => ({
              ...prev,
              [key]: "Failed to schedule. Use the Schedule button to try again.",
            }));
          }
        }
      } finally {
        autoSchedulingRef.current = false;
      }
    })();
  }, [controller.status, controller.messages]);

  return (
    <div className={cn("h-full flex flex-col", className)}>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {IS_DEV && (
          <>
            {showSettingsTrigger ? (
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
                  <Cog className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogContent className="max-w-3xl z-[90]">
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
                  <div className="grid gap-4 md:grid-cols-4">
                    {(["queryGeneration", "embedding", "coaching", "workoutExtraction"] as const).map((step) => (
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

        {controller.isLoadingConversation && (
          <div className="max-w-4xl mx-auto mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading conversation...
          </div>
        )}

        {controller.loadConversationError && (
          <div className="max-w-4xl mx-auto mt-8">
            <p className="text-sm text-red-600">
              Could not load conversation: {controller.loadConversationError}
            </p>
          </div>
        )}

        {!controller.isLoadingConversation && controller.messages.length === 0 && (
          <div className="max-w-3xl mx-auto mt-8">
            <h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
            <p className="text-muted-foreground mt-2">
              {controller.raceContext
                ? `Ask me anything about ${controller.raceContext.name}.`
                : "Ask training questions and get advice grounded in your profile, schedule, and knowledge base."}
            </p>
            {!controller.raceContext && (
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
            )}
          </div>
        )}

        {!controller.isLoadingConversation && controller.messages.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-4 pb-8">
            {controller.messages.map((message, messageIndex) => {
              const text = getMessageText(message);
              const isUser = message.role === "user";

              return (
                <div key={message.id} data-message-index={messageIndex} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
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
                      <div className="space-y-3">
                        {(() => {
                          const toolParts = extractToolParts(message);
                          const hasToolCalls = toolParts.length > 0;
                          const isToolRunning = toolParts.some(
                            (t) => t.state === "input-streaming" || t.state === "input-available"
                          );

                          return (
                            <>
                              {hasToolCalls && (
                                <div className="flex flex-wrap gap-2">
                                  {toolParts.map((tp) => {
                                    const label = TOOL_LABELS[tp.toolName] ?? tp.toolName;
                                    const done = tp.state === "output-available";
                                    const errored = tp.state === "output-error";
                                    return (
                                      <span
                                        key={tp.toolCallId}
                                        className={cn(
                                          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                                          done
                                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                            : errored
                                              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                                              : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                        )}
                                      >
                                        {done ? (
                                          <Database className="h-3 w-3" />
                                        ) : errored ? (
                                          <Database className="h-3 w-3" />
                                        ) : (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        )}
                                        {label}{done ? "" : "..."}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Show thinking indicator when tool is running and no text yet */}
                              {isToolRunning && !text.trim() && (
                                <p className="text-xs text-muted-foreground">Retrieving data...</p>
                              )}

                              {parseMessageSegments(text).map((segment, segmentIndex) => {
                                const segmentKey = `${message.id}-${segmentIndex}`;

                                if (segment.type === "workout") {
                                  return (
                                    <div key={segmentKey} className="space-y-2">
                                      <div className="prose prose-sm max-w-none dark:prose-invert">
                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                          {segment.content}
                                        </ReactMarkdown>
                                      </div>
                                      {segment.isClosed ? (
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              disabled={!!loadingByWorkoutKey[segmentKey]}
                                              onClick={() => openInBuilder(segmentKey, segment.content)}
                                            >
                                              {loadingByWorkoutKey[segmentKey] === "builder" ? (
                                                <>
                                                  <Loader2 className="h-4 w-4 animate-spin" />
                                                  Extracting...
                                                </>
                                              ) : (
                                                "Open in Builder"
                                              )}
                                            </Button>
                                            {scheduledKeys[segmentKey] ? (
                                              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                                <Check className="h-3.5 w-3.5" />
                                                Scheduled for {scheduledKeys[segmentKey]}
                                              </span>
                                            ) : loadingByWorkoutKey[segmentKey] === "schedule" ? (
                                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                Scheduling...
                                              </span>
                                            ) : schedulingKey === segmentKey ? (
                                              <div className="inline-flex items-center gap-1.5">
                                                <input
                                                  id={`schedule-date-${segmentKey}`}
                                                  type="date"
                                                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                                  defaultValue={new Date().toISOString().slice(0, 10)}
                                                  autoFocus
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Escape") setSchedulingKey(null);
                                                    if (e.key === "Enter") {
                                                      scheduleWorkout(segmentKey, segment.content, e.currentTarget.value);
                                                    }
                                                  }}
                                                />
                                                <Button
                                                  type="button"
                                                  variant="default"
                                                  size="sm"
                                                  className="h-8"
                                                  onClick={() => {
                                                    const input = document.getElementById(`schedule-date-${segmentKey}`) as HTMLInputElement;
                                                    if (input?.value) {
                                                      scheduleWorkout(segmentKey, segment.content, input.value);
                                                    }
                                                  }}
                                                >
                                                  <Check className="h-3.5 w-3.5 mr-1" />
                                                  Schedule
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 w-8 p-0"
                                                  onClick={() => setSchedulingKey(null)}
                                                >
                                                  <X className="h-3.5 w-3.5" />
                                                </Button>
                                              </div>
                                            ) : (
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={!!loadingByWorkoutKey[segmentKey]}
                                                onClick={() => setSchedulingKey(segmentKey)}
                                              >
                                                <CalendarPlus className="h-4 w-4" />
                                                Schedule
                                              </Button>
                                            )}
                                          </div>
                                          {errorByWorkoutKey[segmentKey] ? (
                                            <p className="text-xs text-red-600">{errorByWorkoutKey[segmentKey]}</p>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">Workout draft...</p>
                                      )}
                                    </div>
                                  );
                                }

                                if (!segment.content.trim()) {
                                  return null;
                                }

                                return (
                                  <div key={segmentKey} className="prose prose-sm max-w-none dark:prose-invert">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                      {segment.content}
                                    </ReactMarkdown>
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {controller.isGenerating && controller.messages.length > 0 &&
              !controller.messages[controller.messages.length - 1]?.parts?.some(
                (p) => {
                  const t = (p as { type?: string }).type ?? "";
                  return t.startsWith("tool-") || t === "dynamic-tool";
                }
              ) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Coach is thinking...
              </div>
            )}
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      <div className="border-t bg-background px-4 py-4 sm:px-6">
        <form onSubmit={controller.onSubmit} className="max-w-4xl mx-auto flex gap-2 items-end">
          <textarea
            value={controller.input}
            onChange={(event) => controller.setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                controller.onSubmit(event as unknown as React.FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="Ask your coach anything about your training..."
            disabled={controller.isGenerating}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties}
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
