import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthButton } from "@/components/auth-button";
import { FloatingCoach } from "@/components/coach/floating-coach";
import { Sidebar } from "@/components/sidebar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type ProtectedAppShellProps = {
  children: React.ReactNode;
  contentClassName?: string;
  contentInnerClassName?: string;
  showFloatingCoach?: boolean;
};

export async function ProtectedAppShell({
  children,
  contentClassName,
  contentInnerClassName,
  showFloatingCoach = true,
}: ProtectedAppShellProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect("/auth/login");
  }

  return (
    <div className="md:flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex flex-col overflow-auto h-screen md:flex-1">
        <header className="h-16 min-h-16 flex-shrink-0 flex items-center justify-end px-4 sm:px-6 gap-2 sm:gap-4 bg-card shadow-sm">
          <Suspense>
            <AuthButton />
          </Suspense>
          <ThemeSwitcher />
        </header>
        <div className={cn("flex-1 p-4 sm:p-6", contentClassName)}>
          <div className={cn("max-w-7xl mx-auto", contentInnerClassName)}>{children}</div>
        </div>
        {showFloatingCoach && <FloatingCoach />}
      </main>
    </div>
  );
}
