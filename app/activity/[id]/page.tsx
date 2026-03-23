import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ActivityDetailClient } from "@/components/activity/activity-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ActivityPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch basic activity info for the header (fast, from DB)
  const { data: activityRaw } = await supabase
    .from("icu_activities")
    .select(
      "id, external_id, source, name, type, activity_date, start_date_local, " +
      "moving_time, distance, elevation_gain, avg_power, normalized_power, max_power, " +
      "avg_hr, max_hr, avg_cadence, calories, icu_training_load, icu_intensity, icu_ftp, " +
      "icu_atl, icu_ctl"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!activityRaw) {
    redirect("/calendar");
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const activity = activityRaw as any;

  return (
    <ActivityDetailClient
      activityId={id}
      basicActivity={activity}
    />
  );
}
