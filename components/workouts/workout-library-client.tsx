"use client";

import { ChevronDown, ChevronRight, Filter, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateTotalDuration,
  formatDuration,
  getZoneForIntensity,
  POWER_ZONES,
} from "@/lib/workouts/utils";
import type { Workout, WorkoutInterval } from "@/lib/workouts/types";
import { MiniIntensityChart } from "./mini-intensity-chart";
import { WorkoutDetailModal } from "./workout-detail-modal";
import { toggleWorkoutFavorite } from "@/app/workouts/actions";

const CATEGORY_ORDER = [
  "recovery",
  "endurance",
  "tempo",
  "sweet_spot",
  "vo2max",
  "sprint",
  "threshold",
  "anaerobic",
];

const CATEGORY_LABELS: Record<string, string> = {
  recovery: "Recovery",
  endurance: "Endurance",
  tempo: "Tempo",
  sweet_spot: "Sweet Spot",
  vo2max: "VO2 Max",
  sprint: "Sprint",
  threshold: "Threshold",
  anaerobic: "Anaerobic",
};

interface WorkoutLibraryClientProps {
  workouts: Workout[];
  userFtp: number | null;
}

export function WorkoutLibraryClient({ workouts, userFtp }: WorkoutLibraryClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const workoutsByCategory = useMemo(() => {
    const grouped: Record<string, Workout[]> = {};

    workouts.forEach((workout) => {
      const category = workout.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(workout);
    });

    Object.keys(grouped).forEach((category) => {
      grouped[category].sort((a, b) => {
        const durationA = calculateTotalDuration(a.intervals);
        const durationB = calculateTotalDuration(b.intervals);

        if (durationA !== durationB) {
          return durationA - durationB;
        }

        return 0;
      });
    });

    return grouped;
  }, [workouts]);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filteredWorkouts = useMemo(() => {
    let filtered = workouts;

    if (selectedCategory) {
      filtered = filtered.filter((w) => w.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.description?.toLowerCase().includes(query) ||
          w.tags.some((tag: string) => tag.toLowerCase().includes(query))
      );
    }

    filtered.sort((a, b) => {
      const durationA = calculateTotalDuration(a.intervals);
      const durationB = calculateTotalDuration(b.intervals);

      if (durationA !== durationB) {
        return durationA - durationB;
      }

      return 0;
    });

    return filtered;
  }, [workouts, selectedCategory, searchQuery]);

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(new Set(workouts.map((w) => w.category)));
    return uniqueCategories.sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a);
      const indexB = CATEGORY_ORDER.indexOf(b);
      
      // If category is not in the order list, put it at the end
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      
      return indexA - indexB;
    });
  }, [workouts]);

  return (
    <div className="h-full flex flex-col bg-background w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-4">Workout Library</h1>

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
            <Input
              type="text"
              placeholder="Search workouts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <Select
              value={selectedCategory || "all"}
              onValueChange={(value) => setSelectedCategory(value === "all" ? null : value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat] || cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {selectedCategory || searchQuery ? (
          <div>
            <div className="mb-4 text-sm text-muted-foreground">
              {filteredWorkouts.length} workout{filteredWorkouts.length !== 1 ? "s" : ""} found
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorkouts.map((workout) => (
                <WorkoutCard
                  key={workout.id}
                  workout={workout}
                  onClick={() => setSelectedWorkout(workout)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((category) => {
              const categoryWorkouts = workoutsByCategory[category] || [];
              if (categoryWorkouts.length === 0) return null;
              const isCollapsed = collapsedCategories.has(category);

              return (
                <div key={category}>
                  <Button
                    onClick={() => toggleCategory(category)}
                    variant="ghost"
                    className="flex items-center gap-3 mb-4 w-full justify-start hover:opacity-80"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                    <h2 className="text-xl font-semibold text-foreground">
                      {CATEGORY_LABELS[category] || category}
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      ({categoryWorkouts.length} workout{categoryWorkouts.length !== 1 ? "s" : ""})
                    </span>
                  </Button>
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {categoryWorkouts.map((workout) => (
                        <WorkoutCard
                          key={workout.id}
                          workout={workout}
                          onClick={() => setSelectedWorkout(workout)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedWorkout && (
        <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} userFtp={userFtp} />
      )}
    </div>
  );
}

interface WorkoutCardProps {
  workout: Workout;
  onClick: () => void;
}

function WorkoutCard({ workout, onClick }: WorkoutCardProps) {
  const [isFavorite, setIsFavorite] = useState(workout.is_favorite || false);
  const [isToggling, setIsToggling] = useState(false);
  
  const totalSeconds = calculateTotalDuration(workout.intervals);
  const totalMinutes = totalSeconds / 60;

  const zoneTime: Record<string, number> = {};
  workout.intervals.forEach((interval: WorkoutInterval) => {
    const zone = getZoneForIntensity(interval.intensityPercent);
    zoneTime[zone] = (zoneTime[zone] || 0) + interval.durationSeconds;
  });
  const primaryZone = Object.entries(zoneTime).sort((a, b) => b[1] - a[1])[0]?.[0] || "Z2";
  const zoneColor = POWER_ZONES[primaryZone as keyof typeof POWER_ZONES]?.color || "#10b981";

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
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
      </div>

      <div className="mb-3">
        <MiniIntensityChart intervals={workout.intervals} width={280} height={30} />
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{formatDuration(totalMinutes)}</span>
      </div>
    </Card>
  );
}
