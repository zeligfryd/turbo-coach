import { WorkoutLibraryClient } from "@/components/workouts/workout-library-client";
import { WorkoutTabs } from "@/components/workouts/workout-tabs";
import { createClient } from "@/lib/supabase/server";
import { validateWorkouts } from "@/lib/workouts/types";
import type { Workout } from "@/lib/workouts/types";
import { Star } from "lucide-react";

type FavoriteWorkoutRow = {
  workout_id: string;
  workouts: Workout | null;
};

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const supabase = await createClient();

  // Get current user
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return (
      <div className="w-full">
        <WorkoutTabs />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Authentication required</h1>
            <p className="text-muted-foreground">Please log in to view your favorites</p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch only favorited workouts
  const { data: favorites, error } = await supabase
    .from("user_favorite_workouts")
    .select(`
      workout_id,
      workouts (*)
    `)
    .eq("user_id", userData.user.id);

  if (error) {
    return (
      <div className="w-full">
        <WorkoutTabs />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Error loading favorites</h1>
            <p className="text-muted-foreground">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // Extract workouts from the join and add is_favorite flag
  const rawWorkouts =
    ((favorites as unknown as FavoriteWorkoutRow[] | null) ?? [])
      .map((fav) => (fav.workouts ? { ...fav.workouts, is_favorite: true } : null))
      .filter(
        (workout): workout is Workout & { is_favorite: true } => workout !== null
      ); // Filter out null workout joins

  // Validate workouts and filter out invalid ones
  const validatedWorkouts = validateWorkouts(rawWorkouts);
  
  if (validatedWorkouts.length < rawWorkouts.length) {
    console.warn(
      `Filtered out ${rawWorkouts.length - validatedWorkouts.length} invalid workout(s) from favorites`
    );
  }

  // Sort workouts
  const workouts = validatedWorkouts.sort((a, b) => {
    // Sort by category first, then by name
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });

  // Fetch user profile for FTP
  let userFtp: number | null = null;
  const { data: profile } = await supabase
    .from("users")
    .select("ftp")
    .eq("id", userData.user.id)
    .single();
  
  userFtp = profile?.ftp ?? null;

  // Show empty state if no favorites
  if (workouts.length === 0) {
    return (
      <div className="w-full">
        <WorkoutTabs />
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md">
            <div className="mb-4 flex justify-center">
              <Star className="w-16 h-16 text-muted-foreground/50" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">No favorites yet</h1>
            <p className="text-muted-foreground">
              Start adding workouts to your favorites by clicking the star icon in the workout details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <WorkoutTabs />
      <WorkoutLibraryClient workouts={workouts} userFtp={userFtp} />
    </div>
  );
}
