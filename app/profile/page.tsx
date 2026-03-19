import { ProfileForm } from "@/components/profile-form";
import { StravaConnection } from "@/components/strava-connection";
import { IntervalsConnection } from "@/components/intervals-connection";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { IcuConnectionRow } from "@/lib/intervals/types";
import type { StravaConnectionRow } from "@/lib/strava/types";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect("/auth/login");
  }

  const [{ data: profile }, { data: stravaConnection }, { data: icuConnection }] =
    await Promise.all([
      supabase.from("users").select("ftp, weight").eq("id", data.user.id).single(),
      supabase.from("strava_connections").select("*").eq("user_id", data.user.id).maybeSingle(),
      supabase.from("icu_connections").select("*").eq("user_id", data.user.id).maybeSingle(),
    ]);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <ProfileForm
        initialFtp={profile?.ftp ?? null}
        initialWeight={profile?.weight ?? null}
        userId={data.user.id}
      />
      <StravaConnection
        initialConnection={(stravaConnection as StravaConnectionRow) ?? null}
      />
      <IntervalsConnection
        initialConnection={(icuConnection as IcuConnectionRow) ?? null}
      />
    </div>
  );
}
