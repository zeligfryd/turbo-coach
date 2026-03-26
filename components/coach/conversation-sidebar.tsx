"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Plus, Sparkles, Trash2 } from "lucide-react";
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
import type { ConversationListItem } from "@/app/coach/actions";

const timeAgo = (dateString: string): string => {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { systemConversation, regularConversations } = useMemo(() => {
    const sys = conversations.find((c) => c.is_system);
    const regular = conversations.filter((c) => !c.is_system);
    return { systemConversation: sys ?? null, regularConversations: regular };
  }, [conversations]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b">
        <Button onClick={onNew} variant="outline" className="w-full justify-start gap-2" size="sm">
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* System conversation pinned at top */}
        {systemConversation && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(systemConversation.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(systemConversation.id);
              }
            }}
            className={cn(
              "w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-primary/10 transition-colors cursor-pointer border-b border-border",
              activeId === systemConversation.id
                ? "bg-primary/15"
                : "bg-primary/5"
            )}
          >
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary truncate">
                {systemConversation.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(systemConversation.updated_at)}
              </p>
            </div>
            <UnreadBadge count={systemConversation.unread_count} />
          </div>
        )}

        {/* Regular conversations */}
        {conversations.length === 0 && (
          <p className="text-sm text-muted-foreground p-4">No conversations yet</p>
        )}
        {regularConversations.map((conversation) => (
          <div
            key={conversation.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(conversation.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(conversation.id);
              }
            }}
            className={cn(
              "w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-muted/50 transition-colors group border-b border-border/50 cursor-pointer",
              activeId === conversation.id && "bg-muted"
            )}
          >
            <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{conversation.title}</p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(conversation.updated_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(conversation.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity shrink-0"
              aria-label="Delete conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation will be permanently deleted. Memories extracted from it will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
