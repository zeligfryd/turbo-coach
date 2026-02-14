import { redirect } from "next/navigation";
import { RidePageClient } from "@/components/ride/ride-page-client";
import { createClient } from "@/lib/supabase/server";
import { validateWorkouts } from "@/lib/workouts/types";
import type { Workout } from "@/lib/workouts/types";

type FavoriteJoinRow = {
  user_id: string | null;
};

type WorkoutWithFavoritesRow = Workout & {
  user_favorite_workouts?: FavoriteJoinRow[] | null;
};

export const dynamic = "force-dynamic";

type RidePageSearchParams = {
  workoutId?: string;
};

export default async function RidePage({
  searchParams,
}: {
  searchParams: Promise<RidePageSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      `
      *,
      user_favorite_workouts!left(user_id)
    `,
    )
    .or(`is_preset.eq.true,user_id.eq.${user.id},is_public.eq.true`)
    .order("is_preset", { ascending: false })
    .order("name", { ascending: true });

  const transformedWorkouts =
    ((workouts as WorkoutWithFavoritesRow[] | null) ?? []).map((workout) => ({
      ...workout,
      is_favorite:
        workout.user_favorite_workouts?.some((favorite) => favorite.user_id === user.id) ?? false,
      user_favorite_workouts: undefined,
    }));

  const validatedWorkouts = validateWorkouts(transformedWorkouts);

  const { data: profile } = await supabase
    .from("users")
    .select("ftp")
    .eq("id", user.id)
    .single();

  return (
    <RidePageClient
      workouts={validatedWorkouts}
      userId={user.id}
      ftpWatts={profile?.ftp ?? 250}
      initialWorkoutId={resolvedSearchParams.workoutId ?? null}
    />
  );
}
