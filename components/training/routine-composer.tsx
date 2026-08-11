"use client";

/**
 * Build a routine from the bank.
 *
 * The bank re-ranks stalest-first and the running totals update as you add;
 * the ordering is guidance, the clicking is control. Nothing is generated.
 */

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Check, Clock, Minus, Plus, X } from "lucide-react";

import { Hint } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coverageColor, formatMinutes } from "@/lib/training/display";
import {
  AREA_LABELS,
  FOCUS_AREAS,
  REGION_LABELS,
  STIMULUS_LABELS,
  type FocusArea,
} from "@/lib/training/taxonomy";
import type { AreaCoverage, CoverageStatus } from "@/lib/training/types";
import type { BankExercise } from "@/app/training/actions";
import { cn } from "@/lib/utils";

const STATUS_ICON = { fresh: Check, due: Clock, overdue: AlertCircle, never: Minus } as const;

/** Rough minutes for one exercise, used only for the running total. */
function estimateMinutes(exercise: BankExercise): number {
  const dose = exercise.defaultDose as
    | { sets?: number; holdSeconds?: number; reps?: number; perSide?: boolean }
    | null;
  if (!dose) return 2;
  const sets = dose.sets ?? 2;
  const sides = dose.perSide ? 2 : 1;
  const seconds = dose.holdSeconds ? dose.holdSeconds * sets * sides : (dose.reps ?? 10) * 3 * sets * sides;
  // Round up to the half minute; a routine of eight exercises should not claim
  // false precision.
  return Math.max(1, Math.round((seconds / 60 + 0.3) * 2) / 2);
}

export type ComposerSeed = {
  id: string;
  name: string;
  estDurationMin: number | null;
  exerciseIds: string[];
};

export function RoutineComposer({
  exercises,
  coverage,
  seed,
  onSave,
  onCancel,
}: {
  exercises: BankExercise[];
  coverage: AreaCoverage[];
  /** Provided when editing an existing routine; absent when composing a new one. */
  seed?: ComposerSeed;
  onSave: (input: { name: string; estDurationMin: number; items: { exerciseId: string }[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(seed?.name ?? "");
  const [targetMinutes, setTargetMinutes] = useState(seed?.estDurationMin ?? 12);
  const [focusAreas, setFocusAreas] = useState<Set<FocusArea>>(new Set());
  const [picked, setPicked] = useState<string[]>(seed?.exerciseIds ?? []);
  const [isPending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const visible = useMemo(
    () => (focusAreas.size === 0 ? exercises : exercises.filter((e) => focusAreas.has(e.area))),
    [exercises, focusAreas],
  );

  const chosen = picked.map((id) => byId.get(id)!).filter(Boolean);
  const totalMinutes = chosen.reduce((sum, e) => sum + estimateMinutes(e), 0);
  const overTarget = totalMinutes > targetMinutes;

  // Which areas this routine would touch, and whether anything loads them —
  // the same shape stored on the routine when it is saved.
  const covered = useMemo(() => {
    const map = new Map<FocusArea, boolean>();
    for (const exercise of chosen) {
      map.set(exercise.area, (map.get(exercise.area) ?? false) || exercise.loaded);
    }
    return map;
  }, [chosen]);

  const statusByArea = useMemo(
    () => new Map(coverage.map((c) => [c.area, c.status])),
    [coverage],
  );

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const canSave = name.trim().length > 0 && picked.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      {/* ── Bank ── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Exercises</h3>
          <span className="text-[11px] text-muted-foreground">
            {visible.length} shown · stalest first
          </span>
        </div>

        <div className="border-b border-border px-4 py-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
            Filter by area
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_AREAS.map((area) => {
              const isActive = focusAreas.has(area);
              const status = statusByArea.get(area);
              return (
                <button
                  key={area}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() =>
                    setFocusAreas((current) => {
                      const next = new Set(current);
                      if (next.has(area)) next.delete(area);
                      else next.add(area);
                      return next;
                    })
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-foreground bg-accent font-medium"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ backgroundColor: coverageColor(status ?? "never") }}
                    aria-hidden="true"
                  />
                  {AREA_LABELS[area]}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
          {visible.map((exercise) => {
            const isPicked = picked.includes(exercise.id);
            const StatusIcon = STATUS_ICON[exercise.areaStatus as CoverageStatus];
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => toggle(exercise.id)}
                  aria-pressed={isPicked}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isPicked && "bg-accent/60"
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {isPicked ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{exercise.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {exercise.regions.map((r) => REGION_LABELS[r]).join(", ")} ·{" "}
                      {STIMULUS_LABELS[exercise.stimulus]}
                      {(exercise.defaultDose as { display?: string } | null)?.display
                        ? ` · ${(exercise.defaultDose as { display: string }).display}`
                        : ""}
                    </span>
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums"
                    style={{ color: coverageColor(exercise.areaStatus as CoverageStatus) }}
                  >
                    <StatusIcon className="h-3 w-3" aria-hidden="true" />
                    {exercise.areaRatio === null ? "never" : `${exercise.areaRatio.toFixed(1)}×`}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No exercises match that filter.
            </li>
          )}
        </ul>
      </div>

      {/* ── The routine being built ── */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2">
          <Label htmlFor="routine-name">Name</Label>
          <Input
            id="routine-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Evening 10"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="routine-target">Target length</Label>
          <div className="flex items-center gap-2">
            <Input
              id="routine-target"
              type="number"
              min={1}
              max={120}
              value={targetMinutes}
              onChange={(event) => setTargetMinutes(Number(event.target.value) || 1)}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
              {picked.length} exercises
            </span>
            <span
              className="text-xs tabular-nums"
              style={{ color: overTarget ? coverageColor("due") : undefined }}
            >
              ~{formatMinutes(Math.round(totalMinutes))} of {targetMinutes}m
            </span>
          </div>
          <span className="block h-1.5 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${Math.min(100, (totalMinutes / targetMinutes) * 100)}%`,
                backgroundColor: overTarget ? coverageColor("due") : "hsl(var(--foreground))",
              }}
            />
          </span>
        </div>

        <ol className="min-h-[6rem] divide-y divide-border rounded-md border border-border">
          {chosen.map((exercise, index) => (
            <li key={exercise.id} className="flex items-center gap-2 px-2.5 py-2">
              <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{exercise.name}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {(exercise.defaultDose as { display?: string } | null)?.display ?? ""}
              </span>
              <button
                type="button"
                onClick={() => toggle(exercise.id)}
                aria-label={`Remove ${exercise.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
          {chosen.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              Pick exercises from the list. They keep the order you add them in.
            </li>
          )}
        </ol>

        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.11em] text-muted-foreground">
            Areas covered
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_AREAS.map((area) => {
              const isCovered = covered.has(area);
              const isLoadedArea = covered.get(area) === true;
              return (
                <span
                  key={area}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                    !isCovered && "border-border text-muted-foreground/60",
                    isCovered && isLoadedArea && "border-foreground bg-accent font-medium",
                    isCovered && !isLoadedArea && "border-dashed"
                  )}
                  style={
                    isCovered && !isLoadedArea ? { color: coverageColor("due") } : undefined
                  }
                >
                  {AREA_LABELS[area]}
                </span>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Dashed means{" "}
            <Hint term="stretch_only" underline>
              stretched but not loaded
            </Hint>
            .
          </p>
        </div>

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            className="flex-1"
            disabled={!canSave || isPending}
            onClick={() =>
              startTransition(async () => {
                await onSave({
                  name: name.trim(),
                  estDurationMin: Math.max(1, Math.round(totalMinutes)),
                  items: picked.map((exerciseId) => ({ exerciseId })),
                });
              })
            }
          >
            {seed ? "Save changes" : "Save routine"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
