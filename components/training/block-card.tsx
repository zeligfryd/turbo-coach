"use client";

/**
 * A non-bike session on the calendar.
 *
 * Rides keep their existing card (mini intensity chart, TSS); this is
 * everything else. Ghost blocks are visibly distinct and carry their own
 * confirm/dismiss, because a suggestion must never quietly become a commitment.
 */

import { Check, Circle, CircleDotDashed, GripVertical, X } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";

import { Hint } from "@/components/training/hint";
import { MODALITY_ICONS, formatMinutes, modalityColor } from "@/lib/training/display";
import { AREA_LABELS, MODALITY_LABELS } from "@/lib/training/taxonomy";
import type { PlannedItem } from "@/lib/training/types";
import { cn } from "@/lib/utils";

export type BlockCardHandlers = {
  onOpen?: (item: PlannedItem) => void;
  onTick?: (item: PlannedItem) => void;
  onRemove?: (item: PlannedItem) => void;
  onAccept?: (item: PlannedItem) => void;
  onDismiss?: (item: PlannedItem) => void;
};

function StatusMark({ status }: { status: PlannedItem["status"] }) {
  if (status === "done") return <Check className="h-3 w-3 shrink-0 text-[hsl(var(--coverage-fresh))]" />;
  if (status === "partial")
    return <CircleDotDashed className="h-3 w-3 shrink-0 text-[hsl(var(--coverage-due))]" />;
  if (status === "skipped") return <X className="h-3 w-3 shrink-0 text-muted-foreground" />;
  return <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40" />;
}

export function BlockCard({
  item,
  handlers = {},
  compact = false,
}: {
  item: PlannedItem;
  handlers?: BlockCardHandlers;
  compact?: boolean;
}) {
  const Icon = MODALITY_ICONS[item.modality];
  const isGhost = item.status === "ghost";
  const isDone = item.status === "done" || item.status === "skipped";
  const color = modalityColor(item.modality);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block:${item.id}`,
    disabled: isGhost,
  });

  const meta = [
    formatMinutes(item.plannedDurationMin),
    item.plannedRpe ? `RPE ${item.plannedRpe}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={setNodeRef}
      style={{ borderLeftColor: color }}
      className={cn(
        "group/block relative rounded-md border border-l-[3px] bg-background px-1.5 py-1 text-xs shadow-sm transition-shadow",
        "hover:ring-1 hover:ring-primary/40",
        isDragging && "opacity-30",
        isGhost && "border-dashed bg-transparent",
        isDone && "opacity-60"
      )}
    >
      <div className="flex items-start gap-1.5">
        {!isGhost && (
          <div
            className="-ml-0.5 flex cursor-grab items-center self-stretch text-muted-foreground/30 transition-colors hover:text-muted-foreground active:cursor-grabbing touch-none"
            {...listeners}
            {...attributes}
            aria-label={`Move ${item.name}`}
          >
            <GripVertical className="h-3 w-3" />
          </div>
        )}

        <button
          type="button"
          onClick={() => handlers.onOpen?.(item)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1">
            <Icon className="h-3 w-3 shrink-0" style={{ color }} aria-hidden="true" />
            <span
              className={cn(
                "text-[12px] font-semibold leading-snug line-clamp-2",
                item.status === "done" && "line-through decoration-1"
              )}
            >
              {item.name}
            </span>
            {!isGhost && <StatusMark status={item.status} />}
          </div>
          <div className="text-[11px] tabular-nums text-muted-foreground">
            {MODALITY_LABELS[item.modality]}
            {meta && ` · ${meta}`}
          </div>
          {!compact && item.areaTags.length > 0 && (
            <div className="mt-0.5 line-clamp-2 text-[10px] uppercase tracking-wide text-muted-foreground/80">
              {item.areaTags.map((area) => AREA_LABELS[area]).join(" · ")}
            </div>
          )}
        </button>

      </div>

      {!isGhost && (handlers.onTick || handlers.onRemove) && (
        <div className="absolute right-0.5 top-0.5 flex gap-0.5 rounded bg-background/95 opacity-0 shadow-sm transition-opacity group-hover/block:opacity-100 focus-within:opacity-100">
          {handlers.onTick && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handlers.onTick?.(item);
              }}
              aria-label={
                item.status === "done" ? `Mark ${item.name} not done` : `Mark ${item.name} done`
              }
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <Check className="h-3 w-3" />
            </button>
          )}
          {handlers.onRemove && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handlers.onRemove?.(item);
              }}
              aria-label={`Remove ${item.name}`}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {isGhost && (
        <div className="mt-1.5 flex items-center gap-1">
          <Hint term="ghost" underline={false} className="mr-auto text-[9px] uppercase tracking-wide text-muted-foreground">
            Suggested
          </Hint>
          <button
            type="button"
            onClick={() => handlers.onAccept?.(item)}
            style={{ color, borderColor: color }}
            className="rounded border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => handlers.onDismiss?.(item)}
            className="rounded border border-border px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/** Non-interactive copy shown while dragging. */
export function BlockDragOverlay({ item }: { item: PlannedItem }) {
  const Icon = MODALITY_ICONS[item.modality];
  const color = modalityColor(item.modality);
  return (
    <div
      style={{ borderLeftColor: color }}
      className="w-[180px] rounded-md border border-l-[3px] bg-background px-1.5 py-1 text-xs opacity-90 shadow-lg ring-2 ring-primary/50"
    >
      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" style={{ color }} aria-hidden="true" />
        <span className="truncate text-[11px] font-bold leading-tight">{item.name}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {MODALITY_LABELS[item.modality]} · {formatMinutes(item.plannedDurationMin)}
      </div>
    </div>
  );
}
