"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, Home, Bike } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "turbo-coach-sidebar-collapsed";

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true); // Start collapsed to avoid flicker
  const [isLoaded, setIsLoaded] = useState(false);
  const pathname = usePathname();

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Expand if no value in localStorage or if explicitly set to expanded
    if (stored === null || stored === "false") {
      setIsCollapsed(false);
    }
    // If stored === "true", keep it collapsed (already the default)
    setIsLoaded(true);
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(STORAGE_KEY, String(newState));
  };

  const navItems = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/workouts", label: "Workouts", icon: Bike },
  ];

  return (
    <aside
      className={cn(
        "h-screen border-r border-border bg-background flex flex-col transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-60"
      )}
    >
      {/* Toggle Button */}
      <div className="h-16 flex items-center justify-start border-b border-border px-4">
        <button
          onClick={toggleCollapsed}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive && "bg-accent text-accent-foreground font-medium",
                    isCollapsed && "justify-center"
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="transition-opacity duration-200">
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Brand at bottom (optional) */}
      {!isCollapsed && isLoaded && (
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Turbo Coach
          </p>
        </div>
      )}
    </aside>
  );
}
