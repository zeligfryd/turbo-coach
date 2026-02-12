import {
  calculateAverageIntensityFromItems,
  calculateTotalDurationFromItems,
  calculateTSS,
  formatDuration,
} from "@/lib/workouts/utils";
import type { Workout } from "@/lib/workouts/types";

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeekMonday(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfWeekSunday(date: Date): Date {
  return addDays(startOfWeekMonday(date), 6);
}

export function getWeeksForMonth(monthDate: Date): Date[][] {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calendarStart = startOfWeekMonday(monthStart);
  const calendarEnd = endOfWeekSunday(monthEnd);
  const weeks: Date[][] = [];
  let current = calendarStart;

  while (current <= calendarEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(addDays(current, i));
    }
    weeks.push(week);
    current = addDays(current, 7);
  }

  return weeks;
}

export function getWeeksBetween(start: Date, end: Date): Date[][] {
  const weeks: Date[][] = [];
  let current = startOfWeekMonday(start);
  const last = endOfWeekSunday(end);

  while (current <= last) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(addDays(current, i));
    }
    weeks.push(week);
    current = addDays(current, 7);
  }

  return weeks;
}

export function getWeekStartKey(date: Date): string {
  return formatDateKey(startOfWeekMonday(date));
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function getWorkoutMetrics(workout: Workout) {
  const durationSeconds =
    workout.duration_seconds ?? calculateTotalDurationFromItems(workout.intervals);
  const avgIntensityPercent =
    workout.avg_intensity_percent ?? calculateAverageIntensityFromItems(workout.intervals);
  const tss = calculateTSS(avgIntensityPercent, durationSeconds);

  return { durationSeconds, tss };
}

export function formatHoursFromSeconds(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  return formatDuration(minutes);
}
