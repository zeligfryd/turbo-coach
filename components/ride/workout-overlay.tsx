"use client";

import type { RideMode, WorkoutExecutionState } from "@/lib/ride/types";
import { cn } from "@/lib/utils";

type WorkoutOverlayProps = {
  executionState: WorkoutExecutionState | null;
  mode: RideMode;
};

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function WorkoutOverlay({ executionState, mode }: WorkoutOverlayProps) {
  if (!executionState || !executionState.position) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        No workout loaded. You can ride in Free Ride mode or load a workout for ERG control.
      </div>
    );
  }

  const { position, nextInterval } = executionState;
  const progressPct = Math.round(position.progress * 100);

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Workout Progress</h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            mode === "erg" ? "bg-emerald-600/20 text-emerald-400" : "bg-amber-500/20 text-amber-400",
          )}
        >
          {mode === "erg" ? "ERG Active" : "ERG Off (Free Ride)"}
        </span>
      </div>

      <div className="mb-2">
        <p className="text-sm font-medium">{position.interval.name ?? `Interval ${position.intervalIndex + 1}`}</p>
        <p className="text-xs text-muted-foreground">
          {formatSeconds(position.intervalRemainingSeconds)} remaining
          {" · "}
          Target {position.targetPowerWatts ?? "--"} W
        </p>
      </div>

      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{progressPct}% complete</p>

      <div className="text-xs text-muted-foreground">
        {nextInterval ? (
          <>
            Next: <span className="text-foreground">{nextInterval.name ?? "Untitled interval"}</span>
          </>
        ) : (
          <span className="text-foreground">Final interval</span>
        )}
      </div>
    </div>
  );
}
