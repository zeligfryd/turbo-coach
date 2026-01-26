"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, Home, Bike, User } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "turbo-coach-sidebar-collapsed";

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true); // Start collapsed to avoid flicker
  const [isMobileOpen, setIsMobileOpen] = useState(false); // Mobile drawer state
  const [isLoaded, setIsLoaded] = useState(false);
  const pathname = usePathname();

  // Load collapsed state from localStorage on mount (desktop only)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Expand if no value in localStorage or if explicitly set to expanded
    if (stored === null || stored === "false") {
      setIsCollapsed(false);
    }
    // If stored === "true", keep it collapsed (already the default)
    setIsLoaded(true);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Save collapsed state to localStorage (desktop only)
  const toggleCollapsed = () => {
    // On mobile, toggle the drawer
    if (window.innerWidth < 768) {
      setIsMobileOpen(!isMobileOpen);
    } else {
      // On desktop, toggle collapsed state
      const newState = !isCollapsed;
      setIsCollapsed(newState);
      localStorage.setItem(STORAGE_KEY, String(newState));
    }
  };

  const navItems = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/workouts", label: "Workouts", icon: Bike },
  ];

  return (
    <>
      {/* Mobile Menu Button - Always visible on mobile */}
      <button
        onClick={toggleCollapsed}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card shadow-md hover:bg-accent transition-colors"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Backdrop for mobile */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "h-screen bg-card flex flex-col transition-all duration-300 ease-in-out",
          // Mobile: Fixed overlay that slides in from left
          "fixed left-0 top-0 w-60 z-40 shadow-xl",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: Static sidebar with collapsible width
          "md:relative md:translate-x-0 md:shadow-none",
          isCollapsed ? "md:w-16" : "md:w-60"
        )}
      >
        {/* Toggle Button - Hidden on mobile, visible on desktop */}
        <div className="h-16 hidden md:flex items-center justify-start px-4">
          <button
            onClick={toggleCollapsed}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Header */}
        <div className="h-16 flex md:hidden items-center justify-between px-4">
          <span className="font-semibold">Menu</span>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label="Close menu"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
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
                      "md:justify-start",
                      isCollapsed && "md:justify-center"
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="md:hidden transition-opacity duration-200">
                      {item.label}
                    </span>
                    {!isCollapsed && (
                      <span className="hidden md:inline transition-opacity duration-200">
                        {item.label}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Brand at bottom */}
        {isLoaded && (
          <div className="p-4 md:hidden">
            <p className="text-xs text-muted-foreground text-center">
              Turbo Coach
            </p>
          </div>
        )}
        {!isCollapsed && isLoaded && (
          <div className="hidden md:block p-4">
            <p className="text-xs text-muted-foreground text-center">
              Turbo Coach
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
