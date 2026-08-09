"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Bike as BikeIcon,
  Dumbbell,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanItemKind } from "@/lib/plans/types";
import type { PlanDaySlot, PlanWeekSlot } from "@/lib/plans/flatten";
import {
  createPlanDayItem,
  deletePlanDayItem,
  reorderPlanDayItems,
  updatePlanDayItem,
  upsertPlanDayNotes,
  type ArchetypeOption,
} from "@/app/plans/actions";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DayPanel({
  slot,
  archetypes,
  onClose,
}: {
  slot: { week: PlanWeekSlot; day: PlanDaySlot } | null;
  archetypes: ArchetypeOption[];
  onClose: () => void;
}) {
  if (!slot) {
    return (
      <Card className="hidden lg:block">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Click a day in the grid to see or edit its items here.
        </CardContent>
      </Card>
    );
  }

  const { week, day } = slot;
  const dateLabel = day.date ? formatLongDate(day.date) : null;

  return (
    <Card className="lg:sticky lg:top-4 h-fit">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground">
              Week {week.weekNumber} · {DOW_LABELS[day.dayOfWeek]}
              {dateLabel ? ` · ${dateLabel}` : ""}
            </div>
            {week.block && <div className="text-sm font-medium mt-0.5">{week.block.name}</div>}
            {week.theme && <div className="text-xs text-muted-foreground">{week.theme}</div>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {week.weekId == null ? (
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            Create a plan_weeks row for week {week.weekNumber} in the Blocks tab before adding items here.
          </div>
        ) : (
          <>
            <DayNotes weekId={week.weekId} dayOfWeek={day.dayOfWeek} initial={day.notes ?? ""} />
            <ItemsList items={day.items} archetypes={archetypes} />
            <AddItemForm
              weekId={week.weekId}
              dayOfWeek={day.dayOfWeek}
              archetypes={archetypes}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DayNotes({
  weekId,
  dayOfWeek,
  initial,
}: {
  weekId: string;
  dayOfWeek: number;
  initial: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = notes !== initial;

  function onSave() {
    start(async () => {
      const res = await upsertPlanDayNotes({
        week_id: weekId,
        day_of_week: dayOfWeek,
        notes: notes.trim() || null,
      });
      if (res.success) router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Notes</Label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Rest, context, session focus…"
        className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {dirty && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={() => setNotes(initial)} disabled={pending}>
            Reset
          </Button>
          <Button size="xs" onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save notes"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ItemsList({
  items,
  archetypes,
}: {
  items: PlanDaySlot["items"];
  archetypes: ArchetypeOption[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No items. Rest day unless you add one below.
      </p>
    );
  }
  const orderedIds = items.map((i) => i.id);
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Items</Label>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <ItemRow
            key={item.id}
            item={item}
            archetypes={archetypes}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            dayId={item.day_id}
            orderedIds={orderedIds}
            index={idx}
          />
        ))}
      </ul>
    </div>
  );
}

function ItemRow({
  item,
  archetypes,
  isFirst,
  isLast,
  dayId,
  orderedIds,
  index,
}: {
  item: PlanDaySlot["items"][number];
  archetypes: ArchetypeOption[];
  isFirst: boolean;
  isLast: boolean;
  dayId: string;
  orderedIds: string[];
  index: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm("Remove this item?")) return;
    start(async () => {
      const res = await deletePlanDayItem(item.id);
      if (res.success) router.refresh();
    });
  }

  function onMove(direction: -1 | 1) {
    const next = [...orderedIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    start(async () => {
      const res = await reorderPlanDayItems(dayId, next);
      if (res.success) router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="rounded-md border p-2">
        <ItemForm
          archetypes={archetypes}
          initial={{
            kind: item.kind,
            archetype: item.archetype,
            target_duration_min: item.target_duration_min,
            target_tiz_min: item.target_tiz_min,
            notes: item.notes,
          }}
          submitLabel="Save"
          onSubmit={(values) =>
            start(async () => {
              const res = await updatePlanDayItem(item.id, values);
              if (res.success) {
                setEditing(false);
                router.refresh();
              }
            })
          }
          onCancel={() => setEditing(false)}
          pending={pending}
        />
      </li>
    );
  }

  const Icon = item.kind === "strength" ? Dumbbell : BikeIcon;
  return (
    <li className="rounded-md border p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{item.archetype ?? item.kind}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
            {item.target_duration_min != null && <span>{item.target_duration_min} min</span>}
            {item.target_tiz_min != null && <span>{item.target_tiz_min} min TIZ</span>}
          </div>
          {item.notes && (
            <p className="text-xs mt-1 whitespace-pre-wrap">{item.notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onMove(-1)}
              disabled={isFirst || pending}
              aria-label="Move up"
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onMove(1)}
              disabled={isLast || pending}
              aria-label="Move down"
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setEditing(true)}
              aria-label="Edit"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onDelete}
              disabled={pending}
              className="text-destructive hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function AddItemForm({
  weekId,
  dayOfWeek,
  archetypes,
}: {
  weekId: string;
  dayOfWeek: number;
  archetypes: ArchetypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add item
      </Button>
    );
  }

  return (
    <div className="rounded-md border p-2">
      <ItemForm
        archetypes={archetypes}
        submitLabel="Add"
        pending={pending}
        onCancel={() => setOpen(false)}
        onSubmit={(values) =>
          start(async () => {
            const res = await createPlanDayItem({
              week_id: weekId,
              day_of_week: dayOfWeek,
              ...values,
            });
            if (res.success) {
              setOpen(false);
              router.refresh();
            }
          })
        }
      />
    </div>
  );
}

type ItemFormValues = {
  kind: PlanItemKind;
  archetype: string | null;
  target_duration_min: number | null;
  target_tiz_min: number | null;
  notes: string | null;
};

function ItemForm({
  archetypes,
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  archetypes: ArchetypeOption[];
  initial?: ItemFormValues;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: ItemFormValues) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<PlanItemKind>(initial?.kind ?? "cycling");
  const [archetype, setArchetype] = useState<string>(initial?.archetype ?? "");
  const [duration, setDuration] = useState<string>(
    initial?.target_duration_min != null ? String(initial.target_duration_min) : "",
  );
  const [tiz, setTiz] = useState<string>(
    initial?.target_tiz_min != null ? String(initial.target_tiz_min) : "",
  );
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleArchetypeChange(id: string) {
    setArchetype(id);
    // Pre-fill duration/TIZ with archetype defaults when fields are blank.
    const arch = archetypes.find((a) => a.id === id);
    if (!arch) return;
    if (!duration && arch.default_duration_min != null) {
      setDuration(String(arch.default_duration_min));
    }
    if (!tiz && arch.default_tiz_min != null) {
      setTiz(String(arch.default_tiz_min));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === "cycling") {
      if (!archetype) return setError("Archetype required for cycling items.");
      if (!duration) return setError("Target duration required for cycling items.");
    }
    onSubmit({
      kind,
      archetype: kind === "cycling" ? archetype : archetype || null,
      target_duration_min: duration ? Number(duration) : null,
      target_tiz_min: tiz ? Number(tiz) : null,
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Kind</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PlanItemKind)}
            className="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          >
            <option value="cycling">Cycling</option>
            <option value="strength">Strength</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Duration (min)
          </Label>
          <Input
            type="number"
            min={5}
            max={600}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>

      {kind === "cycling" && (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Archetype
          </Label>
          <select
            value={archetype}
            onChange={(e) => handleArchetypeChange(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          >
            <option value="">— pick one —</option>
            {groupByCategory(archetypes).map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Target TIZ (min, optional)
        </Label>
        <Input
          type="number"
          min={0}
          max={600}
          value={tiz}
          onChange={(e) => setTiz(e.target.value)}
          className="mt-1 h-8 text-sm"
        />
      </div>

      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Notes (optional)
        </Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full min-h-[50px] rounded-md border border-input bg-transparent px-2 py-1 text-sm"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function groupByCategory(archetypes: ArchetypeOption[]): [string, ArchetypeOption[]][] {
  const map = new Map<string, ArchetypeOption[]>();
  for (const a of archetypes) {
    const list = map.get(a.category) ?? [];
    list.push(a);
    map.set(a.category, list);
  }
  return Array.from(map.entries());
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
