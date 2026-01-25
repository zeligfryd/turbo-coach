"use client";

import { ChevronDown, ChevronRight, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
} from "@/lib/workouts/utils";
import type { Workout } from "@/lib/workouts/types";
import { WorkoutCard } from "./workout-card";
import { WorkoutDetailModal } from "./workout-detail-modal";

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

