import type { UIMessage } from "ai";

export const COACH_STORAGE_KEYS = {
  dialogState: "coach-dialog-state",
  messages: "coach-chat-messages",
  activeConversationId: "coach-active-conversation-id",
  devModelOverrides: "coach-dev-model-overrides",
  devRagMode: "coach-dev-rag-mode",
  prefillWorkout: "coach-prefill-workout",
} as const;

export type CoachDialogState = {
  isOpen: boolean;
  isFullscreen: boolean;
};

const isBrowser = () => typeof window !== "undefined";

export const readStorage = <T>(key: string, fallback: T): T => {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeStorage = (key: string, value: unknown) => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const removeStorage = (key: string) => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(key);
};

export const readCoachDialogState = (): CoachDialogState => {
  return readStorage<CoachDialogState>(COACH_STORAGE_KEYS.dialogState, {
    isOpen: false,
    isFullscreen: false,
  });
};

export const writeCoachDialogState = (value: CoachDialogState) => {
  writeStorage(COACH_STORAGE_KEYS.dialogState, value);
};

// Active conversation ID helpers (replaces old message persistence)
export const readActiveConversationId = (): string | null => {
  return readStorage<string | null>(COACH_STORAGE_KEYS.activeConversationId, null);
};

export const writeActiveConversationId = (id: string) => {
  writeStorage(COACH_STORAGE_KEYS.activeConversationId, id);
};

export const clearActiveConversationId = () => {
  removeStorage(COACH_STORAGE_KEYS.activeConversationId);
};

// Legacy message helpers — kept only for one-time migration
export const readCoachMessages = (): UIMessage[] => {
  return readStorage<UIMessage[]>(COACH_STORAGE_KEYS.messages, []);
};

export const removeCoachMessagesKey = () => {
  removeStorage(COACH_STORAGE_KEYS.messages);
};
