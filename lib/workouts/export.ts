import type { Workout, WorkoutInterval } from "./types";
import { flattenBuilderItems } from "./utils";

export type ExportFormat = "json" | "mrc" | "erg" | "zwo";

/**
 * Export a workout to JSON format
 * Flattens BuilderItems (repeat groups are expanded) to simple interval array
 */
export function exportToJSON(workout: Workout): string {
  // Flatten BuilderItems to simple intervals array
  const flattenedIntervals = flattenBuilderItems(workout.intervals);
  
  const exportData = {
    name: workout.name,
    description: workout.description,
    category: workout.category,
    tags: workout.tags,
    intervals: flattenedIntervals, // Flattened intervals (no repeat groups)
    exported_at: new Date().toISOString(),
    format_version: "1.0",
  };
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * Trigger browser download of workout file
 */
export function downloadWorkout(
  workout: Workout,
  format: ExportFormat = "json"
): void {
  let content: string;
  let filename: string;
  let mimeType: string;

  switch (format) {
    case "json":
      content = exportToJSON(workout);
      filename = `${sanitizeFilename(workout.name)}.json`;
      mimeType = "application/json";
      break;
    // Future formats:
    // case "mrc":
    // case "erg":
    // case "zwo":
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  // Create blob and trigger download
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize filename to remove invalid characters
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9_\-]/gi, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}
