import { ProfileForm } from "@/components/profile-form";
import { CoachSettingsForm } from "@/components/coach-settings-form";
import { StravaConnection } from "@/components/strava-connection";
import { IntervalsConnection } from "@/components/intervals-connection";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { IcuConnectionRow } from "@/lib/intervals/types";
import type { StravaConnectionRow } from "@/lib/strava/types";
import type { CoachSettings } from "@/app/coach/actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect("/auth/login");
  }

  const [{ data: profile }, { data: stravaConnection }, { data: icuConnection }] =
    await Promise.all([
      supabase.from("users").select("ftp, weight, max_hr, lthr, weekly_summary_enabled, auto_analysis_enabled").eq("id", data.user.id).single(),
      supabase.from("strava_connections").select("*").eq("user_id", data.user.id).maybeSingle(),
      supabase.from("icu_connections").select("*").eq("user_id", data.user.id).maybeSingle(),
    ]);

  const coachSettings: CoachSettings = {
    weekly_summary_enabled: (profile as Record<string, unknown> | null)?.weekly_summary_enabled === true,
    auto_analysis_enabled: (profile as Record<string, unknown> | null)?.auto_analysis_enabled === true,
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <ProfileForm
        initialFtp={profile?.ftp ?? null}
        initialWeight={profile?.weight ?? null}
        initialMaxHr={(profile as Record<string, unknown> | null)?.max_hr as number | null ?? null}
        initialLthr={(profile as Record<string, unknown> | null)?.lthr as number | null ?? null}
        userId={data.user.id}
      />
      <CoachSettingsForm initialSettings={coachSettings} />
      <StravaConnection
        initialConnection={(stravaConnection as StravaConnectionRow) ?? null}
      />
      <IntervalsConnection
        initialConnection={(icuConnection as IcuConnectionRow) ?? null}
      />
    </div>
  );
}
