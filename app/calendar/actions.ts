"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateWorkout, validateWorkouts } from "@/lib/workouts/types";
import type { Workout } from "@/lib/workouts/types";
import type { ScheduledWorkout, CalendarActivity } from "@/components/calendar/types";

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

function computeTss(
  movingTime: number | null,
  normalizedPower: number | null,
  avgPower: number | null,
  ftp: number | null
): number | null {
  if (!ftp || !movingTime) return null;
  const power = normalizedPower ?? avgPower;
  if (!power) return null;
  return Math.round((movingTime * power * power) / (ftp * ftp * 3600) * 100);
}

type ActivityRow = {
  id: string;
  activity_date: string;
  name: string | null;
  type: string | null;
  moving_time: number | null;
  icu_training_load: number | null;
  avg_power: number | null;
  normalized_power: number | null;
  avg_hr: number | null;
  distance: number | null;
  elevation_gain: number | null;
  source: string;
};

export async function getCalendarActivities(startDate: string, endDate: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", activities: [] };
    }

    const [{ data, error }, { data: profile }] = await Promise.all([
      supabase
        .from("icu_activities")
        .select(
          "id, activity_date, name, type, moving_time, icu_training_load, avg_power, normalized_power, avg_hr, distance, elevation_gain, source"
        )
        .eq("user_id", user.id)
        .gte("activity_date", startDate)
        .lte("activity_date", endDate)
        .order("activity_date", { ascending: true }),
      supabase.from("users").select("ftp").eq("id", user.id).maybeSingle(),
    ]);

    if (error) {
      return { success: false, error: error.message, activities: [] };
    }

    const ftp = profile?.ftp ?? null;
    const activities: CalendarActivity[] = ((data as ActivityRow[]) ?? []).map((row) => ({
      ...row,
      icu_training_load:
        row.icu_training_load ?? computeTss(row.moving_time, row.normalized_power, row.avg_power, ftp),
    }));

    return { success: true, activities };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      activities: [],
    };
  }
}

export type CalendarWellness = {
  date: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  ramp_rate: number | null;
};

export async function getCalendarWellness(startDate: string, endDate: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated", wellness: [] };
    }

    const { data, error } = await supabase
      .from("wellness")
      .select("date, ctl, atl, tsb, ramp_rate")
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) {
      return { success: false, error: error.message, wellness: [] };
    }

    return { success: true, wellness: (data as CalendarWellness[]) ?? [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      wellness: [],
    };
  }
}

export async function getUserFtp(): Promise<number | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("ftp").eq("id", user.id).maybeSingle();
  return (data as { ftp: number | null } | null)?.ftp ?? null;
}
