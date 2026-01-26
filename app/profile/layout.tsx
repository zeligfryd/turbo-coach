import { Sidebar } from "@/components/sidebar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AuthButton } from "@/components/auth-button";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect("/auth/login");
  }

  return (
    <div className="md:flex h-screen overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area - Full width on mobile (sidebar overlays), flex-1 on desktop */}
      <main className="flex flex-col overflow-auto h-screen md:flex-1">
        {/* Top Header with Auth and Theme Switcher */}
        <header className="h-16 min-h-16 flex-shrink-0 border-b border-border flex items-center justify-end px-4 sm:px-6 gap-2 sm:gap-4 bg-background">
          <Suspense>
            <AuthButton />
          </Suspense>
          <ThemeSwitcher />
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
