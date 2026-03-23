"use client";

import type { IcuInterval } from "@/lib/intervals/types";
import { formatDuration, getZoneColor } from "@/lib/activity/stream-utils";

interface IntervalsTableProps {
  intervals: IcuInterval[];
  ftp?: number | null;
  distanceStream?: number[];
}

export function IntervalsTable({ intervals, ftp, distanceStream }: IntervalsTableProps) {
  if (!intervals || intervals.length === 0) {
    return (
      <div className="rounded-lg bg-card p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">No detected intervals</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground mb-3">
        Detected Intervals ({intervals.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5 pr-3 font-medium">Interval</th>
              <th className="text-right py-1.5 px-2 font-medium">Start</th>
              <th className="text-right py-1.5 px-2 font-medium">Duration</th>
              <th className="text-right py-1.5 px-2 font-medium">Start km</th>
              <th className="text-right py-1.5 px-2 font-medium">Dist</th>
              <th className="text-right py-1.5 px-2 font-medium">Avg W</th>
              {ftp && <th className="text-right py-1.5 px-2 font-medium">% FTP</th>}
              <th className="text-right py-1.5 px-2 font-medium">Avg HR</th>
              <th className="text-right py-1.5 px-2 font-medium">Max HR</th>
              <th className="text-right py-1.5 px-2 font-medium">Cadence</th>
              <th className="text-center py-1.5 pl-2 font-medium">Zone</th>
            </tr>
          </thead>
          <tbody>
            {intervals.map((iv, i) => {
              const duration = iv.elapsed_time ?? iv.moving_time ?? 0;
              const pctFtp =
                iv.average_watts && ftp
                  ? Math.round((iv.average_watts / ftp) * 100)
                  : iv.intensity
                    ? Math.round(iv.intensity * 100)
                    : null;
              const zone = iv.zone ?? null;
              const zoneColor = zone ? getZoneColor(zone) : undefined;
              const isWork = iv.type === "WORK";

              // Time at start of interval (start_index = seconds from activity start)
              const startTime = iv.start_index != null ? iv.start_index : null;

              // Distance from stream data
              const startDist =
                distanceStream && iv.start_index != null
                  ? distanceStream[iv.start_index] ?? null
                  : null;
              const endDist =
                distanceStream && iv.end_index != null
                  ? distanceStream[Math.min(iv.end_index, distanceStream.length - 1)] ?? null
                  : null;
              const intervalDist =
                startDist != null && endDist != null ? endDist - startDist : iv.distance ?? null;

              return (
                <tr
                  key={i}
                  className={`border-b border-border/50 ${isWork ? "font-medium" : "text-muted-foreground"}`}
                >
                  <td className="py-1.5 pr-3 truncate max-w-[140px]">
                    {iv.label ?? iv.type ?? `#${i + 1}`}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {startTime != null ? formatDuration(startTime) : "—"}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {formatDuration(duration)}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {startDist != null ? (startDist / 1000).toFixed(1) : "—"}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {intervalDist != null
                      ? intervalDist >= 1000
                        ? `${(intervalDist / 1000).toFixed(1)}km`
                        : `${Math.round(intervalDist)}m`
                      : "—"}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {iv.average_watts ? Math.round(iv.average_watts) : "—"}
                  </td>
                  {ftp && (
                    <td className="text-right py-1.5 px-2 tabular-nums">
                      {pctFtp ? `${pctFtp}%` : "—"}
                    </td>
                  )}
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {iv.average_heartrate ? Math.round(iv.average_heartrate) : "—"}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {iv.max_heartrate ? Math.round(iv.max_heartrate) : "—"}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">
                    {iv.average_cadence ? Math.round(iv.average_cadence) : "—"}
                  </td>
                  <td className="text-center py-1.5 pl-2">
                    {zone ? (
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: zoneColor }}
                      >
                        Z{zone}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
