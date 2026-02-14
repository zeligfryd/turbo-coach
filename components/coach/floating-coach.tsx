"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Cog, Maximize2, Minimize2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CoachChatPanel, useCoachChatController } from "@/components/coach/coach-chat-panel";
import { readCoachDialogState, writeCoachDialogState } from "@/lib/coach/persistence";

export function FloatingCoach() {
  const pathname = usePathname();
  const chat = useCoachChatController({ persistMessages: true });
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const state = readCoachDialogState();
    setIsOpen(state.isOpen);
    setIsFullscreen(state.isFullscreen);
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    writeCoachDialogState({ isOpen, isFullscreen });
  }, [hasHydrated, isFullscreen, isOpen]);

  if (!hasHydrated) {
    return null;
  }

  const confirmClearChat = () => {
    chat.clearChat();
    if (pathname !== "/coach") {
      setIsOpen(false);
    }
    setClearConfirmOpen(false);
  };

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-[55]">
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-xl"
            onClick={() => setIsOpen(true)}
            aria-label="Open coach"
          >
            <Bot className="h-5 w-5" />
          </Button>
        </div>
      )}

      {isOpen && (
        <div
          className={cn(
            "fixed z-[60] rounded-xl border bg-card shadow-2xl overflow-hidden flex flex-col",
            isFullscreen
              ? "inset-0 md:inset-4"
              : "bottom-6 right-6 w-[min(50vw,780px)] h-[min(50vh,720px)] min-w-[320px] min-h-[420px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-6rem)]"
          )}
        >
          <div className="h-12 px-3 border-b flex items-center justify-between bg-card">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4" />
              Coach
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setClearConfirmOpen(true)}
                aria-label="Clear chat"
                title="Clear chat"
              >
                <X className="h-4 w-4" />
              </Button>
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsFullscreen((value) => !value)}
                aria-label={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsOpen(false)}
                aria-label="Minimize coach"
                title="Minimize coach"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <CoachChatPanel
              controller={chat}
              showSettingsTrigger={false}
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
            />
          </div>
        </div>
      )}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This operation is not reversible. All current coach messages will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClearChat}>Clear chat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
