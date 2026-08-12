"use client";

/**
 * Drop a saved week onto a real week.
 *
 * Reached from the week row in the calendar, which is the only place a whole
 * week is addressable. Repeating is offered here rather than stored on the
 * template: "every other week" is a property of this application, not of the
 * week itself, and keeping it here means there is no subscription to later
 * cancel — what you get is blocks, which behave like any others.
 */

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { applyWeekTemplateAction, getWeekTemplates } from "@/app/training/actions";
import type { WeekTemplate } from "@/lib/training/service/week-templates";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REPEATS = [1, 2, 4];

function weekLabel(weekStart: string): string {
  return new Date(weekStart + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function ApplyWeekDialog({
  weekStart,
  onApplied,
}: {
  weekStart: string;
  onApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(1);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    getWeekTemplates().then((r) => {
      if (r.success) {
        setTemplates(r.data);
        setSelected((current) => current ?? r.data[0]?.id ?? null);
      }
    });
  }, [open]);

  const apply = () => {
    if (!selected) return;
    startTransition(async () => {
      const response = await applyWeekTemplateAction(selected, weekStart, repeat);
      if (!response.success) {
        setError(response.error);
        return;
      }
      const { created, skipped } = response.data;
      // Saying what was skipped matters: a silent "0 added" on a second apply
      // looks broken, when it actually means the week was already there.
      setResult(
        created === 0
          ? "Everything in that week was already scheduled."
          : `Added ${created} session${created === 1 ? "" : "s"}` +
              (skipped > 0 ? `, skipped ${skipped} already there.` : "."),
      );
      onApplied?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Apply a typical week to the week of ${weekLabel(weekStart)}`}
          className="flex min-h-[28px] items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Apply week
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply a typical week</DialogTitle>
          <DialogDescription>Week of {weekLabel(weekStart)}</DialogDescription>
        </DialogHeader>

        {templates.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No typical weeks yet — build one and it will show up here.
            </p>
            <Link
              href="/training"
              className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Build a week
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-1.5">
              {templates.map((template) => {
                const days = [...new Set(template.slots.map((slot) => slot.weekday))].sort();
                return (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(template.id)}
                      aria-pressed={template.id === selected}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        template.id === selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      <span className="block text-sm font-medium">{template.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {template.slots.length} session{template.slots.length === 1 ? "" : "s"} ·{" "}
                        {days.map((day) => DAYS[day]).join(", ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Repeat for</p>
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                {REPEATS.map((weeks) => (
                  <button
                    key={weeks}
                    type="button"
                    aria-pressed={repeat === weeks}
                    onClick={() => setRepeat(weeks)}
                    className={cn(
                      "min-h-[36px] border-r border-border px-3 text-xs transition-colors last:border-r-0",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      repeat === weeks
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {weeks === 1 ? "This week" : `${weeks} weeks`}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
            {result && <p className="text-xs text-muted-foreground">{result}</p>}

            <button
              type="button"
              onClick={apply}
              disabled={pending || !selected}
              className="min-h-[44px] w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add to calendar"}
            </button>

            <Link
              href="/training"
              className="block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Edit typical weeks
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
