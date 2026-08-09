import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdaptationFeed } from "@/components/plans/adaptation-feed";
import { listAllAdaptations, listPlans } from "../actions";

export default async function AdaptationsFeedPage() {
  const [feedResult, plansResult] = await Promise.all([
    listAllAdaptations({ limit: 50 }),
    listPlans(),
  ]);

  if (!feedResult.success) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-destructive">{feedResult.error}</p>
      </div>
    );
  }

  const plans = plansResult.success
    ? plansResult.plans.map((p) => ({ id: p.id, name: p.name }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/plans" aria-label="Back to plans">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">
            Every edit across your plans — by you, the coach, or auto — in one
            place.
          </p>
        </div>
      </div>

      <AdaptationFeed
        initialEntries={feedResult.entries}
        initialCursor={feedResult.nextCursor}
        plans={plans}
      />
    </div>
  );
}
