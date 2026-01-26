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
    <div className="mb-6 sticky top-0 bg-background z-10 -mx-6 px-6 overflow-x-auto">
      <nav className="flex gap-2 min-w-max">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "py-2.5 px-4 rounded-lg font-medium text-sm transition-all whitespace-nowrap",
                isActive
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
