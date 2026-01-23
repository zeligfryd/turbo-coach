export interface WorkoutInterval {
  name: string;
  durationSeconds: number;
  intensityPercent: number;
}

export interface Workout {
  id: string;
  name: string;
  category: string;
  description: string | null;
  tags: string[];
  intervals: WorkoutInterval[];
  created_at?: string;
  updated_at?: string;
  is_favorite?: boolean;
}
