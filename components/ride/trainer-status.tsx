"use client";

import { cn } from "@/lib/utils";

type TrainerStatusProps = {
  connected: boolean;
  deviceName?: string | null;
};

export function TrainerStatus({ connected, deviceName }: TrainerStatusProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            connected ? "bg-emerald-500" : "bg-muted-foreground/60",
          )}
        />
        <span className="font-medium">{connected ? "Connected" : "Disconnected"}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{deviceName ?? "No trainer selected"}</p>
    </div>
  );
}
