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
} from "@/lib/workouts/utils";
import type { Workout, WorkoutInterval } from "@/lib/workouts/types";
import { MiniIntensityChart } from "./mini-intensity-chart";
import { toggleWorkoutFavorite, deleteWorkout } from "@/app/workouts/actions";

interface WorkoutCardProps {
  workout: Workout;
  onClick: () => void;
  isCustom?: boolean;
}

export function WorkoutCard({ workout, onClick, isCustom }: WorkoutCardProps) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(workout.is_favorite || false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalSeconds = calculateTotalDuration(workout.intervals);
  const totalMinutes = totalSeconds / 60;
  const avgIntensity = calculateAverageIntensity(workout.intervals);
  const isPublic = (workout as any).is_public === true;
  
  // Auto-detect if custom based on is_preset field if not explicitly provided
  const isCustomWorkout = isCustom !== undefined ? isCustom : !(workout as any).is_preset;

  const zoneTime: Record<string, number> = {};
  workout.intervals.forEach((interval: WorkoutInterval) => {
    const avgIntensity = getIntervalAverageIntensity(interval);
    const zone = getZoneForIntensity(avgIntensity);
    zoneTime[zone] = (zoneTime[zone] || 0) + interval.durationSeconds;
  });
  const primaryZone = Object.entries(zoneTime).sort((a, b) => b[1] - a[1])[0]?.[0] || "Z2";
  const zoneColor = POWER_ZONES[primaryZone as keyof typeof POWER_ZONES]?.color || "#10b981";

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
      className="text-left p-4 cursor-pointer hover:border-border transition-all group"
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
        <MiniIntensityChart intervals={workout.intervals} width={280} height={30} />
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{formatDuration(totalMinutes)}</span>
        <span>•</span>
        <span>{avgIntensity.toFixed(0)}% avg</span>
      </div>
    </Card>
  );
}
