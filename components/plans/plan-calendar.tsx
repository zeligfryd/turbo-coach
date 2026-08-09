"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Dumbbell, Bike as BikeIcon, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlanWithTree } from "@/lib/plans/types";
import { flattenPlanWeeks, type PlanDaySlot, type PlanWeekSlot } from "@/lib/plans/flatten";
import type { ArchetypeOption } from "@/app/plans/actions";
import { DayPanel } from "./day-panel";

const WINDOW = 4;
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SelectedKey = string;

export function PlanCalendar({
  plan,
  archetypes,
}: {
  plan: PlanWithTree;
  archetypes: ArchetypeOption[];
}) {
  const allWeeks = useMemo(() => flattenPlanWeeks(plan), [plan]);
  const [start, setStart] = useState(0);
  const [selected, setSelected] = useState<SelectedKey | null>(null);

  const visible = allWeeks.slice(start, start + WINDOW);
  const canPrev = start > 0;
  const canNext = start + WINDOW < allWeeks.length;

  const selectedSlot = useMemo(() => {
    if (!selected) return null;
    const [wn, dow] = selected.split(":").map(Number);
    const week = allWeeks.find((w) => w.weekNumber === wn);
    if (!week) return null;
    const day = week.days.find((d) => d.dayOfWeek === dow);
    if (!day) return null;
    return { week, day };
  }, [selected, allWeeks]);

  if (allWeeks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing weeks {start + 1}–{Math.min(start + WINDOW, allWeeks.length)} of{" "}
            {allWeeks.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setStart(Math.max(0, start - WINDOW))}
              disabled={!canPrev}
              aria-label="Previous weeks"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setStart(Math.min(allWeeks.length - 1, start + WINDOW))}
              disabled={!canNext}
              aria-label="Next weeks"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="grid grid-cols-[160px_repeat(7,minmax(0,1fr))] text-xs font-medium text-muted-foreground bg-muted/50">
            <div className="p-2">Week</div>
            {DOW_LABELS.map((d) => (
              <div key={d} className="p-2 text-center">{d}</div>
            ))}
          </div>
          {visible.map((week) => (
            <WeekRow
              key={week.weekNumber}
              week={week}
              selectedKey={selected}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      <DayPanel
        slot={selectedSlot}
        archetypes={archetypes}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function WeekRow({
  week,
  selectedKey,
  onSelect,
}: {
  week: PlanWeekSlot;
  selectedKey: SelectedKey | null;
  onSelect: (k: SelectedKey) => void;
}) {
  return (
    <div className="grid grid-cols-[160px_repeat(7,minmax(0,1fr))] border-t">
      <div className="p-2 text-xs bg-muted/30 flex flex-col justify-center">
        <div className="font-semibold">Week {week.weekNumber}</div>
        {week.block ? (
          <>
            <div className="text-muted-foreground truncate" title={week.block.name}>
              {week.block.name}
            </div>
            {week.theme && (
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                {week.theme}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground italic">unassigned</div>
        )}
      </div>
      {week.days.map((day) => {
        const key = `${week.weekNumber}:${day.dayOfWeek}` as SelectedKey;
        const active = selectedKey === key;
        return (
          <DayCell
            key={day.dayOfWeek}
            day={day}
            active={active}
            onClick={() => onSelect(key)}
          />
        );
      })}
    </div>
  );
}

function DayCell({
  day,
  active,
  onClick,
}: {
  day: PlanDaySlot;
  active: boolean;
  onClick: () => void;
}) {
  const hasItems = day.items.length > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-1.5 min-h-[72px] border-l text-xs transition-colors",
        "hover:bg-accent/50",
        active && "bg-accent ring-1 ring-primary/30",
      )}
    >
      {day.date && (
        <div className="text-[10px] text-muted-foreground mb-1">
          {formatShortDate(day.date)}
        </div>
      )}
      {hasItems ? (
        <div className="space-y-1">
          {day.items.slice(0, 2).map((item) => (
            <ItemPreview key={item.id} item={item} />
          ))}
          {day.items.length > 2 && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <MoreHorizontal className="h-3 w-3" />
              {day.items.length - 2} more
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground italic">—</div>
      )}
    </button>
  );
}

function ItemPreview({ item }: { item: PlanDaySlot["items"][number] }) {
  const Icon = item.kind === "strength" ? Dumbbell : BikeIcon;
  return (
    <div className="flex items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5">
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">
        {item.archetype ?? item.kind}
        {item.target_duration_min ? ` · ${item.target_duration_min}m` : ""}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <p className="font-medium">No weeks yet</p>
        <p className="text-sm text-muted-foreground">
          Add at least one block with weeks, or set a plan duration, to populate the calendar.
        </p>
      </CardContent>
    </Card>
  );
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
