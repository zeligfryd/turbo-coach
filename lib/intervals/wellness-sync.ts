import type { SupabaseClient } from "@supabase/supabase-js";
import { createIcuClient } from "./client";
import type { IcuWellnessDay } from "./types";

type WellnessSyncResult = {
  success: boolean;
  daysSynced: number;
  error?: string;
};

function mapWellnessToRow(userId: string, day: IcuWellnessDay) {
  // The wellness endpoint returns id as the date string (YYYY-MM-DD)
  const date = typeof day.id === "string" ? day.id : String(day.id);

  return {
    user_id: userId,
    date,
    ctl: day.ctl ?? null,
    atl: day.atl ?? null,
    tsb: day.ctl != null && day.atl != null ? day.ctl - day.atl : null,
    ramp_rate: day.rampRate ?? null,
    resting_hr: day.restingHR ?? null,
    hrv: day.hrv ?? null,
    raw_data: day as unknown as Record<string, unknown>,
    source: "intervals.icu",
    updated_at: new Date().toISOString(),
  };
}

export async function syncWellness(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
  athleteId: string
): Promise<WellnessSyncResult> {
  const client = createIcuClient(apiKey, athleteId);

  // Fetch last 90 days of wellness data
  const oldest = new Date();
  oldest.setDate(oldest.getDate() - 90);
  const newest = new Date();

  try {
    const days = await client.fetchWellness(
      oldest.toISOString().slice(0, 10),
      newest.toISOString().slice(0, 10)
    );

    if (days.length > 0) {
      const rows = days.map((d) => mapWellnessToRow(userId, d));

      const { error } = await supabase
        .from("wellness")
        .upsert(rows, { onConflict: "user_id,date,source" });

      if (error) {
        throw new Error(`Wellness upsert failed: ${error.message}`);
      }
    }

    return { success: true, daysSynced: days.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wellness sync failed";
    return { success: false, daysSynced: 0, error: message };
  }
}
