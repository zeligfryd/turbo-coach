"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createWorkout(data: {
  name: string;
  category: string;
  description: string | null;
  tags: string[];
  intervals: any[];
  is_public: boolean;
}) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Insert workout
    const { error: insertError } = await supabase
      .from("workouts")
      .insert({
        ...data,
        user_id: user.id,
        is_preset: false,
      });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Revalidate pages
    revalidatePath("/workouts/custom");
    revalidatePath("/workouts/presets");

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function updateWorkout(
  workoutId: string,
  data: {
    name: string;
    category: string;
    description: string | null;
    tags: string[];
    intervals: any[];
    is_public: boolean;
  }
) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify user owns the workout and it's not a preset
    const { data: workout, error: fetchError } = await supabase
      .from("workouts")
      .select("user_id, is_preset")
      .eq("id", workoutId)
      .single();

    if (fetchError) {
      return { success: false, error: "Workout not found" };
    }

    if (workout.is_preset) {
      return { success: false, error: "Cannot edit preset workouts" };
    }

    if (workout.user_id !== user.id) {
      return { success: false, error: "Not authorized to edit this workout" };
    }

    // Update workout
    const { error: updateError } = await supabase
      .from("workouts")
      .update(data)
      .eq("id", workoutId)
      .eq("user_id", user.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Revalidate pages
    revalidatePath("/workouts/custom");
    revalidatePath("/workouts/presets");

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function deleteWorkout(workoutId: string) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify user owns the workout and it's not a preset
    const { data: workout, error: fetchError } = await supabase
      .from("workouts")
      .select("user_id, is_preset")
      .eq("id", workoutId)
      .single();

    if (fetchError) {
      return { success: false, error: "Workout not found" };
    }

    if (workout.is_preset) {
      return { success: false, error: "Cannot delete preset workouts" };
    }

    if (workout.user_id !== user.id) {
      return { success: false, error: "Not authorized to delete this workout" };
    }

    // Delete workout
    const { error: deleteError } = await supabase
      .from("workouts")
      .delete()
      .eq("id", workoutId)
      .eq("user_id", user.id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    // Revalidate pages
    revalidatePath("/workouts/custom");

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function getCustomWorkouts() {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return { success: false, error: "Not authenticated", workouts: [] };
    }

    // Fetch user's custom workouts
    const { data: workouts, error: fetchError } = await supabase
      .from("workouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_preset", false)
      .order("created_at", { ascending: false });

    if (fetchError) {
      return { success: false, error: fetchError.message, workouts: [] };
    }

    return { success: true, workouts: workouts || [] };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
      workouts: []
    };
  }
}

export async function toggleWorkoutFavorite(workoutId: string) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Check if favorite already exists
    const { data: existingFavorite, error: checkError } = await supabase
      .from("user_favorite_workouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("workout_id", workoutId)
      .maybeSingle();

    if (checkError) {
      return { success: false, error: checkError.message };
    }

    if (existingFavorite) {
      // Unfavorite: delete the row
      const { error: deleteError } = await supabase
        .from("user_favorite_workouts")
        .delete()
        .eq("user_id", user.id)
        .eq("workout_id", workoutId);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }
    } else {
      // Favorite: insert the row
      const { error: insertError } = await supabase
        .from("user_favorite_workouts")
        .insert({
          user_id: user.id,
          workout_id: workoutId,
        });

      if (insertError) {
        return { success: false, error: insertError.message };
      }
    }

    // Revalidate the workouts pages
    revalidatePath("/workouts/presets");
    revalidatePath("/workouts/favorites");

    return { success: true, isFavorite: !existingFavorite };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
