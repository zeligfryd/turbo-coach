import { WorkoutLibraryClient } from "@/components/workouts/workout-library-client";
import { createClient } from "@/lib/supabase/server";
import type { Workout } from "@/lib/workouts/types";

export const dynamic = 'force-dynamic';

export default async function WorkoutsPage() {
  const supabase = await createClient();

  const { data: workouts, error } = await supabase
    .from("workouts")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Error loading workouts</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <WorkoutLibraryClient workouts={(workouts as Workout[]) || []} />
    </div>
  );
}
