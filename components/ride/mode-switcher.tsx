"use client";

import { Button } from "@/components/ui/button";
import type { RideMode } from "@/lib/ride/types";
import { cn } from "@/lib/utils";

type ModeSwitcherProps = {
  mode: RideMode;
  disabled?: boolean;
  onChange: (mode: RideMode) => void;
};

export function ModeSwitcher({ mode, disabled, onChange }: ModeSwitcherProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card p-1">
      <Button
        type="button"
        variant="ghost"
        className={cn("h-8 px-3 text-xs", mode === "erg" && "bg-accent")}
        disabled={disabled}
        onClick={() => onChange("erg")}
      >
        ERG
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={cn("h-8 px-3 text-xs", mode === "free_ride" && "bg-accent")}
        disabled={disabled}
        onClick={() => onChange("free_ride")}
      >
        Free Ride
      </Button>
    </div>
  );
}
