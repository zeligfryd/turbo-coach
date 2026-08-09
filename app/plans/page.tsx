import Link from "next/link";
import { listPlans } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAN_STATUS_LABELS, type PlanListRow, type PlanStatus } from "@/lib/plans/types";
import { History, Plus, CalendarRange } from "lucide-react";

export default async function PlansPage() {
  const result = await listPlans();

  if (!result.success) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Training plans</h1>
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    );
  }

  const grouped = groupByStatus(result.plans);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Training plans</h1>
          <p className="text-sm text-muted-foreground">
            Author plans in isolation, then activate them to fill your calendar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/plans/adaptations">
              <History className="h-4 w-4" />
              Activity
            </Link>
          </Button>
          <Button asChild>
            <Link href="/plans/new">
              <Plus className="h-4 w-4" />
              New plan
            </Link>
          </Button>
        </div>
      </div>

      {result.plans.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          <PlanSection title="Active" plans={grouped.active} />
          <PlanSection title="Drafts" plans={grouped.draft} />
          <PlanSection title="Archived" plans={grouped.archived} muted />
        </div>
      )}
    </div>
  );
}

function groupByStatus(plans: PlanListRow[]): Record<PlanStatus, PlanListRow[]> {
  const out: Record<PlanStatus, PlanListRow[]> = { draft: [], active: [], archived: [] };
  for (const p of plans) out[p.status].push(p);
  return out;
}

function PlanSection({
  title,
  plans,
  muted,
}: {
  title: string;
  plans: PlanListRow[];
  muted?: boolean;
}) {
  if (plans.length === 0) return null;
  return (
    <section className={muted ? "opacity-75" : undefined}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: PlanListRow }) {
  return (
    <Link href={`/plans/${plan.id}`} className="block group">
      <Card className="h-full transition-colors group-hover:bg-accent">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">{plan.name}</CardTitle>
            <StatusBadge status={plan.status} />
          </div>
          {plan.goal && (
            <CardDescription className="line-clamp-2">{plan.goal}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <CalendarRange className="h-3.5 w-3.5" />
            {plan.duration_weeks} week{plan.duration_weeks === 1 ? "" : "s"}
          </span>
          {plan.start_date && <span>starts {formatDate(plan.start_date)}</span>}
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const color =
    status === "active"
      ? "bg-primary/15 text-primary"
      : status === "draft"
        ? "bg-muted text-muted-foreground"
        : "bg-muted/60 text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {PLAN_STATUS_LABELS[status]}
    </span>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <CalendarRange className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">No plans yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Create your first training plan to structure your weeks.
        </p>
        <Button asChild>
          <Link href="/plans/new">
            <Plus className="h-4 w-4" />
            New plan
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
