"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Star, Copy, MoreVertical, Edit2, Trash2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
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
  isFreeRideInterval,
  POWER_ZONES,
  flattenBuilderItems,
  calculateAveragePower,
  calculateWork,
  calculateTSS,
  formatWork,
  DEFAULT_FTP_WATTS,
} from "@/lib/workouts/utils";
import { toggleWorkoutFavorite, deleteWorkout } from "@/app/workouts/actions";
import { downloadWorkout } from "@/lib/workouts/export";

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
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(workout?.is_favorite || false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!workout) return null;

  const isPreset = (workout as any).is_preset === true;
  const isCustom = !isPreset;

  // Flatten BuilderItems to intervals
  const intervals = flattenBuilderItems(workout.intervals);

  const ftpWatts = userFtp ?? DEFAULT_FTP_WATTS;
  const zoneTime = calculateZoneTime(intervals);
  const totalSeconds = calculateTotalDuration(intervals);
  const totalMinutes = totalSeconds / 60;
  const avgIntensity = calculateAverageIntensity(intervals);

  const zonePercentages: Record<string, number> = {};
  Object.entries(zoneTime).forEach(([zone, seconds]) => {
    zonePercentages[zone] = (seconds / totalSeconds) * 100;
  });

  // Calculate metrics using stored values (if available) or fallback to calculated values
  const avgPowerWatts = workout.avg_intensity_percent 
    ? calculateAveragePower(workout.avg_intensity_percent, ftpWatts)
    : null;

  const workKJ = workout.avg_intensity_percent && workout.duration_seconds
    ? calculateWork(workout.avg_intensity_percent, workout.duration_seconds, ftpWatts)
    : null;

  const tss = workout.avg_intensity_percent && workout.duration_seconds
    ? calculateTSS(workout.avg_intensity_percent, workout.duration_seconds)
    : null;

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

  const handleCopy = () => {
    router.push(`/workouts/builder?mode=copy&id=${workout.id}`);
    onClose();
  };

  const handleExport = () => {
    downloadWorkout(workout, "json");
  };

  const handleEdit = () => {
    router.push(`/workouts/builder?mode=edit&id=${workout.id}`);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${workout.name}"?`)) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteWorkout(workout.id);

    if (result.success) {
      onClose();
      router.refresh();
    } else {
      alert(`Failed to delete workout: ${result.error}`);
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={!!workout} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-6 border-b border-border">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-lg">🚴</span>
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">{workout.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Duration {formatDuration(totalMinutes)} • Intensity {avgIntensity}%
              </p>
            </div>
            <div className="flex items-center gap-2">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isDeleting}
                    className="flex-shrink-0"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCopy}>
                    <Copy className="w-4 h-4" />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport}>
                    <Download className="w-4 h-4" />
                    Export (JSON)
                  </DropdownMenuItem>
                  {isCustom && (
                    <>
                      <DropdownMenuItem onClick={handleEdit}>
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Performance Metrics */}
          <div>
            {/* <h3 className="text-sm font-medium text-foreground mb-3">Performance Metrics</h3> */}
            <div className="space-y-3">
              {/* Line 1: Duration - Intensity - TSS */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Duration</div>
                  <div className="text-lg font-semibold text-foreground">
                    {formatDuration(totalMinutes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Intensity</div>
                  <div className="text-lg font-semibold text-foreground">{avgIntensity}% FTP</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">TSS</div>
                  <div className="text-lg font-semibold text-foreground">
                    {tss !== null ? tss : "—"}
                  </div>
                </div>
              </div>
              {/* Line 2: Average Power - Work */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Average Power</div>
                  <div className="text-lg font-semibold text-foreground">
                    {avgPowerWatts !== null ? `${avgPowerWatts}W` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Work</div>
                  <div className="text-lg font-semibold text-foreground">
                    {workKJ !== null ? formatWork(workKJ) : "—"}
                  </div>
                </div>
                <div></div>
              </div>
            </div>
          </div>

          {/* Intensity Chart */}
          <div>
            {/* <h3 className="text-sm font-medium text-foreground mb-3">Intensity Profile</h3> */}
            <div className="bg-muted/50 rounded-lg p-4">
              <IntensityBarChart intervals={intervals} ftpWatts={ftpWatts} height={200} />
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
              {intervals.map((interval, index) => {
                const isFreeRide = isFreeRideInterval(interval);
                const isRamp = isRampInterval(interval);
                const avgIntensity = getIntervalAverageIntensity(interval);
                const zone = getZoneForIntensity(avgIntensity);
                const zoneColor = POWER_ZONES[zone].color;

                let displayText: string;
                if (isFreeRide) {
                  displayText = `${formatDurationSeconds(interval.durationSeconds)} - Free Ride`;
                } else if (isRamp) {
                  const startWatts = Math.round((interval.intensityPercentStart! / 100) * ftpWatts);
                  const endWatts = Math.round((interval.intensityPercentEnd! / 100) * ftpWatts);
                  displayText = `${formatDurationSeconds(interval.durationSeconds)} @ ${interval.intensityPercentStart}% → ${interval.intensityPercentEnd}% (${startWatts}W → ${endWatts}W)`;
                } else {
                  const watts = Math.round((interval.intensityPercentStart! / 100) * ftpWatts);
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
                      <span className="text-muted-foreground">
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
