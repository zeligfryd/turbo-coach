"use client";

/**
 * What is on today, with a tick against each one.
 *
 * The screen used to lead with a suggestion whether or not you had already
 * planned your day — so a day with three sessions on it showed you a fourth
 * thing instead of the three. If you have decided what today is, the job here
 * is to let you record it, not to propose an alternative.
 *
 * Rides that have already synced are shown but not tickable: they are a record
 * of what happened, and a checkbox implying you could un-happen them would be a
 * lie. Everything you scheduled — rides and off-bike sessions alike — can be
 * ticked and unticked.
 */

import { useTransition } from "react";
import { Check, Undo2 } from "lucide-react";

import { MODALITY_ICONS, formatMinutes, modalityColor } from "@/lib/training/display";
import { isCompleted } from "@/lib/training/taxonomy";
import type { PlannedItem } from "@/lib/training/types";
import { cn } from "@/lib/utils";

/** Rides imported from the sync arrive with this id prefix — see read.ts. */
export function isSyncedRide(item: PlannedItem): boolean {
  return item.id.startsWith("activity:");
}

export function TodaySessions({
  items,
  onToggle,
}: {
  items: PlannedItem[];
  onToggle: (item: PlannedItem, done: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = MODALITY_ICONS[item.modality];
        const color = modalityColor(item.modality);
        const done = isCompleted(item.status);
        const synced = isSyncedRide(item);

        const meta = [
          formatMinutes(item.plannedDurationMin),
          item.plannedTss ? `TSS ${item.plannedTss}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <li
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-card px-4 py-3",
              done ? "border-border/60" : "border-border",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />

            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm font-semibold leading-tight",
                  done && "text-muted-foreground line-through",
                )}
              >
                {item.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {meta}
                {synced && " · recorded"}
              </span>
            </span>

            {synced ? (
              // Nothing to tick: it is already a fact.
              <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Recorded" />
            ) : (
              <button
                type="button"
                onClick={() => startTransition(async () => onToggle(item, !done))}
                disabled={pending}
                aria-pressed={done}
                aria-label={done ? `Mark ${item.name} as not done` : `Mark ${item.name} as done`}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:opacity-50",
                  // A finished session should be the quiet one. Filling it with
                  // the primary colour made "done" the loudest thing on the
                  // screen and left the thing you still have to do looking
                  // secondary — the emphasis exactly backwards.
                  done
                    ? "border-transparent bg-secondary text-muted-foreground hover:text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {done ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
