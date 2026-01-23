import { WorkoutLibraryClient } from "@/components/workouts/workout-library-client";
import { createClient } from "@/lib/supabase/server";
import type { Workout } from "@/lib/workouts/types";

export default async function WorkoutsPage() {
  const supabase = await createClient();

  const { data: workouts, error } = await supabase
    .from("workouts")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Error loading workouts</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <div className="w-full max-w-7xl p-5">
          <WorkoutLibraryClient workouts={(workouts as Workout[]) || []} />
        </div>
      </div>
    </main>
  );
}
