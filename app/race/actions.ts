"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { RaceEvent, CalendarRaceEvent, EventType } from "@/lib/race/types";

// ── Read ────────────────────────────────────────────────────────────

export async function getRaceEvent(id: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated", race: null };

    const { data, error } = await supabase
      .from("race_events")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return { success: false as const, error: error.message, race: null };
    if (!data) return { success: false as const, error: "Race event not found", race: null };

    return { success: true as const, race: data as RaceEvent };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error", race: null };
  }
}

export async function getRaceEvents(startDate: string, endDate: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated", races: [] };

    const { data, error } = await supabase
      .from("race_events")
      .select("id, race_date, name, event_type, distance_km, elevation_m")
      .eq("user_id", user.id)
      .gte("race_date", startDate)
      .lte("race_date", endDate)
      .order("race_date", { ascending: true });

    if (error) return { success: false as const, error: error.message, races: [] };

    return { success: true as const, races: (data as CalendarRaceEvent[]) ?? [] };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error", races: [] };
  }
}

/** Get all upcoming races (for coach context) */
export async function getUpcomingRaces() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return [];

    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("race_events")
      .select("id, name, race_date, event_type, distance_km, elevation_m, readiness_score")
      .eq("user_id", user.id)
      .gte("race_date", today)
      .order("race_date", { ascending: true })
      .limit(5);

    return (data ?? []) as Array<{
      id: string;
      name: string;
      race_date: string;
      event_type: string;
      distance_km: number | null;
      elevation_m: number | null;
      readiness_score: number | null;
    }>;
  } catch {
    return [];
  }
}

// ── Write ───────────────────────────────────────────────────────────

export async function createRaceEvent(params: {
  name: string;
  race_date: string;
  event_type: EventType;
  distance_km?: number | null;
  elevation_m?: number | null;
  notes?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const { data, error } = await supabase
      .from("race_events")
      .insert({
        user_id: user.id,
        name: params.name,
        race_date: params.race_date,
        event_type: params.event_type,
        distance_km: params.distance_km ?? null,
        elevation_m: params.elevation_m ?? null,
        notes: params.notes ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false as const, error: error.message };

    revalidatePath("/calendar");
    return { success: true as const, id: data.id as string };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateRaceEvent(
  id: string,
  params: Partial<{
    name: string;
    race_date: string;
    event_type: EventType;
    distance_km: number | null;
    elevation_m: number | null;
    notes: string | null;
    gpx_data: unknown;
    pacing_plan: unknown;
    readiness_score: number | null;
    readiness_interpretation: string | null;
  }>
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const { error } = await supabase
      .from("race_events")
      .update({ ...params, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false as const, error: error.message };

    revalidatePath("/calendar");
    revalidatePath(`/race/${id}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteRaceEvent(id: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: "Not authenticated" };

    const { error } = await supabase
      .from("race_events")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false as const, error: error.message };

    revalidatePath("/calendar");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
