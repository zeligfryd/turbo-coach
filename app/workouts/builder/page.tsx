"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { WorkoutBuilder } from "@/components/workouts/workout-builder";

/**
 * The builder as a route.
 *
 * The builder itself lives in a component so it can also be opened in a dialog
 * from the plan composer — one editor, not a full one here and a cut-down copy
 * there. This wrapper only supplies what the URL carries.
 */
function BuilderFromUrl() {
  const searchParams = useSearchParams();
  return (
    <WorkoutBuilder
      mode={(searchParams.get("mode") || "create") as "create" | "edit" | "copy"}
      workoutId={searchParams.get("id")}
      fromCoach={searchParams.get("from") === "coach"}
    />
  );
}

export default function WorkoutBuilderPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}
    >
      <BuilderFromUrl />
    </Suspense>
  );
}
