"use client";

/**
 * /today — the only mobile-first surface (D6).
 *
 * Planning is a desktop task; logging is not. This moved forward from v3
 * because everything downstream depends on things actually being ticked, and
 * they will not be ticked from a laptop.
 *
 * Deliberately thin: what is due, one tap to log it, an optional sRPE, and the
 * stalest routine at the top so the common case needs no decision at all.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, CircleDotDashed, X } from "lucide-react";

import { Hint } from "@/components/training/hint";
import { NextRoutineCallout, RoutineRotation } from "@/components/training/routine-rotation";
import {
  clearCompletionAction,
  getTrainingOverview,
  getTrainingWindow,
  logRoutineNowAction,
  recordCompletionAction,
  type TrainingOverview,
} from "@/app/training/actions";
import { MODALITY_ICONS, formatMinutes, modalityColor } from "@/lib/training/display";
import { MODALITY_LABELS, DAY_PART_LABELS } from "@/lib/training/taxonomy";
import type { BlockStatus } from "@/lib/training/taxonomy";
import type { PlannedItem } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const STATUS_ACTIONS = [
  { status: "done" as const, label: "Done", Icon: Check },
  { status: "partial" as const, label: "Partial", Icon: CircleDotDashed },
  { status: "skipped" as const, label: "Skip", Icon: X },
];

export function TodayClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [items, setItems] = useState<PlannedItem[]>([]);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const [windowResult, overviewResult] = await Promise.all([
      getTrainingWindow(today, today),
      getTrainingOverview(),
    ]);
    if (windowResult.success) setItems(windowResult.data.items);
    if (overviewResult.success) setOverview(overviewResult.data);
    setIsLoading(false);
  }, [today]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setStatus = (item: PlannedItem, status: BlockStatus) => {
    startTransition(async () => {
      // Tapping the current status again clears it — the undo path matters on a
      // phone, where a mis-tap is routine.
      if (item.status === status) await clearCompletionAction(item.id);
      else await recordCompletionAction(item.id, { status: status as "done" | "partial" | "skipped" });
      await refresh();
    });
  };

  const setRpe = (item: PlannedItem, srpe: number) => {
    startTransition(async () => {
      await recordCompletionAction(item.id, {
        status: item.status === "partial" ? "partial" : "done",
        actualDurationMin: item.plannedDurationMin,
        srpe,
      });
      await refresh();
    });
  };

  const handleLogNow = async (routineId: string) => {
    await logRoutineNowAction(routineId);
    await refresh();
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Rides are shown for context but logged through the cycling flow.
  const loggable = items.filter((item) => item.editableHere);
  const rides = items.filter((item) => !item.editableHere);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
      </header>

      {overview && overview.routines.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested
            </h2>
          </div>
          <NextRoutineCallout routine={overview.routines[0]} />
          <RoutineRotation routines={overview.routines.slice(0, 2)} onLogNow={handleLogNow} compact />
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Due today · {loggable.length}
        </h2>

        {loggable.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing scheduled off the bike today.
          </p>
        )}

        {loggable.map((item) => {
          const Icon = MODALITY_ICONS[item.modality];
          const color = modalityColor(item.modality);
          const showRpe = item.status === "done" || item.status === "partial";

          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
              style={{ borderLeftColor: color, borderLeftWidth: 3 }}
            >
              <div className="flex items-start gap-2.5 px-3.5 py-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {MODALITY_LABELS[item.modality]} · {formatMinutes(item.plannedDurationMin)} ·{" "}
                    <Hint term="day_part" underline={false}>
                      {DAY_PART_LABELS[item.dayPart]}
                    </Hint>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 border-t border-border">
                {STATUS_ACTIONS.map(({ status, label, Icon: ActionIcon }) => {
                  const isActive = item.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setStatus(item, status)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 border-r border-border py-3 text-xs font-medium last:border-r-0 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}
                      style={
                        isActive
                          ? {
                              backgroundColor:
                                status === "skipped"
                                  ? "hsl(var(--secondary))"
                                  : `color-mix(in srgb, ${color} 12%, transparent)`,
                            }
                          : undefined
                      }
                    >
                      <ActionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {showRpe && (
                <div className="space-y-2 border-t border-border px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <Hint term="srpe" className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      Session RPE
                    </Hint>
                    <span className="text-[10px] text-muted-foreground">optional</span>
                  </div>
                  <div className="grid grid-cols-10 gap-1">
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRpe(item, value)}
                        aria-label={`RPE ${value}`}
                        className="aspect-square rounded border border-border text-[10px] tabular-nums text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {rides.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            On the bike
          </h2>
          {rides.map((ride) => {
            const Icon = MODALITY_ICONS.bike;
            return (
              <div
                key={ride.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-3"
              >
                <Icon
                  className="h-4 w-4 shrink-0"
                  style={{ color: modalityColor("bike") }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{ride.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatMinutes(ride.plannedDurationMin)}
                    {ride.plannedTss ? ` · TSS ${ride.plannedTss}` : ""}
                  </p>
                </div>
                <Hint term="bike_anchor" underline={false} className="text-[10px] text-muted-foreground">
                  ride
                </Hint>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
