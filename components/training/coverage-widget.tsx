"use client";

/**
 * Compact coverage, for the dashboard. Six dots and the next routine — enough
 * to notice drift without opening anything.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { getTrainingOverview, type TrainingOverview } from "@/app/training/actions";
import { AREA_LABELS } from "@/lib/training/taxonomy";
import { COVERAGE_STATUS_LABELS, coverageColor, formatDaysAgo } from "@/lib/training/display";

export function CoverageWidget() {
  const [overview, setOverview] = useState<TrainingOverview | null>(null);

  useEffect(() => {
    getTrainingOverview().then((result) => {
      if (result.success) setOverview(result.data);
    });
  }, []);

  if (!overview) return null;

  const next = overview.routines[0];
  const behind = overview.coverage.filter(
    (area) => area.status === "overdue" || area.status === "never",
  );

  return (
    <Link
      href="/training"
      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Coverage</h2>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <ul className="mt-3 space-y-1.5">
        {overview.coverage.map((area) => (
          <li key={area.area} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: coverageColor(area.status) }}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{AREA_LABELS[area.area]}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatDaysAgo(area.daysSince)}
            </span>
            <span className="sr-only">{COVERAGE_STATUS_LABELS[area.status]}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
        {behind.length === 0
          ? "Everything inside its interval."
          : `${behind.length} of 6 areas past target.`}
        {next && next.fixesAreas.length > 0 && <> Next: {next.name}.</>}
      </p>
    </Link>
  );
}
