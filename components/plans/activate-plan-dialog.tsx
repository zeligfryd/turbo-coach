"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activatePlan, previewActivation } from "@/app/plans/actions";
import type { ActivationPreview } from "@/lib/plans/activation";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ActivatePlanDialog({
  planId,
  open,
  onOpenChange,
}: {
  planId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => todayIso());
  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const loadPreview = useCallback(
    (date: string) => {
      setPreview(null);
      setPreviewError(null);
      startPreview(async () => {
        const result = await previewActivation(planId, date);
        if (!result.success) {
          setPreviewError(result.error ?? "Failed to build preview");
          return;
        }
        setPreview(result.preview);
      });
    },
    [planId],
  );

  // Reset + reload whenever the dialog opens so old previews don't linger.
  useEffect(() => {
    if (!open) return;
    const initial = todayIso();
    setStartDate(initial);
    setActivationError(null);
    loadPreview(initial);
  }, [open, loadPreview]);

  async function onActivate() {
    setActivationError(null);
    setIsActivating(true);
    try {
      const result = await activatePlan(planId, startDate);
      if (!result.success) {
        setActivationError(result.error ?? "Activation failed");
        return;
      }
      onOpenChange(false);
      router.refresh();
    } finally {
      setIsActivating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Activate plan
          </DialogTitle>
          <DialogDescription>
            Pick a start date. Scheduled workouts will be created for every
            resolvable cycling item — you can review the breakdown before
            confirming.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="start-date">Start date (week 1 / Monday)</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onBlur={() => loadPreview(startDate)}
              className="w-48"
            />
            <p className="text-xs text-muted-foreground">
              Day-of-week 0 in the plan maps to this date.
            </p>
          </div>

          {isPreviewing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building preview...
            </div>
          )}

          {previewError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {previewError}
            </div>
          )}

          {preview && !isPreviewing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Scheduled" value={preview.resolvedCycling} tone="good" />
                <StatCard
                  label="Unresolved"
                  value={preview.unresolvedCycling}
                  tone={preview.unresolvedCycling > 0 ? "warn" : "neutral"}
                />
                <StatCard label="Skipped" value={preview.nonCyclingSkipped} tone="neutral" />
                <StatCard label="Total items" value={preview.totalItems} tone="neutral" />
              </div>

              <p className="text-sm text-muted-foreground">
                Window: <span className="font-mono">{preview.startDate}</span> →{" "}
                <span className="font-mono">{preview.endDate}</span>
              </p>

              {preview.unresolvedCycling > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    {preview.unresolvedCycling} cycling item
                    {preview.unresolvedCycling === 1 ? "" : "s"} could not be
                    matched
                  </div>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                    These will be skipped. You can edit the items (archetype /
                    duration) and re-activate, or keep going and add workouts
                    manually later.
                  </p>
                </div>
              )}

              {preview.entries.some((e) => e.unresolved && e.kind === "cycling") && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show unresolved items ({preview.unresolvedCycling})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs font-mono max-h-40 overflow-y-auto">
                    {preview.entries
                      .filter((e) => e.unresolved && e.kind === "cycling")
                      .map((e) => (
                        <li key={e.itemId} className="text-muted-foreground">
                          W{e.weekNumber} D{e.dayOfWeek} · {e.archetype ?? "(no archetype)"} ·{" "}
                          {e.unresolvedReason}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {activationError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {activationError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isActivating}
          >
            Cancel
          </Button>
          <Button
            onClick={onActivate}
            disabled={isActivating || isPreviewing || !preview}
          >
            {isActivating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Activating...
              </>
            ) : (
              <>Activate{preview ? ` — ${preview.resolvedCycling} workouts` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
