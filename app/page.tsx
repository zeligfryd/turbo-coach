import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Suspense } from "react";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  // Redirect authenticated users to dashboard
  if (data?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6">
        <div className="text-lg font-semibold">Turbo Coach</div>
        <div className="flex items-center gap-4">
          <Suspense>
            <AuthButton />
          </Suspense>
          <ThemeSwitcher />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col gap-8 items-center max-w-2xl text-center">
          <h1 className="text-4xl lg:text-5xl font-bold !leading-tight">
            Welcome to Turbo Coach
          </h1>
          <p className="text-lg text-muted-foreground">
            Your cycling training companion. Sign in to access your personalized workout library.
          </p>
        </div>
      </main>
    </div>
  );
}
