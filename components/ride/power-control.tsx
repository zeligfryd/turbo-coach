"use client";

import { Button } from "@/components/ui/button";
import type { RideMode } from "@/lib/ride/types";
import { cn } from "@/lib/utils";

type PowerControlProps = {
  mode: RideMode;
  targetPower: number | null;
  onDecreasePower: () => void;
  onIncreasePower: () => void;
};

export function PowerControl({
  mode,
  targetPower,
  onDecreasePower,
  onIncreasePower,
}: PowerControlProps) {
  const isFreeRide = mode === "free_ride";

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-4 transition-opacity",
        isFreeRide && "opacity-50",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Controls</h3>
        <span className="text-xs text-muted-foreground">Power adjustment</span>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onDecreasePower}
          disabled={isFreeRide}
        >
          -
        </Button>

        <div className="min-w-28 text-center">
          <p className="text-lg font-semibold">
            {targetPower !== null ? `${targetPower} W` : "--"}
          </p>
          <p className="text-xs text-muted-foreground">Target Power</p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onIncreasePower}
          disabled={isFreeRide}
        >
          +
        </Button>
      </div>

      {isFreeRide ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Free ride mode: trainer targets are not controlled here.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          ERG mode: controls can be used for temporary manual override.
        </p>
      )}
    </div>
  );
}
