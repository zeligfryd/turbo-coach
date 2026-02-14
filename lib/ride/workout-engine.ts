import type { Workout, WorkoutInterval } from "@/lib/workouts/types";
import { flattenBuilderItems, getIntervalIntensityAtTime } from "@/lib/workouts/utils";
import type { WorkoutExecutionState, WorkoutPosition } from "@/lib/ride/types";

type TimelineSegment = {
  interval: WorkoutInterval;
  startSecond: number;
  endSecond: number;
  index: number;
};

export class WorkoutEngine {
  private workout: Workout | null = null;
  private ftpWatts: number | null = null;
  private timeline: TimelineSegment[] = [];
  private elapsedSeconds = 0;
  private complete = false;

  loadWorkout(workout: Workout, ftpWatts: number): void {
    const flattened = flattenBuilderItems(workout.intervals);
    let cumulative = 0;
    this.timeline = flattened.map((interval, index) => {
      const startSecond = cumulative;
      const endSecond = cumulative + interval.durationSeconds;
      cumulative = endSecond;
      return { interval, startSecond, endSecond, index };
    });
    this.workout = workout;
    this.ftpWatts = ftpWatts;
    this.elapsedSeconds = 0;
    this.complete = this.timeline.length === 0;
  }

  unloadWorkout(): void {
    this.workout = null;
    this.timeline = [];
    this.ftpWatts = null;
    this.elapsedSeconds = 0;
    this.complete = false;
  }

  hasWorkout(): boolean {
    return this.workout !== null;
  }

  tick(deltaMs: number): number | null {
    if (!this.workout || !this.ftpWatts || this.complete) {
      return null;
    }
    this.elapsedSeconds += Math.max(0, deltaMs / 1000);

    const totalSeconds = this.getWorkoutTotalSeconds();
    if (this.elapsedSeconds >= totalSeconds) {
      this.elapsedSeconds = totalSeconds;
      this.complete = true;
    }

    const current = this.getCurrentPosition();
    return current?.targetPowerWatts ?? null;
  }

  skipForward(): void {
    const current = this.getCurrentSegment();
    if (!current) return;
    const next = this.timeline[current.index + 1];
    if (!next) {
      this.elapsedSeconds = this.getWorkoutTotalSeconds();
      this.complete = true;
      return;
    }
    this.elapsedSeconds = next.startSecond;
  }

  skipBackward(): void {
    const current = this.getCurrentSegment();
    if (!current) return;
    const previous = this.timeline[Math.max(0, current.index - 1)];
    this.elapsedSeconds = previous.startSecond;
    this.complete = false;
  }

  isComplete(): boolean {
    return this.complete;
  }

  getCurrentPosition(): WorkoutPosition | null {
    if (!this.workout || !this.ftpWatts || this.timeline.length === 0) {
      return null;
    }
    const segment = this.getCurrentSegment();
    if (!segment) {
      return null;
    }

    const intervalElapsed = Math.min(
      segment.interval.durationSeconds,
      Math.max(0, this.elapsedSeconds - segment.startSecond),
    );
    const remaining = Math.max(0, segment.interval.durationSeconds - intervalElapsed);
    const progress = this.getWorkoutTotalSeconds() > 0 ? this.elapsedSeconds / this.getWorkoutTotalSeconds() : 0;
    const intensity = getIntervalIntensityAtTime(segment.interval, intervalElapsed);
    const targetPower = Math.round((intensity / 100) * this.ftpWatts);

    return {
      intervalIndex: segment.index,
      interval: segment.interval,
      intervalElapsedSeconds: intervalElapsed,
      intervalRemainingSeconds: remaining,
      workoutElapsedSeconds: this.elapsedSeconds,
      workoutTotalSeconds: this.getWorkoutTotalSeconds(),
      progress: Math.max(0, Math.min(1, progress)),
      targetPowerWatts: targetPower,
    };
  }

  getState(): WorkoutExecutionState | null {
    if (!this.workout) return null;
    const current = this.getCurrentPosition();
    const next = current ? this.timeline[current.intervalIndex + 1]?.interval ?? null : null;
    return {
      workout: this.workout,
      isComplete: this.complete,
      position: current,
      nextInterval: next,
    };
  }

  getWorkoutTotalSeconds(): number {
    return this.timeline[this.timeline.length - 1]?.endSecond ?? 0;
  }

  private getCurrentSegment(): TimelineSegment | null {
    if (this.timeline.length === 0) {
      return null;
    }
    if (this.complete) {
      return this.timeline[this.timeline.length - 1] ?? null;
    }
    return (
      this.timeline.find(
        (segment) =>
          this.elapsedSeconds >= segment.startSecond && this.elapsedSeconds < segment.endSecond,
      ) ?? this.timeline[this.timeline.length - 1]
    );
  }
}
