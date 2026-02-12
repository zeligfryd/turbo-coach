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
  getWeekStartKey,
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
  const pendingScrollToWeek = useRef<string | null>(null);
  const pendingScrollRaf = useRef<number | null>(null);
  const didInitScroll = useRef(false);

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

    const weekElements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-week-start]")
    );
    if (weekElements.length === 0) return;

    const scrollTop = container.scrollTop;
    const threshold = 40;
    let activeWeek = weekElements[0];

    for (const element of weekElements) {
      if (element.offsetTop <= scrollTop + threshold) {
        activeWeek = element;
      } else {
        break;
      }
    }

    const weekStart = activeWeek.dataset.weekStart;
    if (!weekStart) return;
    const nextKey = getMonthKey(new Date(weekStart));
    setViewingMonthKey((current) => (current === nextKey ? current : nextKey));
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

  const scrollToWeek = useCallback(
    (weekKey: string) => {
      const container = scrollRef.current;
      if (!container) {
        pendingScrollToWeek.current = weekKey;
        return;
      }
      const target = container.querySelector<HTMLElement>(`[data-week-start="${weekKey}"]`);
      if (target) {
        container.scrollTop = target.offsetTop;
        pendingScrollToWeek.current = null;
        updateViewingMonth();
      } else {
        pendingScrollToWeek.current = weekKey;
      }
    },
    [updateViewingMonth]
  );

  useEffect(() => {
    const targetKey = pendingScrollToWeek.current;
    if (targetKey) {
      scrollToWeek(targetKey);
    }
  }, [weeks, scrollToWeek]);

  useEffect(() => {
    updateViewingMonth();
  }, [weeks, updateViewingMonth]);

  useEffect(() => {
    if (didInitScroll.current) return;
    if (weeks.length === 0) return;
    didInitScroll.current = true;
    scrollToWeek(getWeekStartKey(startOfMonth(parseMonthKey(selectedMonthKey))));
  }, [weeks, selectedMonthKey, scrollToWeek]);

  const handleMonthChange = (value: string) => {
    const date = parseMonthKey(value);
    setMonths(buildMonthWindow(date, 6, 6));
    setSelectedMonthKey(value);
    scrollToWeek(getWeekStartKey(startOfMonth(date)));
  };

  const handleAdd = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    setIsPickerOpen(true);
  };

  const handleRemove = async (scheduledWorkoutId: string) => {
    await removeScheduledWorkout(scheduledWorkoutId);
    fetchScheduled();
  };

  const handleSchedule = async (workoutId: string) => {
    if (!selectedDateKey) return;
    await scheduleWorkout(workoutId, selectedDateKey);
    setIsPickerOpen(false);
    setSelectedDateKey(null);
    fetchScheduled();
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Plan your workouts by day and week.</p>
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
            focusMonth={parseMonthKey(viewingMonthKey).getMonth()}
            scheduledByDate={scheduledByDate}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        </div>
        <div className="md:hidden">
          <CalendarAgenda
            weeks={weeks}
            focusMonth={parseMonthKey(viewingMonthKey).getMonth()}
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
