"use client";

import {
  Area,
  AreaChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getZoneForIntensity, POWER_ZONES } from "@/lib/workouts/utils";
import type { WorkoutInterval } from "@/lib/workouts/types";

interface IntensityBarChartProps {
  intervals: WorkoutInterval[];
  ftpWatts?: number;
  height?: number;
}

interface ChartDataPoint {
  time: number;
  power: number;
  intensityPercent: number;
  zone: string;
  color: string;
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
}

export function IntensityBarChart({
  intervals,
  ftpWatts = 250,
  height = 200,
}: IntensityBarChartProps) {
  if (intervals.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No intervals to display
      </div>
    );
  }

  const totalDuration = intervals.reduce((sum, i) => sum + i.durationSeconds, 0);
  const maxPower = Math.max(...intervals.map((i) => (i.intensityPercent / 100) * ftpWatts));
  const yAxisMax = Math.ceil(maxPower / 50) * 50;

  const formatXAxisTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const chartData: ChartDataPoint[] = [];
  let currentTime = 0;

  intervals.forEach((interval) => {
    const zone = getZoneForIntensity(interval.intensityPercent);
    const zoneColor = POWER_ZONES[zone].color;
    const power = Math.round((interval.intensityPercent / 100) * ftpWatts);
    const startTime = currentTime;
    const endTime = currentTime + interval.durationSeconds;

    const metadata: ChartDataPoint = {
      time: startTime,
      power,
      intensityPercent: interval.intensityPercent,
      zone,
      color: zoneColor,
      name: interval.name,
      duration: interval.durationSeconds,
      startTime,
      endTime,
    };

    chartData.push({ ...metadata, time: startTime, power });

    const quarter = interval.durationSeconds / 4;
    for (let i = 1; i < 4; i++) {
      const pointTime = startTime + quarter * i;
      chartData.push({ ...metadata, time: pointTime, power });
    }

    chartData.push({ ...metadata, time: endTime, power });

    currentTime = endTime;
  });

  const referenceAreas: Array<{
    x1: number;
    x2: number;
    y1: number;
    y2: number;
    color: string;
    metadata: ChartDataPoint;
  }> = [];

  currentTime = 0;
  intervals.forEach((interval) => {
    const zone = getZoneForIntensity(interval.intensityPercent);
    const zoneColor = POWER_ZONES[zone].color;
    const power = Math.round((interval.intensityPercent / 100) * ftpWatts);
    const startTime = currentTime;
    const endTime = currentTime + interval.durationSeconds;

    const metadata: ChartDataPoint = {
      time: startTime,
      power,
      intensityPercent: interval.intensityPercent,
      zone,
      color: zoneColor,
      name: interval.name,
      duration: interval.durationSeconds,
      startTime,
      endTime,
    };

    referenceAreas.push({
      x1: startTime,
      x2: endTime,
      y1: 0,
      y2: power,
      color: zoneColor,
      metadata,
    });

    currentTime = endTime;
  });

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ChartDataPoint }>;
  }) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;

      const formatDurationShort = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
          return secs > 0 ? `${hours}h ${mins}m ${secs}s` : `${hours}h ${mins}m`;
        }

        if (mins > 0) {
          return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
        }

        return `${secs}s`;
      };

      return (
        <div className="bg-muted border border-border rounded-lg px-3 py-2 shadow-lg">
          <div className="text-foreground text-sm font-medium">
            {formatDurationShort(data.duration)} {data.power}w ({data.intensityPercent}%)
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, totalDuration]}
            tickFormatter={formatXAxisTime}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#475569"
            tickCount={6}
          />
          <YAxis
            domain={[0, yAxisMax]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#475569"
            label={{
              value: "Power (W)",
              angle: -90,
              position: "insideLeft",
              fill: "#94a3b8",
              fontSize: 12,
            }}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "#fff", strokeWidth: 1, strokeDasharray: "3 3" }}
          />

          {referenceAreas.map((refArea, index) => (
            <ReferenceArea
              key={`ref-${index}`}
              x1={refArea.x1}
              x2={refArea.x2}
              y1={refArea.y1}
              y2={refArea.y2}
              fill={refArea.color}
              fillOpacity={0.8}
              stroke="none"
            />
          ))}

          <Area
            type="stepAfter"
            dataKey="power"
            stroke="transparent"
            strokeWidth={2}
            fill="none"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, fill: "#fff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
