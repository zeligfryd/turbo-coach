import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PerformanceClient } from "@/components/performance/performance-client";

export default async function PerformancePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("ftp, weight, gender")
    .eq("id", data.user.id)
    .maybeSingle();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Power curve and rider profile based on your training history
        </p>
      </div>
      <PerformanceClient
        userFtp={(profile as Record<string, unknown> | null)?.ftp as number | null ?? null}
        userWeight={(profile as Record<string, unknown> | null)?.weight as number | null ?? null}
      />
    </div>
  );
}
