import { WorkoutTabs } from "@/components/workouts/workout-tabs";
import { createClient } from "@/lib/supabase/server";
import { validateWorkouts } from "@/lib/workouts/types";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CustomWorkoutsClient } from "@/components/workouts/custom-workouts-client";

export const dynamic = "force-dynamic";

export default async function CustomWorkoutsPage() {
  const supabase = await createClient();

  // Get current user
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return (
      <div className="w-full">
        <WorkoutTabs />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Not logged in</h1>
            <p className="text-muted-foreground">Please log in to view your workouts</p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch user's custom workouts with favorite status
  const { data: workouts, error } = await supabase
    .from("workouts")
    .select(`
      *,
      user_favorite_workouts!left(user_id)
    `)
    .eq("user_id", userData.user.id)
    .eq("is_preset", false)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="w-full">
        <WorkoutTabs />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Error loading workouts
            </h1>
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
      (fav: any) => fav.user_id === userData.user.id
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
  const { data: profile } = await supabase
    .from("users")
    .select("ftp")
    .eq("id", userData.user.id)
    .single();

  const userFtp = profile?.ftp ?? null;

  return (
    <div className="w-full">
      <WorkoutTabs />

      {/* Header with Create Button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Workouts</h1>
          <p className="text-muted-foreground text-sm">
            Create and manage your custom workouts
          </p>
        </div>
        <Link href="/workouts/builder?mode=create">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Workout
          </Button>
        </Link>
      </div>

      {/* Workouts Grid or Empty State */}
      {validatedWorkouts.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-semibold mb-2">No custom workouts yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first custom workout or copy a preset to get started
            </p>
            <Link href="/workouts/builder?mode=create">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Create Your First Workout
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <CustomWorkoutsClient workouts={validatedWorkouts} userFtp={userFtp} />
      )}
    </div>
  );
}
