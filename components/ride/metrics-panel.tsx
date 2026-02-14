"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RideMetrics } from "@/lib/ride/types";
import type { RideMode } from "@/lib/ride/types";
import { cn } from "@/lib/utils";

type MetricsPanelProps = {
  currentPower: number | null;
  cadence: number | null;
  speedKph: number | null;
  targetPower: number | null;
  metrics: RideMetrics;
  mode: RideMode;
};

function MetricTile({
  label,
  value,
  dimmed = false,
}: {
  label: string;
  value: string;
  dimmed?: boolean;
}) {
  return (
    <Card className={cn("bg-card/80 transition-opacity", dimmed && "opacity-50")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function MetricsPanel({
  currentPower,
  cadence,
  speedKph,
  targetPower,
  metrics,
  mode,
}: MetricsPanelProps) {
  const ifValue =
    metrics.intensityFactor === null ? "--" : metrics.intensityFactor.toFixed(2);
  const npValue =
    metrics.normalizedPowerWatts === null ? "--" : `${metrics.normalizedPowerWatts} W`;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <MetricTile
        label="Target Power"
        value={targetPower !== null ? `${targetPower} W` : "--"}
        dimmed={mode === "free_ride"}
      />
      <MetricTile label="Power" value={currentPower !== null ? `${currentPower} W` : "--"} />
      <MetricTile label="Cadence" value={cadence !== null ? `${Math.round(cadence)} rpm` : "--"} />
      <MetricTile
        label="Speed"
        value={speedKph !== null ? `${speedKph.toFixed(1)} km/h` : "--"}
      />
      <MetricTile label="Elapsed" value={`${Math.floor(metrics.elapsedSeconds / 60)}:${String(Math.floor(metrics.elapsedSeconds % 60)).padStart(2, "0")}`} />
      <MetricTile label="Avg Power" value={`${metrics.avgPowerWatts} W`} />
      <MetricTile label="NP / IF" value={`${npValue} / ${ifValue}`} />
      <MetricTile label="TSS" value={`${metrics.tss}`} />
    </div>
  );
}
