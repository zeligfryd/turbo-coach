"use client";

import { Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RaceEvent } from "@/lib/race/types";

interface PeriodisationCtaProps {
  race: RaceEvent;
}

export function PeriodisationCta({ race }: PeriodisationCtaProps) {
  // For now, always show the "no plan" state since training plans aren't implemented yet
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Calendar className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Training Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Build a structured training plan targeting {race.name} with periodised base, build, and taper phases.
          </p>
          <Button variant="outline" size="sm" className="mt-3" disabled>
            <ArrowRight className="h-4 w-4" />
            Build training plan — coming soon
          </Button>
        </div>
      </div>
    </div>
  );
}
