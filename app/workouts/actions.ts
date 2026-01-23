"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
