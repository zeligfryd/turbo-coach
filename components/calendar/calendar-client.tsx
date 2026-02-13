"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarAgenda } from "./calendar-agenda";
import { CalendarGrid } from "./calendar-grid";
import { MonthPicker } from "./month-picker";
import { WorkoutPickerModal } from "./workout-picker-modal";
import {
  addMonths,
  endOfMonth,
  endOfWeekSunday,
  formatMonthLabel,
  formatDateKey,
  getWeeksBetween,
  parseDateKey,
  startOfMonth,
  startOfWeekMonday,
} from "./utils";
import type { ScheduledWorkout } from "./types";
import { getScheduledWorkouts, removeScheduledWorkout, scheduleWorkout } from "@/app/calendar/actions";

function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function buildMonthWindow(center: Date, pastCount: number, futureCount: number) {
  const months: Date[] = [];
  for (let offset = -pastCount; offset <= futureCount; offset += 1) {
    months.push(addMonths(center, offset));
  }
  return months;
}

export function CalendarClient() {
  const today = startOfMonth(new Date());
  const [months, setMonths] = useState<Date[]>(() => buildMonthWindow(today, 6, 6));
  const [selectedMonthKey, setSelectedMonthKey] = useState(getMonthKey(today));
  const [viewingMonthKey, setViewingMonthKey] = useState(getMonthKey(today));
  const [scheduledByDate, setScheduledByDate] = useState<Record<string, ScheduledWorkout[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingPrependAdjust = useRef<number | null>(null);
  const pendingScrollToDate = useRef<string | null>(null);
  const pendingScrollRaf = useRef<number | null>(null);
  const didInitScroll = useRef(false);
  const isAutoScrolling = useRef(false);
  const suppressAddUntil = useRef(0);

  const monthOptions = useMemo(() => {
    const options = [];
    const baseDate = parseMonthKey(viewingMonthKey);
    for (let offset = -12; offset <= 12; offset += 1) {
      const date = addMonths(baseDate, offset);
      options.push({ value: getMonthKey(date), label: formatMonthLabel(date) });
    }
    return options;
  }, [viewingMonthKey]);

  const range = useMemo(() => {
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    const start = startOfWeekMonday(startOfMonth(firstMonth));
    const end = endOfWeekSunday(endOfMonth(lastMonth));
    return {
      startDate: formatDateKey(start),
      endDate: formatDateKey(end),
      start,
      end,
    };
  }, [months]);

  const weeks = useMemo(() => getWeeksBetween(range.start, range.end), [range]);

  const fetchScheduled = useCallback(async () => {
    setIsLoading(true);
    const result = await getScheduledWorkouts(range.startDate, range.endDate);
    if (result.success) {
      const grouped: Record<string, ScheduledWorkout[]> = {};
      result.workouts.forEach((item: ScheduledWorkout) => {
        const key = item.scheduled_date;
        grouped[key] = grouped[key] || [];
        grouped[key].push(item);
      });
      setScheduledByDate(grouped);
    }
    setIsLoading(false);
  }, [range.startDate, range.endDate]);

  useEffect(() => {
    fetchScheduled();
  }, [fetchScheduled]);

  const updateViewingMonth = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const dayElements = Array.from(container.querySelectorAll<HTMLElement>("[data-day-date]"));
    if (dayElements.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    setViewingMonthKey((current) => {
      const monthVisibility = new Map<string, number>();

      dayElements.forEach((element) => {
        const dateKey = element.dataset.dayDate;
        if (!dateKey) return;

        const dayRect = element.getBoundingClientRect();
        const visibleTop = Math.max(dayRect.top, containerRect.top);
        const visibleBottom = Math.min(dayRect.bottom, containerRect.bottom);
        const visibleHeight = visibleBottom - visibleTop;
        if (visibleHeight <= 0) return;

        const monthKey = getMonthKey(parseDateKey(dateKey));
        const visibleRatio = visibleHeight / Math.max(dayRect.height, 1);
        monthVisibility.set(monthKey, (monthVisibility.get(monthKey) ?? 0) + visibleRatio);
      });

      if (monthVisibility.size === 0) return current;

      let bestMonthKey = current;
      let bestScore = -1;
      monthVisibility.forEach((score, monthKey) => {
        if (
          score > bestScore + 0.001 ||
          (Math.abs(score - bestScore) <= 0.001 && monthKey === current)
        ) {
          bestScore = score;
          bestMonthKey = monthKey;
        }
      });

      return bestMonthKey;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (pendingScrollRaf.current !== null) return;
    pendingScrollRaf.current = requestAnimationFrame(() => {
      pendingScrollRaf.current = null;
      updateViewingMonth();
    });

    const container = scrollRef.current;
    if (!container) return;

    const threshold = 200;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isProgrammaticMonthJump = pendingScrollToDate.current !== null;

    if (isProgrammaticMonthJump || isAutoScrolling.current) {
      return;
    }

    if (scrollTop < threshold) {
      const first = months[0];
      const previous = addMonths(first, -1);
      const previousKey = getMonthKey(previous);
      if (!months.some((m) => getMonthKey(m) === previousKey)) {
        pendingPrependAdjust.current = container.scrollHeight;
        setMonths((prev) => [previous, ...prev]);
      }
    }

    if (scrollHeight - scrollTop - clientHeight < threshold) {
      const last = months[months.length - 1];
      const next = addMonths(last, 1);
      const nextKey = getMonthKey(next);
      if (!months.some((m) => getMonthKey(m) === nextKey)) {
        setMonths((prev) => [...prev, next]);
      }
    }
  }, [months, updateViewingMonth]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (pendingPrependAdjust.current !== null) {
      const previousHeight = pendingPrependAdjust.current;
      const newHeight = container.scrollHeight;
      container.scrollTop += newHeight - previousHeight;
      pendingPrependAdjust.current = null;
    }
  }, [months]);

  const alignDateRowToTop = useCallback((container: HTMLDivElement, dateKey: string) => {
    const target = container.querySelector<HTMLElement>(`[data-day-date="${dateKey}"]`);
    if (!target) {
      return false;
    }

    const targetWeek = target.closest<HTMLElement>("[data-week-start]");
    const anchor = targetWeek ?? target;
    const stickyHeader = container.querySelector<HTMLElement>("[data-calendar-sticky-header]");
    const stickyHeaderOffset = stickyHeader?.offsetHeight ?? 0;
    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const desiredTop = containerRect.top + stickyHeaderOffset;
    const delta = anchorRect.top - desiredTop;

    if (Math.abs(delta) > 1) {
      container.scrollTop += delta;
    }

    return true;
  }, []);

  const scrollToDate = useCallback(
    (dateKey: string) => {
      const container = scrollRef.current;
      if (!container) {
        pendingScrollToDate.current = dateKey;
        return;
      }
      if (alignDateRowToTop(container, dateKey)) {
        pendingScrollToDate.current = null;
        isAutoScrolling.current = true;
        requestAnimationFrame(() => {
          const liveContainer = scrollRef.current;
          if (!liveContainer) return;
          alignDateRowToTop(liveContainer, dateKey);
          requestAnimationFrame(() => {
            const latestContainer = scrollRef.current;
            if (latestContainer) {
              alignDateRowToTop(latestContainer, dateKey);
            }
            isAutoScrolling.current = false;
            updateViewingMonth();
          });
        });
      } else {
        pendingScrollToDate.current = dateKey;
      }
    },
    [alignDateRowToTop, updateViewingMonth]
  );

  useEffect(() => {
    const targetKey = pendingScrollToDate.current;
    if (targetKey) {
      scrollToDate(targetKey);
    }
  }, [weeks, scrollToDate]);

  useEffect(() => {
    updateViewingMonth();
  }, [weeks, updateViewingMonth]);

  useEffect(() => {
    if (didInitScroll.current) return;
    if (weeks.length === 0) return;
    didInitScroll.current = true;
    scrollToDate(formatDateKey(startOfMonth(parseMonthKey(selectedMonthKey))));
  }, [weeks, selectedMonthKey, scrollToDate]);

  const handleMonthChange = (value: string) => {
    const date = parseMonthKey(value);
    const firstDayKey = formatDateKey(startOfMonth(date));
    pendingPrependAdjust.current = null;
    setMonths(buildMonthWindow(date, 6, 6));
    setSelectedMonthKey(value);
    setViewingMonthKey(value);
    pendingScrollToDate.current = firstDayKey;
  };

  const handleAdd = (dateKey: string) => {
    if (Date.now() < suppressAddUntil.current) {
      return;
    }
    setSelectedDateKey(dateKey);
    setIsPickerOpen(true);
  };

  const handleRemove = async (scheduledWorkoutId: string) => {
    await removeScheduledWorkout(scheduledWorkoutId);
    fetchScheduled();
  };

  const handleSchedule = async (workoutId: string) => {
    if (!selectedDateKey) return;
    const targetDateKey = selectedDateKey;
    // Prevent click-through from reopening the picker while it closes.
    suppressAddUntil.current = Date.now() + 400;
    setIsPickerOpen(false);
    setSelectedDateKey(null);
    await scheduleWorkout(workoutId, targetDateKey);
    fetchScheduled();
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
        </div>
        <MonthPicker value={viewingMonthKey} options={monthOptions} onChange={handleMonthChange} />
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto pr-2" onScroll={handleScroll}>
        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading scheduled workouts...</div>
        )}
        <div className="hidden md:block">
          <CalendarGrid
            weeks={weeks}
            scheduledByDate={scheduledByDate}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        </div>
        <div className="md:hidden">
          <CalendarAgenda
            weeks={weeks}
            scheduledByDate={scheduledByDate}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        </div>
      </div>

      <WorkoutPickerModal
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectWorkout={handleSchedule}
      />
    </div>
  );
}
