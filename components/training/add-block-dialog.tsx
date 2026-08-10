"use client";

/**
 * Add a non-bike session to a day.
 *
 * Deliberately short: name, how long, how hard, which part of the day, and
 * which areas it covers. Anything more belongs in a routine or a template.
 *
 * Area tags are the reason this form exists at all — ticking a tagged session
 * is what keeps the coverage view honest without logging every exercise.
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
import { MODALITY_ICONS, modalityColor } from "@/lib/training/display";
import {
  AREA_LABELS,
  BLOCK_MODALITIES,
  DAY_PARTS,
  DAY_PART_LABELS,
  FOCUS_AREAS,
  MODALITY_LABELS,
  type BlockModality,
  type DayPart,
  type FocusArea,
} from "@/lib/training/taxonomy";
import { cn } from "@/lib/utils";

export type NewBlockDraft = {
  modality: BlockModality;
  name: string;
  dayPart: DayPart;
  plannedDurationMin: number | null;
  plannedRpe: number | null;
  areaTags: FocusArea[];
};

/** Sensible starting points so the common case is two clicks. */
const MODALITY_DEFAULTS: Record<BlockModality, { name: string; duration: number; rpe: number }> = {
  strength: { name: "Strength", duration: 45, rpe: 7 },
  mobility: { name: "Mobility", duration: 15, rpe: 2 },
  yoga: { name: "Yoga", duration: 40, rpe: 3 },
  prehab: { name: "Prehab", duration: 12, rpe: 3 },
};

export function AddBlockDialog({
  open,
  dateLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  dateLabel: string | null;
  onClose: () => void;
  onSubmit: (draft: NewBlockDraft) => Promise<void> | void;
}) {
  const [modality, setModality] = useState<BlockModality>("prehab");
  const [name, setName] = useState(MODALITY_DEFAULTS.prehab.name);
  const [dayPart, setDayPart] = useState<DayPart>("am");
  const [duration, setDuration] = useState(String(MODALITY_DEFAULTS.prehab.duration));
  const [rpe, setRpe] = useState(String(MODALITY_DEFAULTS.prehab.rpe));
  const [areaTags, setAreaTags] = useState<FocusArea[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Reset to defaults each time the dialog opens, so a previous session's
  // details never leak into the next one.
  useEffect(() => {
    if (!open) return;
    const defaults = MODALITY_DEFAULTS.prehab;
    setModality("prehab");
    setName(defaults.name);
    setDayPart("am");
    setDuration(String(defaults.duration));
    setRpe(String(defaults.rpe));
    setAreaTags([]);
    setIsSaving(false);
  }, [open]);

  function pickModality(next: BlockModality) {
    setModality(next);
    const defaults = MODALITY_DEFAULTS[next];
    // Only overwrite fields the user hasn't personalised.
    setName((current) =>
      Object.values(MODALITY_DEFAULTS).some((d) => d.name === current) ? defaults.name : current
    );
    setDuration(String(defaults.duration));
    setRpe(String(defaults.rpe));
  }

  function toggleArea(area: FocusArea) {
    setAreaTags((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area]
    );
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    setIsSaving(true);
    await onSubmit({
      modality,
      name: name.trim(),
      dayPart,
      plannedDurationMin: duration ? Number(duration) : null,
      plannedRpe: rpe ? Number(rpe) : null,
      areaTags,
    });
    setIsSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add a session</DialogTitle>
          <DialogDescription>
            {dateLabel ? `Scheduling for ${dateLabel}.` : "Schedule a non-riding session."} Rides are
            added from the workout picker.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-2">
            <Label>Kind</Label>
            <div className="flex flex-wrap gap-1.5">
              {BLOCK_MODALITIES.map((option) => {
                const Icon = MODALITY_ICONS[option];
                const isActive = modality === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => pickModality(option)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive ? "border-foreground bg-accent" : "border-border text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: modalityColor(option) }} />
                    {MODALITY_LABELS[option]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="block-name">Name</Label>
            <Input
              id="block-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Legs — hypertrophy"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="block-duration">Minutes</Label>
              <Input
                id="block-duration"
                type="number"
                min={1}
                max={600}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="block-rpe">
                <Hint term="srpe" underline={false}>
                  RPE
                </Hint>
              </Label>
              <Input
                id="block-rpe"
                type="number"
                min={1}
                max={10}
                value={rpe}
                onChange={(event) => setRpe(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>
                <Hint term="day_part" underline={false}>
                  When
                </Hint>
              </Label>
              <div className="flex gap-1">
                {DAY_PARTS.map((part) => (
                  <button
                    key={part}
                    type="button"
                    aria-pressed={dayPart === part}
                    onClick={() => setDayPart(part)}
                    className={cn(
                      "flex-1 rounded-md border px-1 py-1.5 text-[11px] font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      dayPart === part
                        ? "border-foreground bg-accent"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {DAY_PART_LABELS[part]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>
              <Hint term="focus_area" underline={false}>
                Areas covered
              </Hint>
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                optional
              </span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_AREAS.map((area) => {
                const isActive = areaTags.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => toggleArea(area)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "border-foreground bg-accent font-medium"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {AREA_LABELS[area]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !name.trim()}>
            {isSaving ? "Adding…" : "Add session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
