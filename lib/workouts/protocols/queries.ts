import { createClient } from "@/lib/supabase/client";
import type { WorkoutCategory } from "../types";
import type { WorkoutProtocol } from "./types";
import { validateWorkoutProtocol } from "./types";

/**
 * Fetch all workout protocols (preset only)
 */
export async function fetchAllProtocols(): Promise<WorkoutProtocol[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("workout_protocols")
    .select("*")
    .eq("is_preset", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching protocols:", error);
    return [];
  }

  return data.map((row) => validateWorkoutProtocol(row));
}

/**
 * Fetch protocols by category
 */
export async function fetchProtocolsByCategory(
  category: WorkoutCategory
): Promise<WorkoutProtocol[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("workout_protocols")
    .select("*")
    .eq("is_preset", true)
    .eq("category", category)
    .order("name", { ascending: true });

  if (error) {
    console.error(`Error fetching protocols for category ${category}:`, error);
    return [];
  }

  return data.map((row) => validateWorkoutProtocol(row));
}

/**
 * Fetch a single protocol by ID
 */
export async function fetchProtocolById(
  id: string
): Promise<WorkoutProtocol | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("workout_protocols")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Error fetching protocol ${id}:`, error);
    return null;
  }

  return validateWorkoutProtocol(data);
}

export interface ProtocolFilters {
  // Note: Duration filtering is done client-side since we removed typical_duration_minutes from DB
  minIntensity?: number;
  maxIntensity?: number;
  tags?: string[];
}

/**
 * Search and filter protocols
 */
export async function searchProtocols(
  searchQuery?: string,
  filters?: ProtocolFilters
): Promise<WorkoutProtocol[]> {
  const supabase = createClient();

  let query = supabase
    .from("workout_protocols")
    .select("*")
    .eq("is_preset", true);

  // Text search
  if (searchQuery && searchQuery.trim()) {
    query = query.or(
      `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
    );
  }

  // Intensity filters
  if (filters?.minIntensity !== undefined) {
    query = query.gte("intensity_level", filters.minIntensity);
  }
  if (filters?.maxIntensity !== undefined) {
    query = query.lte("intensity_level", filters.maxIntensity);
  }

  // Tag filters
  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps("tags", filters.tags);
  }

  query = query.order("category", { ascending: true }).order("name", {
    ascending: true,
  });

  const { data, error } = await query;

  if (error) {
    console.error("Error searching protocols:", error);
    return [];
  }

  return data.map((row) => validateWorkoutProtocol(row));
}

/**
 * Get all unique tags from protocols
 */
export async function fetchAllProtocolTags(): Promise<string[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("workout_protocols")
    .select("tags")
    .eq("is_preset", true);

  if (error) {
    console.error("Error fetching protocol tags:", error);
    return [];
  }

  // Flatten and deduplicate tags
  const allTags = data.flatMap((row) => row.tags || []);
  return Array.from(new Set(allTags)).sort();
}

/**
 * Get protocols grouped by category
 */
export async function fetchProtocolsGroupedByCategory(): Promise<
  Record<WorkoutCategory, WorkoutProtocol[]>
> {
  const protocols = await fetchAllProtocols();

  const grouped: Partial<Record<WorkoutCategory, WorkoutProtocol[]>> = {};

  for (const protocol of protocols) {
    if (!grouped[protocol.category]) {
      grouped[protocol.category] = [];
    }
    grouped[protocol.category]!.push(protocol);
  }

  return grouped as Record<WorkoutCategory, WorkoutProtocol[]>;
}

/**
 * Get intensity level label
 */
export function getIntensityLabel(level: number): string {
  if (level <= 2) return "Recovery";
  if (level <= 4) return "Easy";
  if (level <= 6) return "Moderate";
  if (level <= 8) return "Hard";
  return "Very Hard";
}

/**
 * Format duration for display
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}
