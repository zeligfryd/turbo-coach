import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingPlan } from "@/lib/plans/types";

export type RiderSnapshot = {
  profile: {
    ftp: number | null;
    weight_kg: number | null;
    wkg: number | null;
    max_hr: number | null;
    lthr: number | null;
  };
  hr_zones: {
    z1: [number, number];
    z2: [number, number];
    z3: [number, number];
    z4: [number, number];
    z5: [number, number];
  } | null;
  power_zones: {
    z1: [number, number];
    z2: [number, number];
    z3: [number, number];
    z4: [number, number];
    z5: [number, number];
    z6: [number, number];
    z7: [number, number | null];
  } | null;
  fitness: {
    date: string;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    ramp_rate: number | null;
  } | null;
  recent_training: {
    window_days: number;
    rides: number;
    tss: number;
    hours: number;
  } | null;
  target_event: {
    id: string;
    name: string;
    race_date: string;
    days_until: number;
    event_type: string;
    distance_km: number | null;
    elevation_m: number | null;
  } | null;
};

function computeHrZones(lthr: number | null, maxHr: number | null): RiderSnapshot["hr_zones"] {
  const anchor = lthr ?? (maxHr != null ? Math.round(maxHr * 0.93) : null);
  if (!anchor) return null;
  return {
    z1: [0, Math.round(anchor * 0.81)],
    z2: [Math.round(anchor * 0.81) + 1, Math.round(anchor * 0.89)],
    z3: [Math.round(anchor * 0.89) + 1, Math.round(anchor * 0.93)],
    z4: [Math.round(anchor * 0.93) + 1, Math.round(anchor * 0.99)],
    z5: [Math.round(anchor * 0.99) + 1, maxHr ?? Math.round(anchor * 1.1)],
  };
}

function computePowerZones(ftp: number | null): RiderSnapshot["power_zones"] {
  if (!ftp) return null;
  return {
    z1: [0, Math.round(ftp * 0.55)],
    z2: [Math.round(ftp * 0.55) + 1, Math.round(ftp * 0.75)],
    z3: [Math.round(ftp * 0.75) + 1, Math.round(ftp * 0.9)],
    z4: [Math.round(ftp * 0.9) + 1, Math.round(ftp * 1.05)],
    z5: [Math.round(ftp * 1.05) + 1, Math.round(ftp * 1.2)],
    z6: [Math.round(ftp * 1.2) + 1, Math.round(ftp * 1.5)],
    z7: [Math.round(ftp * 1.5) + 1, null],
  };
}

export async function loadRiderSnapshot(
  supabase: SupabaseClient,
  userId: string,
  plan: Pick<TrainingPlan, "target_event_id">,
  today: string,
): Promise<RiderSnapshot> {
  const windowDays = 14;
  const start = new Date(today);
  start.setDate(start.getDate() - windowDays);
  const startIso = start.toISOString().slice(0, 10);

  const [{ data: userRow }, { data: wellnessRow }, { data: recentRows }, raceResult] =
    await Promise.all([
      supabase
        .from("users")
        .select("ftp, weight, max_hr, lthr")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("wellness")
        .select("date, ctl, atl, tsb, ramp_rate")
        .eq("user_id", userId)
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("activities")
        .select("icu_training_load, moving_time")
        .eq("user_id", userId)
        .gte("activity_date", startIso)
        .lte("activity_date", today),
      plan.target_event_id
        ? supabase
            .from("race_events")
            .select("id, name, race_date, event_type, distance_km, elevation_m")
            .eq("id", plan.target_event_id)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const ftp = (userRow?.ftp as number | null) ?? null;
  const weight = (userRow?.weight as number | null) ?? null;
  const maxHr = (userRow?.max_hr as number | null) ?? null;
  const lthr = (userRow?.lthr as number | null) ?? null;

  const rows = (recentRows ?? []) as Array<{
    icu_training_load: number | null;
    moving_time: number | null;
  }>;
  const totalTss = rows.reduce((s, r) => s + (r.icu_training_load ?? 0), 0);
  const totalSec = rows.reduce((s, r) => s + (r.moving_time ?? 0), 0);

  let targetEvent: RiderSnapshot["target_event"] = null;
  const race = (raceResult as { data: Record<string, unknown> | null }).data;
  if (race) {
    const raceDate = race.race_date as string;
    const daysUntil = Math.round(
      (new Date(raceDate).getTime() - new Date(today).getTime()) / 86_400_000,
    );
    targetEvent = {
      id: race.id as string,
      name: race.name as string,
      race_date: raceDate,
      days_until: daysUntil,
      event_type: race.event_type as string,
      distance_km: (race.distance_km as number | null) ?? null,
      elevation_m: (race.elevation_m as number | null) ?? null,
    };
  }

  return {
    profile: {
      ftp,
      weight_kg: weight,
      wkg: ftp && weight ? Number((ftp / weight).toFixed(2)) : null,
      max_hr: maxHr,
      lthr,
    },
    hr_zones: computeHrZones(lthr, maxHr),
    power_zones: computePowerZones(ftp),
    fitness: wellnessRow
      ? {
          date: wellnessRow.date as string,
          ctl: wellnessRow.ctl != null ? Math.round(Number(wellnessRow.ctl)) : null,
          atl: wellnessRow.atl != null ? Math.round(Number(wellnessRow.atl)) : null,
          tsb: wellnessRow.tsb != null ? Math.round(Number(wellnessRow.tsb)) : null,
          ramp_rate:
            wellnessRow.ramp_rate != null
              ? Number(Number(wellnessRow.ramp_rate).toFixed(1))
              : null,
        }
      : null,
    recent_training: rows.length
      ? {
          window_days: windowDays,
          rides: rows.length,
          tss: Math.round(totalTss),
          hours: Number((totalSec / 3600).toFixed(1)),
        }
      : null,
    target_event: targetEvent,
  };
}

export function renderRiderSnapshot(s: RiderSnapshot): string {
  const lines: string[] = ["RIDER SNAPSHOT:"];

  const p = s.profile;
  const profileParts: string[] = [];
  if (p.ftp != null) profileParts.push(`FTP ${p.ftp}W`);
  if (p.weight_kg != null) profileParts.push(`${p.weight_kg}kg`);
  if (p.wkg != null) profileParts.push(`${p.wkg} W/kg`);
  if (p.max_hr != null) profileParts.push(`maxHR ${p.max_hr}`);
  if (p.lthr != null) profileParts.push(`LTHR ${p.lthr}`);
  lines.push(
    profileParts.length > 0
      ? `- Profile: ${profileParts.join(" · ")}`
      : "- Profile: (no FTP/weight/HR set — ask the rider before prescribing absolute targets)",
  );

  if (s.power_zones) {
    const z = s.power_zones;
    lines.push(
      `- Power zones (W): Z1 ${z.z1[0]}-${z.z1[1]} · Z2 ${z.z2[0]}-${z.z2[1]} · Z3 ${z.z3[0]}-${z.z3[1]} · Z4 ${z.z4[0]}-${z.z4[1]} · Z5 ${z.z5[0]}-${z.z5[1]} · Z6 ${z.z6[0]}-${z.z6[1]} · Z7 ${z.z7[0]}+`,
    );
  }

  if (s.hr_zones) {
    const z = s.hr_zones;
    lines.push(
      `- HR zones (bpm): Z1 <${z.z1[1]} · Z2 ${z.z2[0]}-${z.z2[1]} · Z3 ${z.z3[0]}-${z.z3[1]} · Z4 ${z.z4[0]}-${z.z4[1]} · Z5 ${z.z5[0]}+`,
    );
  }

  if (s.fitness) {
    const f = s.fitness;
    const parts: string[] = [];
    if (f.ctl != null) parts.push(`CTL ${f.ctl}`);
    if (f.atl != null) parts.push(`ATL ${f.atl}`);
    if (f.tsb != null) parts.push(`TSB ${f.tsb}`);
    if (f.ramp_rate != null) parts.push(`ramp ${f.ramp_rate}/wk`);
    lines.push(`- Fitness (as of ${f.date}): ${parts.join(" · ") || "no wellness data"}`);
  } else {
    lines.push("- Fitness: no wellness history yet");
  }

  if (s.recent_training) {
    const r = s.recent_training;
    lines.push(
      `- Last ${r.window_days}d: ${r.rides} rides · ${r.tss} TSS · ${r.hours}h`,
    );
  } else {
    lines.push("- Last 14d: no recorded rides");
  }

  if (s.target_event) {
    const t = s.target_event;
    const detailParts: string[] = [];
    if (t.distance_km != null) detailParts.push(`${t.distance_km}km`);
    if (t.elevation_m != null) detailParts.push(`${t.elevation_m}m elev`);
    const detail = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
    lines.push(
      `- Target event: ${t.name} · ${t.event_type} · ${t.race_date} (${t.days_until}d away)${detail}`,
    );
  } else {
    lines.push(
      "- Target event: none linked — plan is open-ended. Ask the rider about goal and timeline if unclear.",
    );
  }

  return lines.join("\n");
}
