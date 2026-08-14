"use client";

/**
 * Deriving next week's workout from this week's.
 *
 * Three signed operators and a live preview. The preview is not decoration: it
 * is the check that the operator did what you meant, and the only place a
 * mis-labelled interval becomes visible before the result is committed. Nothing
 * is written until "Use this".
 */

import { useEffect, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewDerivedWorkout, type DerivePreview } from "@/app/plans/composer-actions";
import type { VariationOps } from "@/lib/workouts/variation";
import { cn } from "@/lib/utils";

type OpKey = keyof VariationOps;

const OPERATORS: { key: OpKey; label: string; unit: string; step: number }[] = [
  { key: "intensityPercent", label: "Work intensity", unit: "%", step: 1 },
  { key: "minutesPerWorkInterval", label: "Length of each work interval", unit: " min", step: 1 },
  { key: "workIntervalCount", label: "Number of work intervals", unit: "", step: 1 },
];

export function DeriveDialog({
  open,
  sourceName,
  sourceWorkoutId,
  dayLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sourceName: string;
  sourceWorkoutId: string;
  dayLabel: string;
  onClose: () => void;
  onConfirm: (ops: VariationOps) => Promise<void>;
}) {
  const [ops, setOps] = useState<VariationOps>({});
  const [preview, setPreview] = useState<DerivePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setOps({});
      setPreview(null);
      setError(null);
    }
  }, [open]);

  // Preview on every change, so the numbers below always describe the controls
  // above rather than the state they were in a moment ago.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewDerivedWorkout({ sourceWorkoutId, ops }).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setPreview(result.preview);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, sourceWorkoutId, ops]);

  const nudge = (key: OpKey, delta: number) =>
    setOps((current) => {
      const next = (current[key] ?? 0) + delta;
      const updated = { ...current };
      if (next === 0) delete updated[key];
      else updated[key] = next;
      return updated;
    });

  const anyOp = Object.values(ops).some(Boolean);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Derive from the week above</DialogTitle>
          <DialogDescription>
            {sourceName} → {dayLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {OPERATORS.map(({ key, label, unit, step }) => {
            const value = ops[key] ?? 0;
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
                  value !== 0 ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <span className="text-sm">{label}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Decrease ${label}`}
                    onClick={() => nudge(key, -step)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-14 text-center text-sm font-semibold tabular-nums">
                    {value > 0 ? "+" : ""}
                    {value}
                    {unit}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${label}`}
                    onClick={() => nudge(key, step)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {preview && (
          <div className="rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.11em] text-muted-foreground">Result</p>
            <p className="mt-0.5 text-sm font-semibold">{preview.name}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {preview.durationMin} min · {preview.avgIntensity}% average
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={pending || !anyOp}
          onClick={() => startTransition(async () => onConfirm(ops))}
          className="min-h-[44px] w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {anyOp ? "Use this" : "Change something to derive"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
