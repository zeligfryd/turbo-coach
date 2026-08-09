"use client";

import { useState } from "react";
import {
  Bot,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  ListChecks,
  User,
  Wand2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  AdaptationScope,
  AdaptationTrigger,
  PlanAdaptation,
} from "@/lib/plans/types";

const SCOPE_ICON: Record<AdaptationScope, typeof CalendarRange> = {
  plan: Wand2,
  block: LayoutGrid,
  week: CalendarRange,
  day: CalendarRange,
  item: ListChecks,
};

const TRIGGER_ICON: Record<AdaptationTrigger, typeof User> = {
  user: User,
  coach: Bot,
  auto: Wand2,
};

const TRIGGER_LABEL: Record<AdaptationTrigger, string> = {
  user: "You",
  coach: "Coach",
  auto: "Auto",
};

type Details = { action?: string; updates?: Record<string, unknown> } & Record<string, unknown>;

function headlineFor(entry: PlanAdaptation): string {
  const d = (entry.details ?? {}) as Details;
  const action = typeof d.action === "string" ? d.action : null;
  const verbMap: Record<string, string> = {
    add: "Added",
    update: "Updated",
    delete: "Removed",
    set_notes: "Updated notes on",
  };
  const verb = action ? (verbMap[action] ?? action) : "Changed";
  const scopeNoun = entry.scope;

  if (entry.scope === "plan") {
    return `${verb} plan`;
  }
  if (entry.scope === "block" && action === "add" && typeof d.name === "string") {
    const weeks = typeof d.duration_weeks === "number" ? ` (${d.duration_weeks}w)` : "";
    return `Added block "${d.name}"${weeks}`;
  }
  if (entry.scope === "item" && action === "add" && typeof d.archetype === "string") {
    const dur =
      typeof d.target_duration_min === "number" ? ` · ${d.target_duration_min}m` : "";
    return `Added ${d.kind ?? "item"} "${d.archetype}"${dur}`;
  }
  return `${verb} ${scopeNoun}`;
}

function formatDetail(key: string, value: unknown): string {
  if (value == null) return `cleared ${key}`;
  if (typeof value === "string") {
    return `${key} = "${value.length > 80 ? value.slice(0, 80) + "…" : value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `${key} = ${value}`;
  }
  return `${key} updated`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function PlanAdaptationLog({
  adaptations,
}: {
  adaptations: PlanAdaptation[];
}) {
  if (adaptations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">No changes yet</p>
          <p className="text-sm text-muted-foreground">
            Every edit — by you or the coach — will appear here with its reason.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {adaptations.map((entry) => (
        <AdaptationRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function AdaptationRow({ entry }: { entry: PlanAdaptation }) {
  const [expanded, setExpanded] = useState(false);
  const ScopeIcon = SCOPE_ICON[entry.scope] ?? CalendarRange;
  const TriggerIcon = TRIGGER_ICON[entry.triggered_by] ?? User;
  const details = (entry.details ?? {}) as Details;
  const updates =
    details.updates && typeof details.updates === "object"
      ? (details.updates as Record<string, unknown>)
      : null;
  const hasExpandable = updates !== null && Object.keys(updates).length > 0;

  return (
    <div
      className={cn(
        "rounded-md border bg-card px-3 py-2.5 text-sm",
        entry.triggered_by === "coach" && "border-primary/30",
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 rounded-md p-1",
            entry.triggered_by === "coach"
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <ScopeIcon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{headlineFor(entry)}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <TriggerIcon className="h-3 w-3" />
              {TRIGGER_LABEL[entry.triggered_by]}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(entry.created_at)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{entry.reason}</p>

          {hasExpandable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {expanded ? "Hide" : "Show"} details
            </button>
          )}

          {expanded && updates && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              {Object.entries(updates).map(([k, v]) => (
                <li key={k} className="font-mono">
                  {formatDetail(k, v)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
