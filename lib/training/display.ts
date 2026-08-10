/**
 * Presentation helpers shared by every training surface.
 *
 * Colour tokens live in app/globals.css so light and dark stay in one place;
 * this module only maps a value to its token, its icon and its label.
 */

import { Activity, Bike, Dumbbell, Flower2, ShieldPlus, type LucideIcon } from "lucide-react";

import { AREA_LABELS, MODALITY_LABELS, type FocusArea, type Modality } from "./taxonomy";
import type { CoverageStatus } from "./types";

export const MODALITY_ICONS: Record<Modality, LucideIcon> = {
  bike: Bike,
  strength: Dumbbell,
  mobility: Activity,
  yoga: Flower2,
  prehab: ShieldPlus,
};

/** `hsl(var(--modality-x))`, for inline style on a border or swatch. */
export function modalityColor(modality: Modality): string {
  return `hsl(var(--modality-${modality}))`;
}

export function coverageColor(status: CoverageStatus): string {
  const token =
    status === "fresh" ? "fresh" : status === "due" ? "due" : status === "overdue" ? "overdue" : "never";
  return `hsl(var(--coverage-${token}))`;
}

export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  fresh: "Fresh",
  due: "Due soon",
  overdue: "Overdue",
  never: "Not yet tracked",
};

export { AREA_LABELS, MODALITY_LABELS, type FocusArea, type Modality };

/** "1:30" for 90, "45m" for 45. Bare minutes read badly past an hour. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}:${String(rest).padStart(2, "0")}`;
}

/** "9 days ago", "yesterday", "today" — the way a person would say it. */
export function formatDaysAgo(days: number | null): string {
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
