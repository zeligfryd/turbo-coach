"use client";

import { useMemo } from "react";
import { ZONE_THRESHOLDS } from "@/lib/activity/stream-utils";

interface ZoneDistributionProps {
  watts: number[];
  ftp: number;
}

export function ZoneDistribution({ watts, ftp }: ZoneDistributionProps) {
  const zones = useMemo(() => {
    const counts = new Array(7).fill(0);
    for (const w of watts) {
      if (w <= 0) continue;
      const pct = (w / ftp) * 100;
      const idx = ZONE_THRESHOLDS.findIndex((z) => pct <= z.max);
      counts[idx >= 0 ? idx : 6]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    return ZONE_THRESHOLDS.map((z, i) => ({
      ...z,
      seconds: counts[i],
      pct: total > 0 ? (counts[i] / total) * 100 : 0,
    }));
  }, [watts, ftp]);

  const maxPct = Math.max(...zones.map((z) => z.pct), 1);

  return (
    <div className="rounded-lg bg-card p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground mb-3">Time in Zones</div>
      <div className="space-y-1.5">
        {zones.map((z) => {
          const minutes = Math.round(z.seconds / 60);
          if (z.seconds === 0) return null;
          return (
            <div key={z.zone} className="flex items-center gap-2 text-xs">
              <span className="w-[100px] truncate text-muted-foreground">{z.name}</span>
              <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(z.pct / maxPct) * 100}%`,
                    backgroundColor: z.color,
                    minWidth: z.pct > 0 ? "4px" : "0",
                  }}
                />
              </div>
              <span className="w-[36px] text-right tabular-nums font-medium">
                {minutes}m
              </span>
              <span className="w-[32px] text-right tabular-nums text-muted-foreground">
                {z.pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
