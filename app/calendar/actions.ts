"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateWorkout, validateWorkouts } from "@/lib/workouts/types";
import type { Workout } from "@/lib/workouts/types";
import type { ScheduledWorkout } from "@/components/calendar/types";

type ScheduledWorkoutRow = {
  id: string;
  scheduled_date: string;
  workout: Workout | Workout[] | null;
};

type FavoriteJoinRow = {
  user_id: string | null;
};

type WorkoutWithFavoritesRow = Workout & {
  user_favorite_workouts?: FavoriteJoinRow[] | null;
};

type FavoriteWorkoutRow = {
  workout_id: string;
  workouts: Workout | null;
};

export async function getScheduledWorkouts(startDate: string, endDate: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", workouts: [] };
    }

    const { data, error } = await supabase
      .from("scheduled_workouts")
      .select(
        `
          id,
          scheduled_date,
          workout:workouts(*)
        `
      )
      .eq("user_id", user.id)
      .gte("scheduled_date", startDate)
      .lte("scheduled_date", endDate)
      .order("scheduled_date", { ascending: true });

    if (error) {
      return { success: false, error: error.message, workouts: [] };
    }

    const normalized: ScheduledWorkout[] =
      ((data as ScheduledWorkoutRow[] | null) ?? [])
        .map((row) => {
          const workoutCandidate = Array.isArray(row.workout) ? row.workout[0] : row.workout;
          const workout = workoutCandidate ? validateWorkout(workoutCandidate) : null;

          if (!workout) {
            return null;
          }

          return {
            id: row.id,
            scheduled_date: row.scheduled_date,
            workout,
          };
        })
        .filter((workout): workout is ScheduledWorkout => workout !== null);

    return { success: true, workouts: normalized };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      workouts: [],
    };
  }
}

export async function scheduleWorkout(workoutId: string, scheduledDate: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase.from("scheduled_workouts").insert({
      user_id: user.id,
      workout_id: workoutId,
      scheduled_date: scheduledDate,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/calendar");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function removeScheduledWorkout(scheduledWorkoutId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { error } = await supabase
      .from("scheduled_workouts")
      .delete()
      .eq("id", scheduledWorkoutId)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/calendar");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getWorkoutLibrary() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "Not authenticated",
        presets: [],
        favorites: [],
        custom: [],
      };
    }

    const { data: presetWorkouts, error: presetsError } = await supabase
      .from("workouts")
      .select(
        `
          *,
          user_favorite_workouts!left(user_id)
        `
      )
      .eq("is_preset", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (presetsError) {
      return {
        success: false,
        error: presetsError.message,
        presets: [],
        favorites: [],
        custom: [],
      };
    }

    const presetsWithFavorites =
      ((presetWorkouts as WorkoutWithFavoritesRow[] | null) ?? []).map((workout) => ({
        ...workout,
        is_favorite:
          workout.user_favorite_workouts?.some((fav) => fav.user_id === user.id) ?? false,
        user_favorite_workouts: undefined,
      }));

    const { data: favoritesData, error: favoritesError } = await supabase
      .from("user_favorite_workouts")
      .select(
        `
          workout_id,
          workouts (*)
        `
      )
      .eq("user_id", user.id);

    if (favoritesError) {
      return {
        success: false,
        error: favoritesError.message,
        presets: [],
        favorites: [],
        custom: [],
      };
    }

    const favoritesRaw =
      ((favoritesData as unknown as FavoriteWorkoutRow[] | null) ?? [])
        .map((fav) => (fav.workouts ? { ...fav.workouts, is_favorite: true } : null))
        .filter(
          (workout): workout is Workout & { is_favorite: true } => workout !== null
        );

    const { data: customWorkouts, error: customError } = await supabase
      .from("workouts")
      .select(
        `
          *,
          user_favorite_workouts!left(user_id)
        `
      )
      .eq("user_id", user.id)
      .eq("is_preset", false)
      .order("created_at", { ascending: false });

    if (customError) {
      return {
        success: false,
        error: customError.message,
        presets: [],
        favorites: [],
        custom: [],
      };
    }

    const customWithFavorites =
      ((customWorkouts as WorkoutWithFavoritesRow[] | null) ?? []).map((workout) => ({
        ...workout,
        is_favorite:
          workout.user_favorite_workouts?.some((fav) => fav.user_id === user.id) ?? false,
        user_favorite_workouts: undefined,
      }));

    return {
      success: true,
      presets: validateWorkouts(presetsWithFavorites),
      favorites: validateWorkouts(favoritesRaw),
      custom: validateWorkouts(customWithFavorites),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      presets: [],
      favorites: [],
      custom: [],
    };
  }
}
