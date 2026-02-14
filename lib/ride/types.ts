import type { Workout, WorkoutInterval } from "@/lib/workouts/types";

export type RideMode = "erg" | "free_ride";
export type RideState = "idle" | "connected" | "riding" | "paused" | "completed" | "aborted";

export type RideMetrics = {
  elapsedSeconds: number;
  intervalElapsedSeconds: number;
  avgPowerWatts: number;
  normalizedPowerWatts: number | null;
  intensityFactor: number | null;
  tss: number;
  avgCadenceRpm: number | null;
  maxPowerWatts: number;
  maxCadenceRpm: number;
  distanceMeters: number | null;
};

export type RideSample = {
  timestamp: number;
  elapsedSeconds: number;
  mode: RideMode;
  powerWatts: number | null;
  targetPowerWatts: number | null;
  cadenceRpm: number | null;
  speedKph: number | null;
  resistanceLevel: number | null;
  distanceMeters: number | null;
  intervalIndex: number | null;
};

export type WorkoutPosition = {
  intervalIndex: number;
  interval: WorkoutInterval;
  intervalElapsedSeconds: number;
  intervalRemainingSeconds: number;
  workoutElapsedSeconds: number;
  workoutTotalSeconds: number;
  progress: number; // 0..1
  targetPowerWatts: number | null;
};

export type WorkoutExecutionState = {
  workout: Workout;
  isComplete: boolean;
  position: WorkoutPosition | null;
  nextInterval: WorkoutInterval | null;
};
