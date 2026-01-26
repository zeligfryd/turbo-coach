"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, MoreVertical, Copy, Edit2, Trash2, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  calculateTotalDuration,
  calculateAverageIntensity,
  formatDuration,
  getZoneForIntensity,
  getIntervalAverageIntensity,
  POWER_ZONES,
  flattenBuilderItems,
  calculateAveragePower,
  calculateWork,
  calculateTSS,
  formatWork,
  DEFAULT_FTP_WATTS,
} from "@/lib/workouts/utils";
import type { Workout, WorkoutInterval } from "@/lib/workouts/types";
import { MiniIntensityChart } from "./mini-intensity-chart";
import { toggleWorkoutFavorite, deleteWorkout } from "@/app/workouts/actions";

interface WorkoutCardProps {
  workout: Workout;
  onClick: () => void;
  isCustom?: boolean;
  userFtp: number | null;
}

export function WorkoutCard({ workout, onClick, isCustom, userFtp }: WorkoutCardProps) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(workout.is_favorite || false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Flatten BuilderItems to intervals
  const intervals = flattenBuilderItems(workout.intervals);

  const totalSeconds = calculateTotalDuration(intervals);
  const totalMinutes = totalSeconds / 60;
  const avgIntensity = calculateAverageIntensity(intervals);
  const isPublic = (workout as any).is_public === true;
  
  // Auto-detect if custom based on is_preset field if not explicitly provided
  const isCustomWorkout = isCustom !== undefined ? isCustom : !(workout as any).is_preset;

  const zoneTime: Record<string, number> = {};
  intervals.forEach((interval: WorkoutInterval) => {
    const avgIntensity = getIntervalAverageIntensity(interval);
    const zone = getZoneForIntensity(avgIntensity);
    zoneTime[zone] = (zoneTime[zone] || 0) + interval.durationSeconds;
  });
  const primaryZone = Object.entries(zoneTime).sort((a, b) => b[1] - a[1])[0]?.[0] || "Z2";
  const zoneColor = POWER_ZONES[primaryZone as keyof typeof POWER_ZONES]?.color || "#10b981";

  // Calculate metrics using stored values (if available)
  const ftpWatts = userFtp ?? DEFAULT_FTP_WATTS;
  const avgPowerWatts = workout.avg_intensity_percent 
    ? calculateAveragePower(workout.avg_intensity_percent, ftpWatts)
    : null;

  const workKJ = workout.avg_intensity_percent && workout.duration_seconds
    ? calculateWork(workout.avg_intensity_percent, workout.duration_seconds, ftpWatts)
    : null;

  const tss = workout.avg_intensity_percent && workout.duration_seconds
    ? calculateTSS(workout.avg_intensity_percent, workout.duration_seconds)
    : null;

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isToggling) return;

    const previousState = isFavorite;
    setIsFavorite(!isFavorite);
    setIsToggling(true);

    try {
      const result = await toggleWorkoutFavorite(workout.id);
      if (!result.success) {
        setIsFavorite(previousState);
        console.error("Failed to toggle favorite:", result.error);
      }
    } catch (error) {
      setIsFavorite(previousState);
      console.error("Error toggling favorite:", error);
    } finally {
      setIsToggling(false);
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/workouts/builder?mode=copy&id=${workout.id}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/workouts/builder?mode=edit&id=${workout.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${workout.name}"?`)) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteWorkout(workout.id);

    if (result.success) {
      router.refresh();
    } else {
      alert(`Failed to delete workout: ${result.error}`);
      setIsDeleting(false);
    }
  };

  return (
    <Card
      onClick={onClick}
      className="text-left p-4 cursor-pointer hover:shadow-md transition-all group border-0"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: zoneColor }}
          />
          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
            {workout.name}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {isPublic && (
            <Badge variant="secondary" className="flex items-center gap-1 text-xs h-6 px-2">
              <Globe className="w-3 h-3" />
            </Badge>
          )}
          <button
            onClick={handleToggleFavorite}
            disabled={isToggling}
            className="flex-shrink-0 p-1 rounded hover:bg-accent transition-colors"
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              className={`w-4 h-4 transition-colors ${
                isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
              }`}
            />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 p-1 rounded hover:bg-accent transition-colors"
                disabled={isDeleting}
              >
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopy}>
                <Copy className="w-4 h-4" />
                Copy
              </DropdownMenuItem>
              {isCustomWorkout && (
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

      <div className="mb-3">
        <MiniIntensityChart intervals={intervals} height={30} />
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <span>{formatDuration(totalMinutes)}</span>
        <span>•</span>
        <span>
          {avgIntensity.toFixed(0)}% avg
          {avgPowerWatts !== null && ` (${avgPowerWatts}W)`}
        </span>
        {tss !== null && (
          <>
            <span>•</span>
            <span>TSS {tss}</span>
          </>
        )}
      </div>
    </Card>
  );
}
