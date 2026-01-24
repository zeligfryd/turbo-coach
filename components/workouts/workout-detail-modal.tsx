"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Workout } from "@/lib/workouts/types";
import {
  calculateAverageIntensity,
  calculateTotalDuration,
  calculateZoneTime,
  formatDuration,
  formatDurationSeconds,
  getZoneForIntensity,
  getIntervalAverageIntensity,
  isRampInterval,
  POWER_ZONES,
} from "@/lib/workouts/utils";
import { toggleWorkoutFavorite } from "@/app/workouts/actions";

const IntensityBarChart = dynamic(
  () => import("./intensity-bar-chart").then((mod) => ({ default: mod.IntensityBarChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
        Loading chart...
      </div>
    ),
  }
);

interface WorkoutDetailModalProps {
  workout: Workout | null;
  onClose: () => void;
  userFtp: number | null;
}

export function WorkoutDetailModal({ workout, onClose, userFtp }: WorkoutDetailModalProps) {
  const [isFavorite, setIsFavorite] = useState(workout?.is_favorite || false);
  const [isToggling, setIsToggling] = useState(false);

  if (!workout) return null;

  const ftpWatts = userFtp ?? 250; // Use user's FTP or default to 250
  const zoneTime = calculateZoneTime(workout.intervals);
  const totalSeconds = calculateTotalDuration(workout.intervals);
  const totalMinutes = totalSeconds / 60;
  const avgIntensity = calculateAverageIntensity(workout.intervals);

  const zonePercentages: Record<string, number> = {};
  Object.entries(zoneTime).forEach(([zone, seconds]) => {
    zonePercentages[zone] = (seconds / totalSeconds) * 100;
  });

  const handleToggleFavorite = async () => {
    if (isToggling) return;

    // Optimistic update
    const previousState = isFavorite;
    setIsFavorite(!isFavorite);
    setIsToggling(true);

    try {
      const result = await toggleWorkoutFavorite(workout.id);

      if (!result.success) {
        // Rollback on error
        setIsFavorite(previousState);
        console.error("Failed to toggle favorite:", result.error);
      }
    } catch (error) {
      // Rollback on error
      setIsFavorite(previousState);
      console.error("Error toggling favorite:", error);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <Dialog open={!!workout} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-lg">🚴</span>
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">{workout.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Duration {formatDuration(totalMinutes)} • Intensity {avgIntensity}%
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleFavorite}
              disabled={isToggling}
              className="flex-shrink-0"
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star
                className={`w-5 h-5 transition-colors ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                  }`}
              />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Performance Metrics */}
          <div>
            {/* <h3 className="text-sm font-medium text-foreground mb-3">Performance Metrics</h3> */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Duration</div>
                <div className="text-lg font-semibold text-foreground">
                  {formatDuration(totalMinutes)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Average Power</div>
                <div className="text-sm text-muted-foreground">Coming soon</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Normalized Power</div>
                <div className="text-sm text-muted-foreground">Coming soon</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Work</div>
                <div className="text-sm text-muted-foreground">Coming soon</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">TSS</div>
                <div className="text-sm text-muted-foreground">Coming soon</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Intensity</div>
                <div className="text-lg font-semibold text-foreground">{avgIntensity}% FTP</div>
              </div>
            </div>
          </div>

          {/* Intensity Chart */}
          <div>
            {/* <h3 className="text-sm font-medium text-foreground mb-3">Intensity Profile</h3> */}
            <div className="bg-muted/50 rounded-lg p-4">
              <IntensityBarChart intervals={workout.intervals} ftpWatts={ftpWatts} height={200} />
            </div>
          </div>

          {/* Zone Breakdown */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Time in Zones</h3>
            <div className="space-y-2">
              {Object.entries(POWER_ZONES).map(([zone, zoneInfo]) => {
                const seconds = zoneTime[zone] || 0;
                const percentage = zonePercentages[zone] || 0;
                if (seconds === 0) return null;

                return (
                  <div key={zone} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-muted-foreground">{zoneInfo.name}</div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full flex items-center justify-end pr-2"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: zoneInfo.color,
                          }}
                        >
                          {percentage > 5 && (
                            <span className="text-xs text-foreground font-medium">
                              {formatDuration(seconds / 60)} ({percentage.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                      {percentage <= 5 && (
                        <span className="text-xs text-muted-foreground w-20 text-right">
                          {formatDuration(seconds / 60)} ({percentage.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Description */}
          {workout.description && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{workout.description}</p>
            </div>
          )}

          {/* Workout Segments */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Workout Segments</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {workout.intervals.map((interval, index) => {
                const isRamp = isRampInterval(interval);
                const avgIntensity = getIntervalAverageIntensity(interval);
                const zone = getZoneForIntensity(avgIntensity);
                const zoneColor = POWER_ZONES[zone].color;

                let displayText: string;
                if (isRamp) {
                  const startWatts = Math.round((interval.intensityPercentStart / 100) * ftpWatts);
                  const endWatts = Math.round((interval.intensityPercentEnd! / 100) * ftpWatts);
                  displayText = `${formatDurationSeconds(interval.durationSeconds)} @ ${interval.intensityPercentStart}% → ${interval.intensityPercentEnd}% (${startWatts}W → ${endWatts}W)`;
                } else {
                  const watts = Math.round((interval.intensityPercentStart / 100) * ftpWatts);
                  displayText = `${formatDurationSeconds(interval.durationSeconds)} @ ${interval.intensityPercentStart}% (${watts}W)`;
                }

                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 text-sm py-1 px-2 rounded hover:bg-muted/50"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: zoneColor }}
                    ></div>
                    <div className="flex-1">
                      <span className="text-foreground">{interval.name}</span>
                      <span className="text-muted-foreground ml-2">
                        {displayText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          {workout.tags && workout.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border">
              {workout.tags.map((tag) => (
                <span key={tag} className="px-2 py-1 text-xs bg-muted text-foreground rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
