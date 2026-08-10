"use client";

/**
 * Modality chips (D5).
 *
 * Filter, not lanes: the grid is seven days plus a week column across a
 * 13-month scroll window, so per-modality rows inside every cell would multiply
 * height everywhere. Chips filter the same date-keyed maps the calendar
 * already builds.
 */

import { HintIcon } from "@/components/training/hint";
import { MODALITY_ICONS, modalityColor } from "@/lib/training/display";
import { MODALITIES, MODALITY_LABELS, type Modality } from "@/lib/training/taxonomy";
import { cn } from "@/lib/utils";

export function ModalityFilter({
  active,
  counts,
  onToggle,
  onlyModality,
}: {
  active: ReadonlySet<Modality>;
  counts?: Partial<Record<Modality, number>>;
  onToggle: (modality: Modality) => void;
  /** Show only this subset — used where bike is irrelevant. */
  onlyModality?: readonly Modality[];
}) {
  const shown = onlyModality ?? MODALITIES;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by modality">
      {shown.map((modality) => {
        const Icon = MODALITY_ICONS[modality];
        const isActive = active.has(modality);
        const color = modalityColor(modality);
        const count = counts?.[modality];

        return (
          <button
            key={modality}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(modality)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium transition-opacity",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !isActive && "opacity-40"
            )}
          >
            <Icon className="h-3 w-3" style={{ color }} aria-hidden="true" />
            {MODALITY_LABELS[modality]}
            {count !== undefined && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
            )}
          </button>
        );
      })}
      <HintIcon term="modality" className="ml-0.5" />
    </div>
  );
}
