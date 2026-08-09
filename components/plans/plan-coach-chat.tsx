"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Check, Database, Loader2, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { extractMessageText } from "@/lib/ai/utils";
import { clearPlanCoachConversation } from "@/app/plans/actions";

const SUGGESTIONS = [
  "Sketch a 12-week base plan for me.",
  "What should week 1 look like?",
  "Add a recovery week every 4th week.",
];

const TOOL_LABELS: Record<string, string> = {
  listArchetypes: "Loading archetypes",
  updatePlanMetadata: "Update plan",
  addBlock: "Add block",
  updateBlock: "Update block",
  deleteBlock: "Remove block",
  addWeek: "Add week",
  updateWeek: "Update week",
  deleteWeek: "Remove week",
  duplicateWeek: "Duplicate week",
  swapWeeks: "Swap weeks",
  insertRecoveryWeek: "Insert recovery week",
  setDayNotes: "Set day notes",
  addDayItem: "Add workout",
  updateDayItem: "Update workout",
  deleteDayItem: "Remove workout",
  proposeBlockStructure: "Propose block structure",
  fillBlockSkeleton: "Fill block weeks",
  getFitnessTrend: "Fitness trend",
  getRecentActivities: "Recent activities",
  getPeakPowers: "Peak powers",
  getWorkoutCompliance: "Workout compliance",
  searchKnowledgeBase: "Search knowledge",
};

const remarkPlugins = [remarkGfm, remarkBreaks];

type ToolPart = {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  approvalId?: string;
};

function extractToolParts(message: UIMessage): ToolPart[] {
  if (!message.parts) return [];
  const out: ToolPart[] = [];
  for (const p of message.parts) {
    const raw = p as Record<string, unknown>;
    const type = (raw.type as string) ?? "";
    if (!type.startsWith("tool-") && type !== "dynamic-tool") continue;
    const toolName =
      type === "dynamic-tool"
        ? ((raw.toolName as string) ?? "unknown")
        : type.replace(/^tool-/, "");
    const approval = raw.approval as { id?: string } | undefined;
    out.push({
      toolCallId: raw.toolCallId as string,
      toolName,
      state: raw.state as string,
      input: raw.input,
      output: raw.output,
      approvalId: approval?.id,
    });
  }
  return out;
}

const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={remarkPlugins}>{content}</ReactMarkdown>
    </div>
  );
});

export function PlanCoachChat({
  planId,
  initialMessages,
}: {
  planId: string;
  initialMessages?: UIMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/coach/plans",
        body: () => ({ planId }),
      }),
    [planId],
  );

  const { messages, sendMessage, setMessages, status, error, addToolApprovalResponse } =
    useChat({
      transport,
      experimental_throttle: 50,
      messages: initialMessages,
      // Auto-resume the stream once every pending approval has a response.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  async function handleClear() {
    if (isGenerating) return;
    if (messages.length === 0) return;
    const ok = window.confirm("Clear this plan conversation? This cannot be undone.");
    if (!ok) return;
    const res = await clearPlanCoachConversation(planId);
    if (!res.success) {
      window.alert(res.error ?? "Failed to clear conversation");
      return;
    }
    setMessages([]);
  }

  const isGenerating = status === "submitted" || status === "streaming";

  // Refresh server data when the stream completes so tool-driven edits surface.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === "streaming" && status === "ready") {
      router.refresh();
    }
  }, [status, router]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isGenerating) return;
    setInput("");
    await sendMessage({ text });
  }

  async function sendSuggestion(text: string) {
    if (isGenerating) return;
    await sendMessage({ text });
  }

  return (
    <div className="flex h-[560px] flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Plan coach</h2>
        <span className="text-xs text-muted-foreground">
          You approve every change
        </span>
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            disabled={isGenerating}
            title="Clear conversation"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Ask the coach to draft, reshape, or fill in this plan. Every
              edit is proposed first — you&apos;ll approve or reject it before
              it lands.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto py-1.5 text-left whitespace-normal"
                  onClick={() => sendSuggestion(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onApprove={(id) => addToolApprovalResponse({ id, approved: true })}
                onReject={(id) =>
                  addToolApprovalResponse({
                    id,
                    approved: false,
                    reason: "Rider declined this change.",
                  })
                }
              />
            ))}
            {isGenerating &&
              messages.length > 0 &&
              !messages[messages.length - 1]?.parts?.some((p) => {
                const t = (p as { type?: string }).type ?? "";
                return t.startsWith("tool-") || t === "dynamic-tool";
              }) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking...
                </div>
              )}
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
            }
          }}
          placeholder="Ask the plan coach..."
          disabled={isGenerating}
          rows={1}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 max-h-32 overflow-y-auto"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <Button type="submit" size="sm" disabled={isGenerating || input.trim().length === 0}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
      {error && <p className="px-3 pb-2 text-xs text-red-600">{error.message}</p>}
    </div>
  );
}

const ChatMessage = memo(function ChatMessage({
  message,
  onApprove,
  onReject,
}: {
  message: UIMessage;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
}) {
  const text = extractMessageText(message);
  const isUser = message.role === "user";
  const tools = extractToolParts(message);

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[90%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground border border-border",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="space-y-2">
            {tools.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {tools.map((tp) =>
                  tp.state === "approval-requested" ? (
                    <ApprovalCard
                      key={tp.toolCallId}
                      tool={tp}
                      onApprove={onApprove}
                      onReject={onReject}
                    />
                  ) : (
                    <ToolChip key={tp.toolCallId} tool={tp} />
                  ),
                )}
              </div>
            )}
            {text.trim() ? <MarkdownBlock content={text} /> : null}
          </div>
        )}
      </div>
    </div>
  );
});

function ToolChip({ tool }: { tool: ToolPart }) {
  const label = TOOL_LABELS[tool.toolName] ?? tool.toolName;
  const done = tool.state === "output-available";
  const errored = tool.state === "output-error";
  const denied = tool.state === "output-denied";
  const approvedPending = tool.state === "approval-responded";
  const outputError =
    done && tool.output && typeof tool.output === "object"
      ? (tool.output as { error?: string }).error
      : null;
  const failed = errored || !!outputError;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-[11px]",
        denied
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : failed
            ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
            : done
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
      )}
      title={outputError ?? undefined}
    >
      {done || failed || denied ? (
        <Database className="h-2.5 w-2.5" />
      ) : (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      )}
      {label}
      {denied
        ? " — rejected"
        : approvedPending
          ? " — applying..."
          : !done && !failed
            ? "..."
            : ""}
    </span>
  );
}

function ApprovalCard({
  tool,
  onApprove,
  onReject,
}: {
  tool: ToolPart;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
}) {
  const label = TOOL_LABELS[tool.toolName] ?? tool.toolName;
  const input = tool.input as Record<string, unknown> | undefined;
  const reason =
    input && typeof input.reason === "string" ? (input.reason as string) : null;
  const fields = input
    ? Object.entries(input).filter(([k]) => k !== "reason")
    : [];

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-50/60 p-2.5 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
          Proposed: {label}
        </span>
      </div>
      {reason && (
        <p className="mt-1.5 text-xs italic text-amber-900/90 dark:text-amber-200/90">
          &ldquo;{reason}&rdquo;
        </p>
      )}
      {fields.length > 0 && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {fields.map(([k, v]) => (
            <ProposedField key={k} name={k} value={v} />
          ))}
        </dl>
      )}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={!tool.approvalId}
          onClick={() => tool.approvalId && onApprove(tool.approvalId)}
        >
          <Check className="h-3 w-3" />
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          disabled={!tool.approvalId}
          onClick={() => tool.approvalId && onReject(tool.approvalId)}
        >
          <X className="h-3 w-3" />
          Reject
        </Button>
      </div>
    </div>
  );
}

function ProposedField({ name, value }: { name: string; value: unknown }) {
  const rendered =
    value == null
      ? <span className="italic">null</span>
      : typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
  return (
    <>
      <dt className="font-mono">{name}</dt>
      <dd className="truncate">{rendered}</dd>
    </>
  );
}
