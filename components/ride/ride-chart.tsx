"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { RideSample, WorkoutExecutionState } from "@/lib/ride/types";
import type { RideMode } from "@/lib/ride/types";
import type { WorkoutInterval } from "@/lib/workouts/types";
import { flattenBuilderItems, isFreeRideInterval, isRampInterval } from "@/lib/workouts/utils";
import { POWER_ZONES, getZoneForIntensity } from "@/lib/workouts/utils";

type ChartViewMode = "full" | "zoom";

type RideChartProps = {
  samples: RideSample[];
  workoutState: WorkoutExecutionState | null;
  ftpWatts: number;
  mode: RideMode;
  chartViewMode: ChartViewMode;
  onToggleChartViewMode: () => void;
};

type TimelineInterval = {
  interval: WorkoutInterval;
  startSeconds: number;
  endSeconds: number;
};

const WIDTH = 1000;
const HEIGHT = 260;
const PADDING = { left: 48, right: 18, top: 16, bottom: 30 };

function buildTimeline(intervals: WorkoutInterval[]): TimelineInterval[] {
  let current = 0;
  return intervals.map((interval) => {
    const startSeconds = current;
    const endSeconds = current + interval.durationSeconds;
    current = endSeconds;
    return { interval, startSeconds, endSeconds };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function RideChart({
  samples,
  workoutState,
  ftpWatts,
  mode,
  chartViewMode,
  onToggleChartViewMode,
}: RideChartProps) {
  const elapsedSeconds = samples[samples.length - 1]?.elapsedSeconds ?? 0;

  const timeline = useMemo(() => {
    if (!workoutState) return [];
    return buildTimeline(flattenBuilderItems(workoutState.workout.intervals));
  }, [workoutState]);

  const totalWorkoutSeconds = timeline[timeline.length - 1]?.endSeconds ?? 0;

  const domain = useMemo(() => {
    if (!workoutState || totalWorkoutSeconds <= 0) {
      const end = Math.max(300, elapsedSeconds);
      return { minX: Math.max(0, end - 300), maxX: end };
    }

    if (chartViewMode === "full") {
      return { minX: 0, maxX: Math.max(totalWorkoutSeconds, 60) };
    }

    const windowSeconds = 300;
    const center =
      workoutState.position?.workoutElapsedSeconds ??
      elapsedSeconds;
    const minX = clamp(center - windowSeconds / 2, 0, Math.max(0, totalWorkoutSeconds - windowSeconds));
    const maxX = Math.min(totalWorkoutSeconds, minX + windowSeconds);
    return { minX, maxX: Math.max(minX + 60, maxX) };
  }, [workoutState, totalWorkoutSeconds, chartViewMode, elapsedSeconds]);

  const maxPowerForDomain = useMemo(() => {
    const sampleMax = samples.reduce((max, sample) => Math.max(max, sample.powerWatts ?? 0), 0);
    const targetMax = timeline.reduce((max, item) => {
      if (isFreeRideInterval(item.interval)) {
        return Math.max(max, Math.round(ftpWatts * 0.5));
      }
      const start = item.interval.intensityPercentStart ?? 0;
      const end = item.interval.intensityPercentEnd ?? start;
      return Math.max(max, Math.round((Math.max(start, end) / 100) * ftpWatts));
    }, 0);
    return Math.max(200, sampleMax, targetMax) * 1.1;
  }, [samples, timeline, ftpWatts]);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const xSpan = Math.max(1, domain.maxX - domain.minX);

  const x = (seconds: number): number =>
    PADDING.left + ((seconds - domain.minX) / xSpan) * plotWidth;

  const y = (powerWatts: number): number =>
    PADDING.top + plotHeight - (powerWatts / maxPowerForDomain) * plotHeight;

  const actualPowerPath = useMemo(() => {
    const points = samples
      .filter((sample) => sample.elapsedSeconds >= domain.minX && sample.elapsedSeconds <= domain.maxX)
      .map((sample) => ({
        x: x(sample.elapsedSeconds),
        y: y(sample.powerWatts ?? 0),
      }));

    if (points.length === 0) return "";
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
  }, [samples, domain.minX, domain.maxX, maxPowerForDomain]);

  const currentMarkerX =
    workoutState && totalWorkoutSeconds > 0
      ? x(workoutState.position?.workoutElapsedSeconds ?? elapsedSeconds)
      : x(elapsedSeconds);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Power Chart</h3>
          <p className="text-xs text-muted-foreground">
            {mode === "erg" ? "Workout profile + actual power line" : "Actual power line"}
          </p>
        </div>
        {workoutState && (
          <Button type="button" size="sm" variant="outline" onClick={onToggleChartViewMode}>
            {chartViewMode === "full" ? "Zoom in" : "Full overview"}
          </Button>
        )}
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-64 w-full rounded-md bg-background">
        <line
          x1={PADDING.left}
          x2={PADDING.left}
          y1={PADDING.top}
          y2={HEIGHT - PADDING.bottom}
          stroke="hsl(var(--border))"
        />
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={HEIGHT - PADDING.bottom}
          y2={HEIGHT - PADDING.bottom}
          stroke="hsl(var(--border))"
        />

        {timeline.map((item, index) => {
          if (!workoutState) return null;
          const intervalStart = Math.max(item.startSeconds, domain.minX);
          const intervalEnd = Math.min(item.endSeconds, domain.maxX);
          if (intervalEnd <= intervalStart) return null;

          const xStart = x(intervalStart);
          const xEnd = x(intervalEnd);
          const width = xEnd - xStart;

          if (isFreeRideInterval(item.interval)) {
            const target = ftpWatts * 0.5;
            const top = y(target);
            return (
              <rect
                key={`${index}-free`}
                x={xStart}
                y={top}
                width={width}
                height={HEIGHT - PADDING.bottom - top}
                fill="rgba(255, 192, 203, 0.25)"
              />
            );
          }

          const startPct = item.interval.intensityPercentStart ?? 0;
          const endPct = item.interval.intensityPercentEnd ?? startPct;
          const startPower = (startPct / 100) * ftpWatts;
          const endPower = (endPct / 100) * ftpWatts;
          const zone = POWER_ZONES[getZoneForIntensity((startPct + endPct) / 2)];
          const fill = `${zone.color}55`;

          if (isRampInterval(item.interval)) {
            const points = [
              `${xStart},${HEIGHT - PADDING.bottom}`,
              `${xStart},${y(startPower)}`,
              `${xEnd},${y(endPower)}`,
              `${xEnd},${HEIGHT - PADDING.bottom}`,
            ].join(" ");
            return <polygon key={`${index}-ramp`} points={points} fill={fill} />;
          }

          const top = y(startPower);
          return (
            <rect
              key={`${index}-steady`}
              x={xStart}
              y={top}
              width={width}
              height={HEIGHT - PADDING.bottom - top}
              fill={fill}
            />
          );
        })}

        {actualPowerPath && (
          <path
            d={actualPowerPath}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
          />
        )}

        <line
          x1={currentMarkerX}
          x2={currentMarkerX}
          y1={PADDING.top}
          y2={HEIGHT - PADDING.bottom}
          stroke="hsl(var(--destructive))"
          strokeDasharray="4 4"
        />

        <text
          x={PADDING.left}
          y={HEIGHT - 8}
          fontSize="11"
          fill="hsl(var(--muted-foreground))"
        >
          {Math.round(domain.minX / 60)}m
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 8}
          textAnchor="end"
          fontSize="11"
          fill="hsl(var(--muted-foreground))"
        >
          {Math.round(domain.maxX / 60)}m
        </text>
      </svg>
    </div>
  );
}
