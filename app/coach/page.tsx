"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";
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
import { CoachChatPanel, useCoachChatController } from "@/components/coach/coach-chat-panel";
import { ConversationSidebar } from "@/components/coach/conversation-sidebar";
import {
  deleteConversation,
  getConversations,
  markConversationRead,
  type ConversationListItem,
} from "@/app/coach/actions";
import { writeActiveConversationId, clearActiveConversationId } from "@/lib/coach/persistence";

export default function CoachPage() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [streamingWarningOpen, setStreamingWarningOpen] = useState(false);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const onConversationCreated = useCallback(
    (id: string) => {
      setActiveId(id);
      writeActiveConversationId(id);
      getConversations().then((result) => {
        if (result.success) {
          setConversations(result.conversations);
        }
      });
    },
    []
  );

  const onConversationUpdated = useCallback(() => {
    getConversations().then((result) => {
      if (result.success) {
        setConversations(result.conversations);
      }
    });
  }, []);

  const chat = useCoachChatController({
    conversationId: activeId,
    onConversationCreated,
    onConversationUpdated,
  });

  useEffect(() => {
    getConversations().then((result) => {
      if (result.success) {
        setConversations(result.conversations);
      }
    });
  }, []);

  const guardStreaming = (action: () => void) => {
    if (chat.isGenerating) {
      pendingActionRef.current = action;
      setStreamingWarningOpen(true);
    } else {
      action();
    }
  };

  const confirmLeave = () => {
    setStreamingWarningOpen(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  };

  const cancelLeave = () => {
    setStreamingWarningOpen(false);
    pendingActionRef.current = null;
  };

  const handleSelect = (id: string) => {
    if (id === activeId) return;
    guardStreaming(() => {
      // Compute first unread index from the conversation's unread_count
      const conv = conversations.find((c) => c.id === id);
      if (conv && conv.unread_count > 0) {
        // We'll get the actual message count when the conversation loads;
        // store the unread_count so the chat panel can compute the scroll target
        setFirstUnreadIndex(conv.unread_count);
        // Mark as read in DB and clear local unread badge
        markConversationRead(id).catch(console.warn);
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
        );
      } else {
        setFirstUnreadIndex(null);
      }

      setActiveId(id);
      writeActiveConversationId(id);
      chat.loadConversation(id);
    });
  };

  const handleNew = () => {
    guardStreaming(() => {
      setActiveId(null);
      setFirstUnreadIndex(null);
      clearActiveConversationId();
      chat.startNewConversation();
    });
  };

  const handleDelete = async (id: string) => {
    const result = await deleteConversation(id);
    if (!result.success) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setFirstUnreadIndex(null);
      clearActiveConversationId();
      chat.startNewConversation();
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {!sidebarOpen && (
        <div className="absolute top-3 left-3 z-10 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {sidebarOpen && (
        <div className="w-[280px] shrink-0 border-r bg-card flex flex-col">
          <div className="md:hidden p-2 border-b flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <ConversationSidebar
              conversations={conversations}
              activeId={activeId}
              onSelect={handleSelect}
              onNew={handleNew}
              onDelete={handleDelete}
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <CoachChatPanel
          controller={chat}
          unreadFromCount={firstUnreadIndex}
        />
      </div>

      <AlertDialog open={streamingWarningOpen} onOpenChange={cancelLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Coach is still responding</AlertDialogTitle>
            <AlertDialogDescription>
              The coach is still generating a response. If you leave now, the
              partial response will be saved but the generation will stop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLeave}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Leave anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
