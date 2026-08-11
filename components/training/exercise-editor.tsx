"use client";

/**
 * Create or edit an exercise.
 *
 * Region and stimulus are required: without them an exercise contributes
 * nothing to coverage and cannot be ranked, so it would be invisible to both
 * features the bank exists to serve. Everything else is optional.
 *
 * The dose is captured as structured fields and rendered to a display string,
 * so the strength tool later has sets and reps to read rather than prose.
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hint } from "@/components/training/hint";
import {
  AREA_LABELS,
  AREA_REGIONS,
  EQUIPMENT,
  FOCUS_AREAS,
  REGION_LABELS,
  STIMULUS_LABELS,
  STIMULUS_TYPES,
  type BodyRegion,
  type Equipment,
  type StimulusType,
} from "@/lib/training/taxonomy";
import { cn } from "@/lib/utils";

export type ExerciseDraft = {
  name: string;
  regions: BodyRegion[];
  stimulus: StimulusType;
  defaultDose: unknown;
  equipment: Equipment[];
  difficulty: number | null;
  cues: string | null;
  description: string | null;
  notes: string | null;
};

export type EditableExercise = {
  id?: string;
  name: string;
  regions: BodyRegion[];
  stimulus: StimulusType;
  defaultDose: unknown;
  equipment: string[];
  difficulty: number | null;
  cues: string | null;
  description: string | null;
  notes: string | null;
};

type DoseShape = {
  display?: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  perSide?: boolean;
};

function buildDisplay(sets: string, mode: "reps" | "hold", amount: string, perSide: boolean): string {
  const setPart = sets ? `${sets} × ` : "";
  const amountPart = mode === "hold" ? `${amount || "0"} s` : amount || "0";
  return `${setPart}${amountPart}${perSide ? " / side" : ""}`;
}

export function ExerciseEditor({
  open,
  exercise,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Null for a new exercise; a copy to seed the form when editing. */
  exercise: EditableExercise | null;
  onClose: () => void;
  onSubmit: (draft: ExerciseDraft) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [regions, setRegions] = useState<BodyRegion[]>([]);
  const [stimulus, setStimulus] = useState<StimulusType>("mobility");
  const [sets, setSets] = useState("3");
  const [mode, setMode] = useState<"reps" | "hold">("reps");
  const [amount, setAmount] = useState("10");
  const [perSide, setPerSide] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [difficulty, setDifficulty] = useState<number | null>(1);
  const [cues, setCues] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsSaving(false);
    if (exercise) {
      const dose = (exercise.defaultDose ?? {}) as DoseShape;
      setName(exercise.name);
      setRegions(exercise.regions);
      setStimulus(exercise.stimulus);
      setSets(dose.sets ? String(dose.sets) : "3");
      setMode(dose.holdSeconds ? "hold" : "reps");
      setAmount(String(dose.holdSeconds ?? dose.reps ?? 10));
      setPerSide(Boolean(dose.perSide));
      setEquipment(exercise.equipment as Equipment[]);
      setDifficulty(exercise.difficulty);
      setCues(exercise.cues ?? "");
      setDescription(exercise.description ?? "");
      setNotes(exercise.notes ?? "");
    } else {
      setName("");
      setRegions([]);
      setStimulus("mobility");
      setSets("3");
      setMode("reps");
      setAmount("10");
      setPerSide(false);
      setEquipment([]);
      setDifficulty(1);
      setCues("");
      setDescription("");
      setNotes("");
    }
  }, [open, exercise]);

  const canSave = name.trim().length > 0 && regions.length > 0;

  async function handleSubmit() {
    if (!canSave) {
      setError("An exercise needs a name and at least one region.");
      return;
    }
    setIsSaving(true);
    setError(null);
    const numericSets = Number(sets) || undefined;
    const numericAmount = Number(amount) || undefined;
    await onSubmit({
      name: name.trim(),
      regions,
      stimulus,
      defaultDose: {
        display: buildDisplay(sets, mode, amount, perSide),
        sets: numericSets,
        ...(mode === "hold" ? { holdSeconds: numericAmount } : { reps: numericAmount }),
        perSide,
      },
      equipment,
      difficulty,
      cues: cues.trim() || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
    });
    setIsSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{exercise?.id ? "Edit exercise" : "New exercise"}</DialogTitle>
          <DialogDescription>
            Region and stimulus decide which focus area this counts toward.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="exercise-name">Name</Label>
            <Input
              id="exercise-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Copenhagen adduction"
            />
          </div>

          <div className="grid gap-2">
            <Label>
              Regions <span className="text-xs font-normal text-muted-foreground">required</span>
            </Label>
            <div className="space-y-2 rounded-md border border-border p-2.5">
              {FOCUS_AREAS.map((area) => (
                <div key={area}>
                  <p className="mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {AREA_LABELS[area]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {AREA_REGIONS[area].map((region) => {
                      const isActive = regions.includes(region);
                      return (
                        <button
                          key={region}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() =>
                            setRegions((current) =>
                              current.includes(region)
                                ? current.filter((r) => r !== region)
                                : [...current, region],
                            )
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive
                              ? "border-foreground bg-accent font-medium"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {REGION_LABELS[region]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>
              <Hint term="stretch_only" underline={false}>
                Stimulus
              </Hint>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {STIMULUS_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={stimulus === option}
                  onClick={() => setStimulus(option)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    stimulus === option
                      ? "border-foreground bg-accent font-medium"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {STIMULUS_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Anything other than mobility counts as loading the area.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Dose</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Sets"
                type="number"
                min={1}
                max={20}
                value={sets}
                onChange={(event) => setSets(event.target.value)}
                className="w-16"
              />
              <span className="text-sm text-muted-foreground">×</span>
              <Input
                aria-label={mode === "hold" ? "Seconds" : "Reps"}
                type="number"
                min={1}
                max={600}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-20"
              />
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                {(["reps", "hold"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => setMode(option)}
                    className={cn(
                      "px-3 py-1.5 text-xs transition-colors",
                      mode === option ? "bg-accent font-medium" : "text-muted-foreground"
                    )}
                  >
                    {option === "reps" ? "reps" : "seconds"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={perSide}
                onClick={() => setPerSide((current) => !current)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  perSide ? "border-foreground bg-accent font-medium" : "border-border text-muted-foreground"
                )}
              >
                per side
              </button>
              <span className="text-xs tabular-nums text-muted-foreground">
                = {buildDisplay(sets, mode, amount, perSide)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-2">
              <Label>Equipment</Label>
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT.map((option) => {
                  const isActive = equipment.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() =>
                        setEquipment((current) =>
                          current.includes(option)
                            ? current.filter((e) => e !== option)
                            : [...current, option],
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        isActive
                          ? "border-foreground bg-accent font-medium"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Difficulty</Label>
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={difficulty === level}
                    onClick={() => setDifficulty(level)}
                    className={cn(
                      "w-9 py-1.5 text-xs transition-colors",
                      difficulty === level ? "bg-accent font-medium" : "text-muted-foreground"
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="exercise-cues">Cues</Label>
            <Input
              id="exercise-cues"
              value={cues}
              onChange={(event) => setCues(event.target.value)}
              placeholder="Stack the hips, lead with the heel."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="exercise-description">How to perform it</Label>
            <textarea
              id="exercise-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              placeholder="Setup, the movement, and the mistake that makes it useless."
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="exercise-notes">Notes</Label>
            <Input
              id="exercise-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything to remember for next time."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !canSave}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
