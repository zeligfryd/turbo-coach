import Link from "next/link";
import { Suspense } from "react";
import { AuthButton } from "./auth-button";

export function NavBar() {
  return (
    <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
      <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
        <div className="flex gap-5 items-center font-semibold">
          <Link href="/">Turbo Coach</Link>
          <Link
            href="/workouts"
            className="text-foreground/80 hover:text-foreground transition-colors"
          >
            Workouts
          </Link>
        </div>
        <Suspense>
          <AuthButton />
        </Suspense>
      </div>
    </nav>
  );
}
