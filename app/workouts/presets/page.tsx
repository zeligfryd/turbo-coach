import { WorkoutLibraryClient } from "@/components/workouts/workout-library-client";
import { WorkoutTabs } from "@/components/workouts/workout-tabs";
import { createClient } from "@/lib/supabase/server";
import { validateWorkouts } from "@/lib/workouts/types";
import type { Workout } from "@/lib/workouts/types";

export const dynamic = 'force-dynamic';

export default async function PresetsPage() {
  const supabase = await createClient();

  // Get current user
  const { data: userData } = await supabase.auth.getUser();

  // Fetch workouts with favorite status
  const { data: workouts, error } = await supabase
    .from("workouts")
    .select(`
      *,
      user_favorite_workouts!left(user_id)
    `)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="w-full">
        <WorkoutTabs />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Error loading workouts</h1>
            <p className="text-muted-foreground">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // Transform data to include is_favorite flag
  const workoutsWithFavorites = workouts?.map((workout: any) => ({
    ...workout,
    is_favorite: workout.user_favorite_workouts?.some(
      (fav: any) => fav.user_id === userData?.user?.id
    ) || false,
    user_favorite_workouts: undefined, // Remove the join data
  })) || [];

  // Validate workouts and filter out invalid ones
  const validatedWorkouts = validateWorkouts(workoutsWithFavorites);
  
  if (validatedWorkouts.length < workoutsWithFavorites.length) {
    console.warn(
      `Filtered out ${workoutsWithFavorites.length - validatedWorkouts.length} invalid workout(s)`
    );
  }

  // Fetch user profile for FTP
  let userFtp: number | null = null;

  if (userData?.user) {
    const { data: profile } = await supabase
      .from("users")
      .select("ftp")
      .eq("id", userData.user.id)
      .single();
    
    userFtp = profile?.ftp ?? null;
  }

  return (
    <div className="w-full">
      <WorkoutTabs />
      <WorkoutLibraryClient workouts={validatedWorkouts} userFtp={userFtp} />
    </div>
  );
}
