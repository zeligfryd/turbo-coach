"use client";

/**
 * Build a typical week once, apply it to any week in the calendar.
 *
 * Seven columns you drop routines into — "routine A on Monday, yoga plus
 * routine B on Tuesday, nothing Wednesday". A convenience for filling a week in
 * one action; applying writes ordinary blocks, so nothing downstream needs to
 * know templates exist.
 */

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { ConfirmAction } from "@/components/training/confirm-action";
import {
  createWeekTemplateAction,
  deleteWeekTemplateAction,
  getRoutineOptions,
  getWeekTemplates,
  updateWeekTemplateAction,
  type RoutineOption,
} from "@/app/training/actions";
import type { WeekSlotInput, WeekTemplate } from "@/lib/training/service/week-templates";
import { formatMinutes } from "@/lib/training/display";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A plain session covers the things that are not a routine — a yoga class. */
const PLAIN_SESSIONS = [
  { modality: "yoga" as const, name: "Yoga", durationMin: 30 },
  { modality: "mobility" as const, name: "Stretching", durationMin: 15 },
  { modality: "strength" as const, name: "Gym", durationMin: 45 },
];

type Draft = { name: string; slots: WeekSlotInput[] };

const emptyDraft: Draft = { name: "", slots: [] };

function slotLabel(slot: WeekSlotInput, routines: RoutineOption[]): string {
  if ("routineId" in slot) {
    return routines.find((r) => r.id === slot.routineId)?.name ?? "Routine";
  }
  return slot.name;
}

export function WeekTemplateEditor() {
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [routines, setRoutines] = useState<RoutineOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = async () => {
    const [templatesResult, routinesResult] = await Promise.all([
      getWeekTemplates(),
      getRoutineOptions(),
    ]);
    if (templatesResult.success) setTemplates(templatesResult.data);
    if (routinesResult.success) setRoutines(routinesResult.data);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startNew = () => {
    setDraft({ ...emptyDraft });
    setEditingId(null);
    setError(null);
  };

  const startEdit = (template: WeekTemplate) => {
    setDraft({
      name: template.name,
      slots: template.slots.map((slot) =>
        slot.routineId
          ? { weekday: slot.weekday, dayPart: slot.dayPart as "am", routineId: slot.routineId }
          : {
              weekday: slot.weekday,
              dayPart: slot.dayPart as "am",
              modality: slot.modality as "yoga",
              name: slot.name,
              durationMin: slot.durationMin,
              areaTags: [],
            },
      ),
    });
    setEditingId(template.id);
    setError(null);
  };

  const addSlot = (weekday: number, slot: WeekSlotInput) => {
    setDraft((current) =>
      current ? { ...current, slots: [...current.slots, { ...slot, weekday }] } : current,
    );
    setAddingTo(null);
  };

  const removeSlot = (index: number) => {
    setDraft((current) =>
      current ? { ...current, slots: current.slots.filter((_, i) => i !== index) } : current,
    );
  };

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Give the week a name.");
      return;
    }
    if (draft.slots.length === 0) {
      setError("Add at least one session — an empty week would do nothing when applied.");
      return;
    }
    startTransition(async () => {
      const result = editingId
        ? await updateWeekTemplateAction(editingId, { name: draft.name.trim(), slots: draft.slots })
        : await createWeekTemplateAction({ name: draft.name.trim(), slots: draft.slots });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDraft(null);
      setEditingId(null);
      setError(null);
      await refresh();
    });
  };

  const remove = (templateId: string) => {
    startTransition(async () => {
      await deleteWeekTemplateAction(templateId);
      await refresh();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Typical weeks</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Build a week once, then drop it onto any week in the calendar.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={startNew}
            className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            New week
          </button>
        )}
      </div>

      {error && (
        <p className="border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {draft ? (
        <div className="p-4">
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Base week"
            aria-label="Name this week"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {DAYS.map((day, weekday) => {
              const daySlots = draft.slots
                .map((slot, index) => ({ slot, index }))
                .filter(({ slot }) => slot.weekday === weekday);

              return (
                <div key={day} className="rounded-md border border-border/60 p-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {day}
                  </p>

                  <ul className="mt-1.5 space-y-1">
                    {daySlots.map(({ slot, index }) => (
                      <li
                        key={index}
                        className="flex items-start justify-between gap-1 rounded bg-background px-1.5 py-1"
                      >
                        <span className="min-w-0 text-[11px] leading-snug">
                          {slotLabel(slot, routines)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSlot(index)}
                          aria-label={`Remove ${slotLabel(slot, routines)} from ${day}`}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>

                  {addingTo === weekday ? (
                    <div className="mt-1.5 space-y-1">
                      {routines.map((routine) => (
                        <button
                          key={routine.id}
                          type="button"
                          onClick={() =>
                            addSlot(weekday, { weekday, dayPart: "am", routineId: routine.id })
                          }
                          className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] hover:bg-accent"
                        >
                          {routine.name}
                        </button>
                      ))}
                      <div className="border-t border-border/60 pt-1">
                        {PLAIN_SESSIONS.map((session) => (
                          <button
                            key={session.name}
                            type="button"
                            onClick={() =>
                              addSlot(weekday, {
                                weekday,
                                dayPart: "pm",
                                modality: session.modality,
                                name: session.name,
                                durationMin: session.durationMin,
                                areaTags: [],
                              })
                            }
                            className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent"
                          >
                            {session.name} · {formatMinutes(session.durationMin)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddingTo(null)}
                        className="block w-full rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingTo(weekday)}
                      aria-label={`Add to ${day}`}
                      className="mt-1.5 flex min-h-[32px] w-full items-center justify-center rounded border border-dashed border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {editingId ? "Save changes" : "Save week"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
                setError(null);
              }}
              className="rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <span className="ml-auto text-xs text-muted-foreground">
              {draft.slots.length} session{draft.slots.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No typical weeks yet.
        </p>
      ) : (
        <ul>
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{template.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {template.slots.length} session{template.slots.length === 1 ? "" : "s"} ·{" "}
                  {[...new Set(template.slots.map((slot) => DAYS[slot.weekday]))].join(", ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(template)}
                  className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Edit
                </button>
                <ConfirmAction
                  label={`Delete ${template.name}`}
                  title={`Delete "${template.name}"?`}
                  description="The weeks you have already applied stay as they are — only the template goes."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => remove(template.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </ConfirmAction>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
