"use client";

/**
 * The coverage view — six focus areas, one target each (D8).
 *
 * This is the answer to *remembering*: it turns "I should do more prehab" into
 * "thoracic spine, nine days". Six rows rather than seventy cells, because a
 * profile demanding ~29 stimuli a week can only ever be red, and a permanently
 * red dashboard is one you stop opening.
 */

import { useState, useTransition } from "react";
import { AlertCircle, Check, Clock, Minus, RotateCcw } from "lucide-react";

import { Hint, InfoPanel } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import {
  AREA_LABELS,
  REGION_LABELS,
  AREA_REGIONS,
  DEFAULT_AREA_TARGET_DAYS,
  type FocusArea,
} from "@/lib/training/taxonomy";
import { COVERAGE_STATUS_LABELS, coverageColor, formatDaysAgo } from "@/lib/training/display";
import type { AreaCoverage, CoverageStatus } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const STATUS_ICON = {
  fresh: Check,
  due: Clock,
  overdue: AlertCircle,
  never: Minus,
} as const;

const STATUS_HINT = {
  fresh: "coverage_fresh",
  due: "coverage_due",
  overdue: "coverage_overdue",
  never: "coverage_never",
} as const;

function StatusBadge({ status }: { status: CoverageStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: coverageColor(status) }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {COVERAGE_STATUS_LABELS[status]}
    </span>
  );
}

export function CoverageView({
  coverage,
  onSetTarget,
  onResetAll,
}: {
  coverage: AreaCoverage[];
  onSetTarget: (area: FocusArea, targetDays: number) => Promise<void>;
  onResetAll: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<FocusArea | null>(null);
  const [isPending, startTransition] = useTransition();

  const anyOverridden = coverage.some((area) => !area.isDefault);

  return (
    <div className="space-y-4">
      <InfoPanel id="coverage" title="How to read this">
        <p>
          Each row is a part of the body, with how long since anything covered it and how often you
          want to. Green is fresh, amber is due, red is past its interval.
        </p>
        <p>
          One or two red rows in a heavy week is normal. All six means the targets need adjusting,
          not that you have failed.
        </p>
      </InfoPanel>

      <div className="rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[minmax(160px,1.1fr)_minmax(120px,1.4fr)_110px_130px] gap-4 border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-[0.11em] text-muted-foreground sm:grid">
          <span>
            <Hint term="focus_area" underline={false}>
              Focus area
            </Hint>
          </span>
          <span>
            <Hint term="staleness" underline={false}>
              Time since last
            </Hint>
          </span>
          <span>State</span>
          <span>
            <Hint term="target_interval" underline={false}>
              Target
            </Hint>
          </span>
        </div>

        {coverage.map((area) => {
          const ratio = area.ratio ?? 0;
          const pct = Math.min(100, ratio * 100);
          const color = coverageColor(area.status);
          const isEditing = editing === area.area;

          return (
            <div
              key={area.area}
              className="grid grid-cols-1 gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(160px,1.1fr)_minmax(120px,1.4fr)_110px_130px] sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{AREA_LABELS[area.area]}</span>
                  {area.stretchOnly && (
                    <Hint
                      term="stretch_only"
                      underline={false}
                      className="rounded-full border border-dashed px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                    >
                      <span style={{ color: coverageColor("due") }}>stretch only</span>
                    </Hint>
                  )}
                </div>
                {!(AREA_REGIONS[area.area].length === 1 &&
                   REGION_LABELS[AREA_REGIONS[area.area][0]] === AREA_LABELS[area.area]) && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {AREA_REGIONS[area.area].map((r) => REGION_LABELS[r]).join(" · ")}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={cn("block h-full rounded-full", ratio > 1 && "animate-none")}
                    style={{
                      width: `${area.ratio === null ? 0 : Math.max(4, pct)}%`,
                      backgroundColor: color,
                      // Past the target the bar is full; the hatch says "over"
                      // without needing a longer bar.
                      backgroundImage:
                        ratio > 1
                          ? `repeating-linear-gradient(135deg, ${color} 0 5px, transparent 5px 10px)`
                          : undefined,
                    }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {formatDaysAgo(area.daysSince)}
                </span>
              </div>

              <div>
                <Hint term={STATUS_HINT[area.status]} underline={false}>
                  <StatusBadge status={area.status} />
                </Hint>
              </div>

              <div className="flex items-center gap-1.5">
                {isEditing ? (
                  <TargetStepper
                    value={area.targetDays}
                    disabled={isPending}
                    onChange={(next) => {
                      startTransition(async () => {
                        await onSetTarget(area.area, next);
                      });
                    }}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(area.area)}
                    className="rounded-md px-2 py-1 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    every {area.targetDays} d
                    {area.isDefault && (
                      <span className="ml-1.5 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                        default
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {anyOverridden && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(async () => void (await onResetAll()))}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        </div>
      )}
    </div>
  );
}

function TargetStepper({
  value,
  disabled,
  onChange,
  onDone,
}: {
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  onDone: () => void;
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-border">
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Decrease target interval"
        className="h-7 w-7 text-sm hover:bg-accent disabled:opacity-40"
      >
        −
      </button>
      <span className="w-12 border-x border-border px-1 py-1 text-center text-xs tabular-nums">
        {value} d
      </span>
      <button
        type="button"
        disabled={disabled || value >= 60}
        onClick={() => onChange(value + 1)}
        aria-label="Increase target interval"
        className="h-7 w-7 text-sm hover:bg-accent disabled:opacity-40"
      >
        +
      </button>
      <button
        type="button"
        onClick={onDone}
        className="h-7 px-2 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-accent"
      >
        done
      </button>
    </span>
  );
}

export { DEFAULT_AREA_TARGET_DAYS };
