"use client";

/**
 * The exercise bank.
 *
 * Seeded exercises are read-only; editing one copies it into your own bank and
 * the copy shadows the original in this list. Removing an exercise archives it
 * rather than deleting, because saved routines and past completions point at
 * these rows.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Archive, Copy, Pencil, Plus, RotateCcw } from "lucide-react";

import { ExerciseEditor, type EditableExercise, type ExerciseDraft } from "@/components/training/exercise-editor";
import { InfoPanel } from "@/components/training/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveExerciseAction,
  createExerciseAction,
  duplicateExerciseAction,
  getExerciseBank,
  restoreExerciseAction,
  updateExerciseAction,
  type BankExercise,
} from "@/app/training/actions";
import { AREA_LABELS, FOCUS_AREAS, REGION_LABELS, STIMULUS_LABELS, type FocusArea } from "@/lib/training/taxonomy";
import { coverageColor } from "@/lib/training/display";
import { cn } from "@/lib/utils";

export function ExerciseBank() {
  const [exercises, setExercises] = useState<BankExercise[]>([]);
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState<Set<FocusArea>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<EditableExercise | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const result = await getExerciseBank({ includeArchived: showArchived });
    if (result.success) setExercises(result.data.exercises);
    else setError(result.error);
    setIsLoading(false);
  }, [showArchived]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exercises.filter((exercise) => {
      if (areaFilter.size > 0 && !areaFilter.has(exercise.area)) return false;
      if (!needle) return true;
      return (
        exercise.name.toLowerCase().includes(needle) ||
        exercise.regions.some((region) => REGION_LABELS[region].toLowerCase().includes(needle))
      );
    });
  }, [exercises, query, areaFilter]);

  const run = (action: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.success ? null : (result.error ?? "Something went wrong"));
      await refresh();
    });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <InfoPanel id="exercise-bank" title="How to read this">
        <p>
          Exercises are ordered by which focus area has gone longest without work. The dot shows
          that area&apos;s state.
        </p>
        <p>Seeded exercises are read-only — duplicate one to get an editable copy.</p>
      </InfoPanel>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search exercises"
          className="w-full sm:w-64"
        />
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setIsEditorOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New exercise
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={showArchived}
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FOCUS_AREAS.map((area) => {
          const isActive = areaFilter.has(area);
          return (
            <button
              key={area}
              type="button"
              aria-pressed={isActive}
              onClick={() =>
                setAreaFilter((current) => {
                  const next = new Set(current);
                  if (next.has(area)) next.delete(area);
                  else next.add(area);
                  return next;
                })
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "border-foreground bg-accent font-medium" : "border-border text-muted-foreground"
              )}
            >
              {AREA_LABELS[area]}
            </button>
          );
        })}
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {visible.map((exercise) => {
          const dose = (exercise.defaultDose as { display?: string } | null)?.display;
          const isArchived = exercise.archivedAt !== null;
          return (
            <li
              key={exercise.id}
              className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5", isArchived && "opacity-60")}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: coverageColor(exercise.areaStatus) }}
                title={AREA_LABELS[exercise.area]}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{exercise.name}</span>
                  {exercise.isPreset && (
                    <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      seeded
                    </span>
                  )}
                  {isArchived && (
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      archived
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {exercise.regions.map((region) => REGION_LABELS[region]).join(", ")} ·{" "}
                  {STIMULUS_LABELS[exercise.stimulus]}
                  {dose ? ` · ${dose}` : ""}
                  {exercise.equipment.length > 0 ? ` · ${exercise.equipment.join(", ")}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                {exercise.isOwn && !isArchived && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${exercise.name}`}
                    disabled={isPending}
                    onClick={() => {
                      setEditing({
                        id: exercise.id,
                        name: exercise.name,
                        regions: exercise.regions,
                        stimulus: exercise.stimulus,
                        defaultDose: exercise.defaultDose,
                        equipment: exercise.equipment,
                        difficulty: exercise.difficulty,
                        cues: exercise.cues,
                        notes: exercise.notes,
                      });
                      setIsEditorOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Duplicate ${exercise.name}`}
                  disabled={isPending}
                  onClick={() => run(() => duplicateExerciseAction(exercise.id))}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {exercise.isOwn && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={isArchived ? `Restore ${exercise.name}` : `Archive ${exercise.name}`}
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        isArchived
                          ? restoreExerciseAction(exercise.id)
                          : archiveExerciseAction(exercise.id),
                      )
                    }
                  >
                    {isArchived ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing matches that.
          </li>
        )}
      </ul>

      <ExerciseEditor
        open={isEditorOpen}
        exercise={editing}
        onClose={() => setIsEditorOpen(false)}
        onSubmit={async (draft: ExerciseDraft) => {
          const result = editing?.id
            ? await updateExerciseAction(editing.id, draft)
            : await createExerciseAction(draft);
          if (result.success) {
            setIsEditorOpen(false);
            setEditing(null);
            await refresh();
          } else {
            setError(result.error);
          }
        }}
      />
    </div>
  );
}
