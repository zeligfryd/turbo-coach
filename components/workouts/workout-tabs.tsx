"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Presets", href: "/workouts/presets" },
  { label: "Favorites", href: "/workouts/favorites" },
  { label: "My Workouts", href: "/workouts/custom" },
];

export function WorkoutTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-border mb-6 sticky top-0 bg-background z-10">
      <nav className="flex gap-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "py-3 px-1 border-b-2 font-medium text-sm transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
