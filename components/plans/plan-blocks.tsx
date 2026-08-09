"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanBlockWithChildren, PlanWithTree } from "@/lib/plans/types";
import {
  createPlanBlock,
  createPlanWeek,
  deletePlanBlock,
  deletePlanWeek,
  duplicatePlanWeek,
  insertRecoveryWeek,
  swapPlanWeeks,
  updatePlanBlock,
  updatePlanWeek,
} from "@/app/plans/actions";

export function PlanBlocks({ plan }: { plan: PlanWithTree }) {
  return (
    <div className="space-y-4">
      {plan.blocks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">No blocks yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Blocks are mesocycles — e.g. Base 1, Build, Peak. Create the first one to begin.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plan.blocks.map((block) => (
            <BlockRow key={block.id} block={block} />
          ))}
        </div>
      )}

      <AddBlock planId={plan.id} />
    </div>
  );
}

function BlockRow({ block }: { block: PlanBlockWithChildren }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm(`Delete block "${block.name}" and all its weeks? This cannot be undone.`)) return;
    start(async () => {
      const res = await deletePlanBlock(block.id);
      if (res.success) router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {editing ? (
          <BlockForm
            initial={{
              name: block.name,
              duration_weeks: block.duration_weeks,
              goal: block.goal,
              rationale: block.rationale,
            }}
            submitLabel="Save"
            pending={pending}
            onCancel={() => setEditing(false)}
            onSubmit={(values) =>
              start(async () => {
                const res = await updatePlanBlock(block.id, values);
                if (res.success) {
                  setEditing(false);
                  router.refresh();
                }
              })
            }
          />
        ) : (
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-start gap-2 text-left min-w-0"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <h3 className="font-semibold">{block.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {block.duration_weeks} week{block.duration_weeks === 1 ? "" : "s"} ·{" "}
                  {block.weeks.length} defined
                </p>
                {block.goal && <p className="text-sm text-muted-foreground mt-1">{block.goal}</p>}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                disabled={pending}
                className="text-destructive hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {open && !editing && (
          <div className="pl-6 space-y-2">
            <WeekList block={block} />
            <AddWeek blockId={block.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeekList({ block }: { block: PlanBlockWithChildren }) {
  if (block.weeks.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No weeks yet.</p>;
  }
  return (
    <ul className="space-y-1">
      {block.weeks.map((week, i) => (
        <WeekRow
          key={week.id}
          weekId={week.id}
          week={week}
          blockId={block.id}
          prevWeekId={i > 0 ? block.weeks[i - 1].id : null}
          nextWeekId={i < block.weeks.length - 1 ? block.weeks[i + 1].id : null}
        />
      ))}
    </ul>
  );
}

type WeekInput = PlanBlockWithChildren["weeks"][number];

function WeekRow({
  weekId,
  week,
  blockId,
  prevWeekId,
  nextWeekId,
}: {
  weekId: string;
  week: WeekInput;
  blockId: string;
  prevWeekId: string | null;
  nextWeekId: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm(`Delete week ${week.order_index + 1}? All day items will be removed.`)) return;
    start(async () => {
      const res = await deletePlanWeek(weekId);
      if (res.success) router.refresh();
    });
  }

  function onDuplicate() {
    start(async () => {
      const res = await duplicatePlanWeek(weekId);
      if (res.success) router.refresh();
    });
  }

  function onInsertRecoveryAfter() {
    start(async () => {
      const res = await insertRecoveryWeek({
        block_id: blockId,
        after_order_index: week.order_index,
      });
      if (res.success) router.refresh();
    });
  }

  function onMove(direction: "up" | "down") {
    const otherId = direction === "up" ? prevWeekId : nextWeekId;
    if (!otherId) return;
    start(async () => {
      const res = await swapPlanWeeks(weekId, otherId);
      if (res.success) router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="rounded-md border p-2">
        <WeekForm
          initial={{
            theme: week.theme,
            target_tss: week.target_tss,
            rationale: week.rationale,
          }}
          submitLabel="Save"
          pending={pending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) =>
            start(async () => {
              const res = await updatePlanWeek(weekId, values);
              if (res.success) {
                setEditing(false);
                router.refresh();
              }
            })
          }
        />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
      <div className="min-w-0">
        <span className="font-medium">Week {week.order_index + 1}</span>
        {week.theme && <span className="text-muted-foreground"> · {week.theme}</span>}
        {week.target_tss != null && (
          <span className="text-muted-foreground"> · {week.target_tss} TSS</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)} aria-label="Edit">
          <Pencil className="h-3 w-3" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" disabled={pending} aria-label="More actions">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onDuplicate} disabled={pending}>
              <Copy className="h-4 w-4" />
              Duplicate week
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onInsertRecoveryAfter} disabled={pending}>
              <Moon className="h-4 w-4" />
              Insert recovery week after
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onMove("up")}
              disabled={pending || !prevWeekId}
            >
              <ArrowUp className="h-4 w-4" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onMove("down")}
              disabled={pending || !nextWeekId}
            >
              <ArrowDown className="h-4 w-4" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              disabled={pending}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete week
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function AddBlock({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add block
      </Button>
    );
  }
  return (
    <Card>
      <CardContent className="pt-4">
        <BlockForm
          submitLabel="Add block"
          pending={pending}
          onCancel={() => setOpen(false)}
          onSubmit={(values) =>
            start(async () => {
              const res = await createPlanBlock({ plan_id: planId, ...values });
              if (res.success) {
                setOpen(false);
                router.refresh();
              }
            })
          }
        />
      </CardContent>
    </Card>
  );
}

function AddWeek({ blockId }: { blockId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add week
      </Button>
    );
  }
  return (
    <div className="rounded-md border p-2">
      <WeekForm
        submitLabel="Add week"
        pending={pending}
        onCancel={() => setOpen(false)}
        onSubmit={(values) =>
          start(async () => {
            const res = await createPlanWeek({ block_id: blockId, ...values });
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

type BlockFormValues = {
  name: string;
  duration_weeks: number;
  goal: string | null;
  rationale: string | null;
};

function BlockForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: BlockFormValues;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: BlockFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [weeks, setWeeks] = useState(String(initial?.duration_weeks ?? 4));
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const dw = Number(weeks);
    if (!name.trim()) return setError("Name is required.");
    if (!Number.isInteger(dw) || dw < 1 || dw > 26)
      return setError("Duration must be between 1 and 26 weeks.");
    onSubmit({
      name: name.trim(),
      duration_weeks: dw,
      goal: goal.trim() || null,
      rationale: rationale.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <h3 className="font-semibold text-sm">{initial ? "Edit block" : "New block"}</h3>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Base 1"
            className="mt-1 h-8 text-sm"
            maxLength={80}
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Weeks</Label>
          <Input
            type="number"
            min={1}
            max={26}
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Goal</Label>
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Build aerobic foundation"
          className="mt-1 h-8 text-sm"
          maxLength={200}
        />
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Rationale
        </Label>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
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

type WeekFormValues = {
  theme: string | null;
  target_tss: number | null;
  rationale: string | null;
};

function WeekForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: WeekFormValues;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: WeekFormValues) => void;
  onCancel: () => void;
}) {
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [tss, setTss] = useState(initial?.target_tss != null ? String(initial.target_tss) : "");
  const [rationale, setRationale] = useState(initial?.rationale ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      theme: theme.trim() || null,
      target_tss: tss ? Number(tss) : null,
      rationale: rationale.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Theme</Label>
          <Input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="build · recovery · race week"
            className="mt-1 h-8 text-sm"
            maxLength={60}
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Target TSS
          </Label>
          <Input
            type="number"
            min={0}
            max={2000}
            value={tss}
            onChange={(e) => setTss(e.target.value)}
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Rationale
        </Label>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-transparent px-2 py-1 text-sm"
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
