import { ProfileForm } from "@/components/profile-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect("/auth/login");
  }

  // Fetch user profile data
  const { data: profile } = await supabase
    .from("users")
    .select("ftp, weight")
    .eq("id", data.user.id)
    .single();

  return (
    <div className="w-full max-w-2xl mx-auto">
      <ProfileForm
        initialFtp={profile?.ftp ?? null}
        initialWeight={profile?.weight ?? null}
        userId={data.user.id}
      />
    </div>
  );
}
