import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RaceDetailClient } from "@/components/race/race-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RacePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: raceRaw } = await supabase
    .from("race_events")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!raceRaw) {
    redirect("/calendar");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("ftp, weight")
    .eq("id", user.id)
    .maybeSingle();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <RaceDetailClient
      race={raceRaw as any}
      userFtp={profile?.ftp ?? null}
      userWeight={profile?.weight ?? null}
    />
  );
}
