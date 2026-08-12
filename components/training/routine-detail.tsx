"use client";

/**
 * What a routine actually contains.
 *
 * Loaded on expand rather than with the list: the list shows five routines and
 * this is five more queries, none of which matter until someone asks.
 */

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { getRoutineDetail } from "@/app/training/actions";
import { AREA_LABELS, REGION_LABELS, STIMULUS_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import type { RoutineCoverage } from "@/lib/training/types";
import { cn } from "@/lib/utils";

type DetailItem = {
  position: number;
  dose: { display?: string } | null;
  exercise: {
    id: string;
    name: string;
    regions: string[];
    stimulus: string;
    cues: string | null;
    description: string | null;
  } | null;
};

export function RoutineDetail({
  routineId,
  coverageVector,
}: {
  routineId: string;
  coverageVector: RoutineCoverage;
}) {
  const [items, setItems] = useState<DetailItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openExercise, setOpenExercise] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRoutineDetail(routineId).then((result) => {
      if (cancelled) return;
      if (result.success) setItems(result.data as unknown as DetailItem[]);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [routineId]);

  const areas = Object.keys(coverageVector) as FocusArea[];

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      <div className="mb-3">
        <p className="mb-1.5 text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
          Areas covered
        </p>
        <div className="flex flex-wrap gap-1.5">
          {areas.map((area) => {
            const loaded = coverageVector[area]?.loaded;
            return (
              <span
                key={area}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px]",
                  loaded ? "border-border" : "border-dashed text-muted-foreground",
                )}
              >
                {AREA_LABELS[area]}
                {!loaded && " · stretch only"}
              </span>
            );
          })}
          {areas.length === 0 && (
            <span className="text-[11px] text-muted-foreground">No areas tagged.</span>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {!items && !error && <p className="text-xs text-muted-foreground">Loading…</p>}

      {items && (
        <ol className="divide-y divide-border rounded-md border border-border bg-card">
          {items.map((item, index) => {
            const exercise = item.exercise;
            if (!exercise) return null;
            const isOpen = openExercise === exercise.id;
            return (
              <li key={exercise.id + index}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenExercise(isOpen ? null : exercise.id)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="mt-0.5 w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">{exercise.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {exercise.regions.map((r) => REGION_LABELS[r as never] ?? r).join(", ")} ·{" "}
                      {STIMULUS_LABELS[exercise.stimulus as never] ?? exercise.stimulus}
                      {item.dose?.display ? ` · ${item.dose.display}` : ""}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-border px-3 py-2.5 pl-[2.1rem]">
                    {exercise.cues && (
                      <p className="text-[11px] font-medium">{exercise.cues}</p>
                    )}
                    {exercise.description ? (
                      exercise.description.split("\n").map((paragraph, i) => (
                        <p key={i} className="text-[11px] leading-relaxed text-muted-foreground">
                          {paragraph}
                        </p>
                      ))
                    ) : (
                      <p className="text-[11px] text-muted-foreground">No description yet.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
