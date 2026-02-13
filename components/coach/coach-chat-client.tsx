"use client";

import { CoachChatPanel, useCoachChatController } from "@/components/coach/coach-chat-panel";

export function CoachChatClient() {
  const controller = useCoachChatController({ persistMessages: true });
  return <CoachChatPanel controller={controller} />;
}
