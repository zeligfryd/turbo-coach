"use client";

import { useState } from "react";
import type { Workout } from "@/lib/workouts/types";
import { WorkoutCard } from "./workout-card";
import { WorkoutDetailModal } from "./workout-detail-modal";

interface CustomWorkoutsClientProps {
  workouts: Workout[];
  userFtp: number | null;
}

export function CustomWorkoutsClient({ workouts, userFtp }: CustomWorkoutsClientProps) {
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workouts.map((workout) => (
          <WorkoutCard
            key={workout.id}
            workout={workout}
            onClick={() => setSelectedWorkout(workout)}
            isCustom={true}
            userFtp={userFtp}
          />
        ))}
      </div>

      {/* Workout Detail Modal */}
      <WorkoutDetailModal
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        userFtp={userFtp}
      />
    </>
  );
}
