import type { Workout } from "@/lib/workouts/types";
import type { RideMode, RideState } from "@/lib/ride/types";
import { WorkoutEngine } from "@/lib/ride/workout-engine";

export class RideEngine {
  private state: RideState = "idle";
  private mode: RideMode = "free_ride";
  private workoutEngine = new WorkoutEngine();

  getState(): RideState {
    return this.state;
  }

  getMode(): RideMode {
    return this.mode;
  }

  setConnected(): void {
    this.state = "connected";
  }

  startRide(): void {
    this.state = "riding";
  }

  pauseRide(): void {
    this.state = "paused";
  }

  resumeRide(): void {
    this.state = "riding";
  }

  completeRide(): void {
    this.state = "completed";
  }

  abortRide(): void {
    this.state = "aborted";
  }

  switchMode(mode: RideMode): void {
    this.mode = mode;
  }

  loadWorkout(workout: Workout, ftpWatts: number): void {
    this.workoutEngine.loadWorkout(workout, ftpWatts);
  }

  unloadWorkout(): void {
    this.workoutEngine.unloadWorkout();
  }

  getWorkoutEngine(): WorkoutEngine {
    return this.workoutEngine;
  }
}
