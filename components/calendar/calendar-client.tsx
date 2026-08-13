"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
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
import type { ScheduledWorkout, CalendarActivity, CalendarRaceEvent, DayContent, CalendarHandlers } from "./types";
import type { Workout } from "@/lib/workouts/types";
import type { BlockTemplateRow, PlannedItem, WeekLoad } from "@/lib/training/types";
import { MODALITIES, type Modality } from "@/lib/training/taxonomy";
import { ModalityFilter } from "@/components/training/modality-filter";
import { AddBlockDialog, type NewBlockDraft } from "@/components/training/add-block-dialog";
import {
  createBlockTemplateAction,
  getBlockTemplates,
  getRoutineOptions,
  scheduleRoutineAction,
  getTrainingWindow,
  scheduleBlockAction,
  type RoutineOption,
  rescheduleBlockAction,
  deleteBlockAction,
  acceptBlockAction,
  recordCompletionAction,
  clearCompletionAction,
} from "@/app/training/actions";
import { getScheduledWorkouts, getCalendarActivities, getCalendarWellness, getUserFtp, removeScheduledWorkout, rescheduleWorkout, scheduleWorkout } from "@/app/calendar/actions";
import type { CalendarWellness } from "@/app/calendar/actions";
import { getRaceEvents, updateRaceEvent } from "@/app/race/actions";
import { WorkoutDetailModal } from "@/components/workouts/workout-detail-modal";
import { RaceEventFormModal } from "./race-event-form";

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
  const router = useRouter();
  // Named for what it is. `today` here has always meant the first of the
  // current month — used to seed the month picker — and reading it as the
  // current date sends the calendar to the 1st.
  const currentMonthStart = startOfMonth(new Date());
  const todayKey = formatDateKey(new Date());
  const [months, setMonths] = useState<Date[]>(() => buildMonthWindow(currentMonthStart, 6, 6));
  const [selectedMonthKey, setSelectedMonthKey] = useState(getMonthKey(currentMonthStart));
  const [viewingMonthKey, setViewingMonthKey] = useState(getMonthKey(currentMonthStart));
  const [scheduledByDate, setScheduledByDate] = useState<Record<string, ScheduledWorkout[]>>({});
  const [activitiesByDate, setActivitiesByDate] = useState<Record<string, CalendarActivity[]>>({});
  const [wellnessByDate, setWellnessByDate] = useState<Record<string, CalendarWellness>>({});
  const [racesByDate, setRacesByDate] = useState<Record<string, CalendarRaceEvent[]>>({});
  const [blocksByDate, setBlocksByDate] = useState<Record<string, PlannedItem[]>>({});
  const [weekLoads, setWeekLoads] = useState<Record<string, WeekLoad>>({});
  const [activeModalities, setActiveModalities] = useState<Set<Modality>>(() => new Set(MODALITIES));
  const [blockFormDate, setBlockFormDate] = useState<string | null>(null);
  const [blockTemplates, setBlockTemplates] = useState<BlockTemplateRow[]>([]);
  const [routineOptions, setRoutineOptions] = useState<
    RoutineOption[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [userFtp, setUserFtp] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRaceFormOpen, setIsRaceFormOpen] = useState(false);
  const [raceFormDate, setRaceFormDate] = useState<string | null>(null);
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
    const [workoutsResult, activitiesResult, wellnessResult, racesResult, trainingResult] = await Promise.all([
      getScheduledWorkouts(range.startDate, range.endDate),
      getCalendarActivities(range.startDate, range.endDate),
      getCalendarWellness(range.startDate, range.endDate),
      getRaceEvents(range.startDate, range.endDate),
      getTrainingWindow(range.startDate, range.endDate),
    ]);
    if (workoutsResult.success) {
      const grouped: Record<string, ScheduledWorkout[]> = {};
      workoutsResult.workouts.forEach((item: ScheduledWorkout) => {
        const key = item.scheduled_date;
        grouped[key] = grouped[key] || [];
        grouped[key].push(item);
      });
      setScheduledByDate(grouped);
    }
    if (activitiesResult.success) {
      const grouped: Record<string, CalendarActivity[]> = {};
      activitiesResult.activities.forEach((item: CalendarActivity) => {
        const key = item.activity_date;
        grouped[key] = grouped[key] || [];
        grouped[key].push(item);
      });
      setActivitiesByDate(grouped);
    }
    if (wellnessResult.success) {
      const byDate: Record<string, CalendarWellness> = {};
      wellnessResult.wellness.forEach((item: CalendarWellness) => {
        byDate[item.date] = item;
      });
      setWellnessByDate(byDate);
    }
    if (racesResult.success) {
      const grouped: Record<string, CalendarRaceEvent[]> = {};
      racesResult.races.forEach((item: CalendarRaceEvent) => {
        const key = item.race_date;
        grouped[key] = grouped[key] || [];
        grouped[key].push(item);
      });
      setRacesByDate(grouped);
    }
    if (trainingResult.success) {
      const grouped: Record<string, PlannedItem[]> = {};
      // Rides come from the existing scheduled-workout stream; taking them from
      // here too would render every ride twice.
      trainingResult.data.items
        .filter((item) => item.modality !== "bike")
        .forEach((item) => {
          grouped[item.date] = grouped[item.date] || [];
          grouped[item.date].push(item);
        });
      setBlocksByDate(grouped);

      const loads: Record<string, WeekLoad> = {};
      trainingResult.data.weeks.forEach((week) => {
        loads[week.weekStart] = week;
      });
      setWeekLoads(loads);
    }
    setIsLoading(false);
  }, [range.startDate, range.endDate]);

  useEffect(() => {
    fetchScheduled();
  }, [fetchScheduled]);

  useEffect(() => {
    getUserFtp().then(setUserFtp);
    getBlockTemplates().then((result) => {
      if (result.success) setBlockTemplates(result.data);
    });
    getRoutineOptions().then((result) => {
      if (result.success) setRoutineOptions(result.data);
    });
  }, []);

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

  /**
   * Any real input ends the initial alignment, so a later batch of months can
   * never pull the view back to today under your finger. Deliberately not the
   * scroll event: that fires for programmatic scrolling too, and arrives after
   * the auto-scroll flag is cleared, so it cancelled the alignment it had just
   * been asked to perform.
   */
  const cancelPendingScroll = useCallback(() => {
    pendingScrollToDate.current = null;
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
    // The month grid and the phone agenda are both always in the DOM; only CSS
    // decides which one you see. querySelector returns the grid's day first, so
    // on a phone this was measuring an element with `display: none` — a rect of
    // all zeros — and scrolling to a position derived from it. Hence no jump to
    // the current month on mobile, and a correct one on desktop.
    const target = Array.from(
      container.querySelectorAll<HTMLElement>(`[data-day-date="${dateKey}"]`),
    ).find((element) => element.offsetParent !== null);

    if (!target) {
      return { found: false, moved: false };
    }

    // Anchor the day, not its week.
    //
    // On the month grid the two are the same thing: all seven cells in a week
    // share a top edge, so aligning the day aligns the row. On the phone agenda
    // a week is seven stacked cards and only about three fit, so anchoring the
    // week put today below the fold — the right week, but not the thing you
    // opened the calendar to see.
    const stickyHeader = container.querySelector<HTMLElement>("[data-calendar-sticky-header]");
    const stickyHeaderOffset = stickyHeader?.offsetHeight ?? 0;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const desiredTop = containerRect.top + stickyHeaderOffset;
    const delta = targetRect.top - desiredTop;

    const moved = Math.abs(delta) > 1;
    if (moved) {
      container.scrollTop += delta;
    }

    // "Already where it should be" is the only reliable signal that the list
    // has stopped growing underneath us.
    return { found: true, moved };
  }, []);

  const scrollToDate = useCallback(
    (dateKey: string) => {
      const container = scrollRef.current;
      if (!container) {
        pendingScrollToDate.current = dateKey;
        return;
      }
      // Set before aligning, not only on failure: the list keeps growing after
      // the first paint, so one alignment is never enough and the re-align
      // effect below needs a target to work from.
      pendingScrollToDate.current = dateKey;
      const first = alignDateRowToTop(container, dateKey);
      if (first.found) {
        // Deliberately still pending. The month window keeps expanding after
        // the first paint — scrollHeight went 38k -> 55k on a phone — and each
        // batch pushes the target down, so a single alignment lands and is then
        // undone. It is cleared once an alignment finds it already in place, or
        // as soon as you scroll yourself.
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
    updateViewingMonth();
  }, [weeks, updateViewingMonth]);

  useEffect(() => {
    if (didInitScroll.current) return;
    if (weeks.length === 0) return;
    didInitScroll.current = true;
    // Today, not the 1st. On the month grid the two look similar because a
    // whole month is on screen either way, but the phone agenda is a linear
    // list of day cards — landing on the 1st put today several screens down,
    // which is the opposite of opening the calendar to see where you are.
    // Picking a month explicitly still goes to its first day, in
    // handleMonthChange.
    scrollToDate(todayKey);
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

  const handleActivityClick = (activityId: string) => {
    router.push(`/activity/${activityId}`);
  };

  const handleRaceClick = (raceId: string) => {
    router.push(`/race/${raceId}`);
  };

  const handleAddRace = (dateKey: string) => {
    setRaceFormDate(dateKey);
    setIsRaceFormOpen(true);
  };

  const handleRaceCreated = () => {
    setIsRaceFormOpen(false);
    setRaceFormDate(null);
    fetchScheduled();
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {
        // Refresh calendar data after sync
        fetchScheduled();
      }
    } catch {
      // Silently fail — sync errors are visible on the profile page
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemove = async (scheduledWorkoutId: string) => {
    await removeScheduledWorkout(scheduledWorkoutId);
    fetchScheduled();
  };

  const handleRescheduleWorkout = async (scheduledWorkoutId: string, newDate: string) => {
    await rescheduleWorkout(scheduledWorkoutId, newDate);
    fetchScheduled();
  };

  const handleRescheduleRace = async (raceId: string, newDate: string) => {
    await updateRaceEvent(raceId, { race_date: newDate });
    fetchScheduled();
  };

  const handleRescheduleBlock = async (blockId: string, newDate: string) => {
    await rescheduleBlockAction(blockId, newDate);
    fetchScheduled();
  };

  const handleAddBlock = (dateKey: string) => {
    setBlockFormDate(dateKey);
  };

  const handleCreateBlock = async (draft: NewBlockDraft) => {
    if (!blockFormDate) return;
    const { saveAsTemplate, routineId, ...block } = draft;

    // A routine-backed block goes through scheduleRoutine so that ticking it
    // feeds coverage from the routine's stored vector rather than area tags.
    if (routineId) {
      await scheduleRoutineAction(routineId, blockFormDate, block.dayPart);
      setBlockFormDate(null);
      fetchScheduled();
      return;
    }

    await scheduleBlockAction({ ...block, date: blockFormDate });
    if (saveAsTemplate) {
      await createBlockTemplateAction({
        modality: block.modality,
        name: block.name,
        durationMin: block.plannedDurationMin,
        defaultRpe: block.plannedRpe,
        areaTags: block.areaTags,
      });
      const refreshed = await getBlockTemplates();
      if (refreshed.success) setBlockTemplates(refreshed.data);
    }
    setBlockFormDate(null);
    fetchScheduled();
  };

  const handleToggleModality = (modality: Modality) => {
    setActiveModalities((current) => {
      const next = new Set(current);
      if (next.has(modality)) next.delete(modality);
      else next.add(modality);
      return next;
    });
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

  const blockHandlers = useMemo(
    () => ({
      onTick: async (item: PlannedItem) => {
        if (item.status === "done") await clearCompletionAction(item.id);
        else await recordCompletionAction(item.id, { status: "done" });
        fetchScheduled();
      },
      onRemove: async (item: PlannedItem) => {
        await deleteBlockAction(item.id);
        fetchScheduled();
      },
      onAccept: async (item: PlannedItem) => {
        await acceptBlockAction(item.id);
        fetchScheduled();
      },
      onDismiss: async (item: PlannedItem) => {
        await deleteBlockAction(item.id);
        fetchScheduled();
      },
    }),
    [fetchScheduled],
  );

  const handlers: CalendarHandlers = useMemo(
    () => ({
      onAdd: handleAdd,
      onRemove: handleRemove,
      onWorkoutClick: setSelectedWorkout,
      onActivityClick: handleActivityClick,
      onRaceClick: handleRaceClick,
      onAddRace: handleAddRace,
      onAddBlock: handleAddBlock,
      block: blockHandlers,
    }),
    // handleAdd and friends are stable enough for this component's lifetime;
    // blockHandlers is the only one that meaningfully changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockHandlers],
  );

  /**
   * One content map per day, filtered by the active modality chips. Filtering
   * here rather than inside the day cells keeps the week totals and the cells
   * showing the same thing.
   */
  const contentByDate = useMemo(() => {
    const map: Record<string, DayContent> = {};
    const keys = new Set([
      ...Object.keys(scheduledByDate),
      ...Object.keys(activitiesByDate),
      ...Object.keys(racesByDate),
      ...Object.keys(blocksByDate),
    ]);
    const bikeVisible = activeModalities.has("bike");
    keys.forEach((key) => {
      map[key] = {
        workouts: bikeVisible ? scheduledByDate[key] ?? [] : [],
        activities: bikeVisible ? activitiesByDate[key] ?? [] : [],
        races: racesByDate[key] ?? [],
        blocks: (blocksByDate[key] ?? []).filter((block) => activeModalities.has(block.modality)),
      };
    });
    return map;
  }, [scheduledByDate, activitiesByDate, racesByDate, blocksByDate, activeModalities]);

  /**
   * Hold the initial target until the layout stops moving.
   *
   * Keyed on the content, not on `weeks`. The list grows by about 16,000px
   * after first paint on a phone — not because months are added, but because
   * each day card gets taller as its sessions load — so a single alignment
   * lands and is then pushed far down. `weeks` never changes through any of
   * that, which is why keying on it did nothing.
   *
   * Clears itself once an alignment finds the target already in place, and
   * `cancelPendingScroll` drops it the moment you touch the calendar.
   */
  useEffect(() => {
    const targetKey = pendingScrollToDate.current;
    if (!targetKey) return;
    const container = scrollRef.current;
    if (!container) return;

    const result = alignDateRowToTop(container, targetKey);
    if (!result.found) return;
    if (!result.moved) pendingScrollToDate.current = null;
    updateViewingMonth();
  }, [contentByDate, weeks, alignDateRowToTop, updateViewingMonth]);

  const modalityCounts = useMemo(() => {
    // Every modality gets a number, including zero. Showing a count for bike
    // and nothing for the rest made the set look broken rather than empty.
    const counts = Object.fromEntries(MODALITIES.map((m) => [m, 0])) as Record<Modality, number>;
    Object.values(scheduledByDate).forEach((items) => {
      counts.bike += items.length;
    });
    Object.values(blocksByDate).forEach((items) => {
      items.forEach((item) => {
        counts[item.modality] += 1;
      });
    });
    return counts;
  }, [scheduledByDate, blocksByDate]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Plan your workouts by day and week.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="p-2 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-50"
            title="Sync recent activities"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          </button>
          <MonthPicker value={viewingMonthKey} options={monthOptions} onChange={handleMonthChange} />
        </div>
      </div>

      <ModalityFilter
        active={activeModalities}
        counts={modalityCounts}
        onToggle={handleToggleModality}
      />

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto pr-2"
        onScroll={handleScroll}
        onWheel={cancelPendingScroll}
        onTouchStart={cancelPendingScroll}
        onPointerDown={cancelPendingScroll}
      >
        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading scheduled workouts...</div>
        )}
        <div className="hidden md:block">
          <CalendarGrid
              onWeekApplied={fetchScheduled}
            weeks={weeks}
            contentByDate={contentByDate}
            wellnessByDate={wellnessByDate}
            weekLoads={weekLoads}
            handlers={handlers}
            onRescheduleWorkout={handleRescheduleWorkout}
            onRescheduleRace={handleRescheduleRace}
            onRescheduleBlock={handleRescheduleBlock}
          />
        </div>
        <div className="md:hidden">
          <CalendarAgenda
              onWeekApplied={fetchScheduled}
            weeks={weeks}
            contentByDate={contentByDate}
            wellnessByDate={wellnessByDate}
            weekLoads={weekLoads}
            handlers={handlers}
          />
        </div>
      </div>

      <WorkoutPickerModal
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectWorkout={handleSchedule}
      />

      <WorkoutDetailModal
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        userFtp={userFtp}
      />

      <AddBlockDialog
        open={blockFormDate !== null}
        dateLabel={blockFormDate}
        templates={blockTemplates}
        routines={routineOptions}
        onClose={() => setBlockFormDate(null)}
        onSubmit={handleCreateBlock}
      />

      <RaceEventFormModal
        open={isRaceFormOpen}
        defaultDate={raceFormDate}
        onClose={() => { setIsRaceFormOpen(false); setRaceFormDate(null); }}
        onCreated={handleRaceCreated}
      />
    </div>
  );
}
