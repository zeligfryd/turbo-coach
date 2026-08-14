"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarCheck,
  History,
  LayoutGrid,
  ListTree,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import {
  PLAN_STATUS_LABELS,
  type PlanAdaptation,
  type PlanWithTree,
} from "@/lib/plans/types";
import {
  archivePlan,
  deletePlan,
  resyncPlanCalendar,
  type ArchetypeOption,
} from "@/app/plans/actions";
import { PlanCalendar } from "./plan-calendar";
import { PlanBlocks } from "./plan-blocks";
import { PlanCoachChat } from "./plan-coach-chat";
import { PlanAdaptationLog } from "./plan-adaptation-log";
import { ActivatePlanDialog } from "./activate-plan-dialog";
import { ManualComposer } from "./manual-composer";

type Tab = "overview" | "compose" | "calendar" | "blocks" | "history";

export function PlanEditorShell({
  plan,
  archetypes,
  adaptations,
  initialCoachMessages,
  workoutsById = {},
}: {
  plan: PlanWithTree;
  archetypes: ArchetypeOption[];
  adaptations: PlanAdaptation[];
  initialCoachMessages?: UIMessage[];
  workoutsById?: Record<string, { name: string; durationMin: number | null }>;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);

  const weekCount = plan.blocks.reduce((acc, b) => acc + b.weeks.length, 0);
  const itemCount = plan.blocks.reduce(
    (acc, b) =>
      acc +
      b.weeks.reduce(
        (a, w) => a + w.days.reduce((x, d) => x + d.items.length, 0),
        0,
      ),
    0,
  );

  async function onArchive() {
    if (!confirm("Archive this plan? It will be hidden from the main list.")) return;
    setBusy(true);
    await archivePlan(plan.id);
    setBusy(false);
    router.push("/plans");
  }

  async function onDelete() {
    if (!confirm("Delete this plan permanently? This cannot be undone.")) return;
    setBusy(true);
    await deletePlan(plan.id);
    setBusy(false);
    router.push("/plans");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/plans" aria-label="Back to plans">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold leading-tight">{plan.name}</h1>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {PLAN_STATUS_LABELS[plan.status]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {plan.duration_weeks} week{plan.duration_weeks === 1 ? "" : "s"} ·{" "}
              {plan.blocks.length} block{plan.blocks.length === 1 ? "" : "s"} ·{" "}
              {weekCount} week{weekCount === 1 ? "" : "s"} planned · {itemCount} item
              {itemCount === 1 ? "" : "s"}
            </p>
            {plan.goal && (
              <p className="mt-1 text-sm text-muted-foreground">{plan.goal}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan.status === "draft" && (
            <Button
              size="sm"
              onClick={() => setActivateOpen(true)}
              disabled={busy}
            >
              <CalendarCheck className="h-4 w-4" />
              Activate
            </Button>
          )}
          {plan.status !== "archived" && (
            <Button variant="outline" size="sm" onClick={onArchive} disabled={busy}>
              Archive
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={busy}
          >
            Delete
          </Button>
        </div>
      </div>

      {plan.status === "active" && <ActiveResyncBanner planId={plan.id} />}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<ListTree className="h-4 w-4" />}>
          Overview
        </TabButton>
        <TabButton active={tab === "compose"} onClick={() => setTab("compose")} icon={<LayoutGrid className="h-4 w-4" />}>
          Compose
        </TabButton>
        <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={<Calendar className="h-4 w-4" />}>
          Calendar
        </TabButton>
        <TabButton active={tab === "blocks"} onClick={() => setTab("blocks")} icon={<LayoutGrid className="h-4 w-4" />}>
          Blocks
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={<History className="h-4 w-4" />}>
          History
          {adaptations.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {adaptations.length}
            </span>
          )}
        </TabButton>
      </div>

      {/* Tab content — all panes stay mounted so the coach chat keeps its
          in-memory history when the user switches tabs. Inactive panes are
          hidden with CSS instead of unmounted. */}
      <div hidden={tab !== "overview"}>
        <OverviewPane plan={plan} initialCoachMessages={initialCoachMessages} />
      </div>
      {tab === "compose" && <ManualComposer plan={plan} workoutsById={workoutsById} />}
      {tab === "calendar" && <CalendarPane plan={plan} archetypes={archetypes} />}
      {tab === "blocks" && <PlanBlocks plan={plan} />}
      {tab === "history" && <PlanAdaptationLog adaptations={adaptations} />}

      <ActivatePlanDialog
        planId={plan.id}
        open={activateOpen}
        onOpenChange={setActivateOpen}
      />
    </div>
  );
}

function ActiveResyncBanner({ planId }: { planId: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; inserted: number; deleted: number; unresolved: number }
    | { ok: false; error: string }
    | null
  >(null);

  function onResync() {
    if (
      !confirm(
        "Re-sync future calendar entries for this plan? Past workouts will not be touched.",
      )
    )
      return;
    setResult(null);
    start(async () => {
      const res = await resyncPlanCalendar(planId);
      if (!res.success) {
        setResult({ ok: false, error: res.error ?? "Re-sync failed" });
        return;
      }
      setResult({
        ok: true,
        inserted: res.inserted,
        deleted: res.deleted,
        unresolved: res.unresolvedFuture,
      });
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Plan edits do not auto-sync to your calendar
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            Past workouts are preserved as history. Re-syncing rebuilds every
            scheduled session from today forward using the current plan.
          </p>
          {result?.ok && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
              Re-synced: {result.inserted} scheduled, {result.deleted} replaced
              {result.unresolved > 0
                ? `, ${result.unresolved} unresolved`
                : ""}
              .
            </p>
          )}
          {result?.ok === false && (
            <p className="mt-2 text-xs text-destructive">{result.error}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onResync}
          disabled={isPending}
          className="shrink-0 border-amber-500/50"
        >
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Re-syncing…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-sync calendar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function OverviewPane({
  plan,
  initialCoachMessages,
}: {
  plan: PlanWithTree;
  initialCoachMessages?: UIMessage[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Philosophy
          </h2>
          <p className="text-sm whitespace-pre-wrap">
            {plan.philosophy || (
              <span className="text-muted-foreground">
                No philosophy set. Ask the coach to draft one, or edit the plan to add context.
              </span>
            )}
          </p>
        </CardContent>
      </Card>
      <PlanCoachChat planId={plan.id} initialMessages={initialCoachMessages} />
    </div>
  );
}

function CalendarPane({
  plan,
  archetypes,
}: {
  plan: PlanWithTree;
  archetypes: ArchetypeOption[];
}) {
  return <PlanCalendar plan={plan} archetypes={archetypes} />;
}

