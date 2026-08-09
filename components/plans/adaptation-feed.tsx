"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bot,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  ListChecks,
  Loader2,
  User,
  Wand2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ADAPTATION_SCOPES,
  ADAPTATION_TRIGGERS,
  type AdaptationScope,
  type AdaptationTrigger,
} from "@/lib/plans/types";
import {
  listAllAdaptations,
  type AdaptationFeedCursor,
  type AdaptationFeedEntry,
} from "@/app/plans/actions";

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

type Details = { action?: string; updates?: Record<string, unknown> } & Record<
  string,
  unknown
>;

function headlineFor(entry: AdaptationFeedEntry): string {
  const d = (entry.details ?? {}) as Details;
  const action = typeof d.action === "string" ? d.action : null;
  const verbMap: Record<string, string> = {
    add: "Added",
    update: "Updated",
    delete: "Removed",
    set_notes: "Updated notes on",
    duplicate: "Duplicated",
    swap: "Swapped",
    insert_recovery: "Inserted recovery",
    activate: "Activated",
  };
  const verb = action ? (verbMap[action] ?? action) : "Changed";

  if (entry.scope === "plan" && action === "activate") return "Activated plan";
  if (entry.scope === "plan") return `${verb} plan`;
  if (entry.scope === "block" && action === "add" && typeof d.name === "string") {
    const weeks = typeof d.duration_weeks === "number" ? ` (${d.duration_weeks}w)` : "";
    return `Added block "${d.name}"${weeks}`;
  }
  if (entry.scope === "item" && action === "add" && typeof d.archetype === "string") {
    const dur =
      typeof d.target_duration_min === "number" ? ` · ${d.target_duration_min}m` : "";
    return `Added ${d.kind ?? "item"} "${d.archetype}"${dur}`;
  }
  return `${verb} ${entry.scope}`;
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

const PAGE_SIZE = 50;

export function AdaptationFeed({
  initialEntries,
  initialCursor,
  plans,
}: {
  initialEntries: AdaptationFeedEntry[];
  initialCursor: AdaptationFeedCursor | null;
  plans: { id: string; name: string }[];
}) {
  const [planId, setPlanId] = useState<string | "all">("all");
  const [trigger, setTrigger] = useState<AdaptationTrigger | "all">("all");
  const [scope, setScope] = useState<AdaptationScope | "all">("all");

  const [entries, setEntries] = useState<AdaptationFeedEntry[]>(initialEntries);
  const [cursor, setCursor] = useState<AdaptationFeedCursor | null>(initialCursor);
  const [isLoading, startLoad] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [didInit, setDidInit] = useState(false);

  const filtersKey = useMemo(
    () => `${planId}|${trigger}|${scope}`,
    [planId, trigger, scope],
  );

  // Re-fetch first page whenever a server-side filter changes. Skip the first
  // run so we don't discard the SSR-provided initialEntries on mount.
  useEffect(() => {
    if (!didInit) {
      setDidInit(true);
      return;
    }
    setError(null);
    startLoad(async () => {
      const result = await listAllAdaptations({
        limit: PAGE_SIZE,
        planId: planId === "all" ? null : planId,
        triggeredBy: trigger === "all" ? null : trigger,
        scope: scope === "all" ? null : scope,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to load activity");
        setEntries([]);
        setCursor(null);
        return;
      }
      setEntries(result.entries);
      setCursor(result.nextCursor);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  function loadMore() {
    if (!cursor) return;
    setError(null);
    startLoad(async () => {
      const result = await listAllAdaptations({
        limit: PAGE_SIZE,
        planId: planId === "all" ? null : planId,
        triggeredBy: trigger === "all" ? null : trigger,
        scope: scope === "all" ? null : scope,
        cursor,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to load more");
        return;
      }
      setEntries((prev) => [...prev, ...result.entries]);
      setCursor(result.nextCursor);
    });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        plans={plans}
        planId={planId}
        setPlanId={setPlanId}
        trigger={trigger}
        setTrigger={setTrigger}
        scope={scope}
        setScope={setScope}
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {entries.length === 0 && !isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No activity</p>
            <p className="text-sm text-muted-foreground">
              Nothing matches the current filters yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <FeedRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-center pt-2">
        {cursor ? (
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        ) : isLoading ? (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : entries.length > 0 ? (
          <p className="text-xs text-muted-foreground">End of activity</p>
        ) : null}
      </div>
    </div>
  );
}

function FilterBar({
  plans,
  planId,
  setPlanId,
  trigger,
  setTrigger,
  scope,
  setScope,
}: {
  plans: { id: string; name: string }[];
  planId: string | "all";
  setPlanId: (v: string | "all") => void;
  trigger: AdaptationTrigger | "all";
  setTrigger: (v: AdaptationTrigger | "all") => void;
  scope: AdaptationScope | "all";
  setScope: (v: AdaptationScope | "all") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <FilterGroup label="Plan">
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value as string | "all")}
          className="h-7 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="By">
        <Chip active={trigger === "all"} onClick={() => setTrigger("all")}>
          All
        </Chip>
        {ADAPTATION_TRIGGERS.map((t) => (
          <Chip key={t} active={trigger === t} onClick={() => setTrigger(t)}>
            {TRIGGER_LABEL[t]}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Scope">
        <Chip active={scope === "all"} onClick={() => setScope("all")}>
          All
        </Chip>
        {ADAPTATION_SCOPES.map((s) => (
          <Chip key={s} active={scope === s} onClick={() => setScope(s)}>
            {s}
          </Chip>
        ))}
      </FilterGroup>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={active ? "default" : "outline"}
      size="xs"
      className="h-7 px-2 text-xs capitalize"
    >
      {children}
    </Button>
  );
}

function FeedRow({ entry }: { entry: AdaptationFeedEntry }) {
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
            <Link
              href={`/plans/${entry.plan_id}`}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80"
            >
              {entry.plan_name}
            </Link>
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
