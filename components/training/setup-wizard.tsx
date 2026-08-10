"use client";

/**
 * First-run setup (D9).
 *
 * One flow rather than the three separate wizards originally specced. The
 * three all wanted the same moment — the first time this screen is opened —
 * and the two that carry real weight are confirming the targets and capturing
 * the sessions you already do. A separate walkthrough of the composer was
 * dropped: it is one screen with a ranked list and an info panel, and a guided
 * tour of it would be ceremony.
 *
 * Skippable at every step and re-runnable from /training, so it is never in
 * the way of someone who already knows what they want.
 */

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBlockTemplateAction, setAreaGoalAction } from "@/app/training/actions";
import { MODALITY_ICONS, coverageColor, modalityColor } from "@/lib/training/display";
import {
  AREA_LABELS,
  AREA_REGIONS,
  BLOCK_MODALITIES,
  DEFAULT_AREA_TARGET_DAYS,
  FOCUS_AREAS,
  MODALITY_LABELS,
  REGION_LABELS,
  type BlockModality,
  type FocusArea,
} from "@/lib/training/taxonomy";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "turbo-coach-training-setup-done";

export function hasCompletedSetup(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

type DraftTemplate = {
  modality: BlockModality;
  name: string;
  durationMin: string;
  areaTags: FocusArea[];
};

const EMPTY_TEMPLATE: DraftTemplate = {
  modality: "strength",
  name: "",
  durationMin: "45",
  areaTags: [],
};

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [targets, setTargets] = useState<Record<FocusArea, number>>({ ...DEFAULT_AREA_TARGET_DAYS });
  const [templates, setTemplates] = useState<DraftTemplate[]>([]);
  const [draft, setDraft] = useState<DraftTemplate>({ ...EMPTY_TEMPLATE });
  const [isPending, startTransition] = useTransition();

  function finish() {
    startTransition(async () => {
      // Only write targets the user actually changed — an untouched area stays
      // marked as a default rather than being frozen at today's value.
      await Promise.all(
        FOCUS_AREAS.filter((area) => targets[area] !== DEFAULT_AREA_TARGET_DAYS[area]).map((area) =>
          setAreaGoalAction(area, targets[area]),
        ),
      );
      await Promise.all(
        templates.map((template) =>
          createBlockTemplateAction({
            modality: template.modality,
            name: template.name.trim(),
            durationMin: template.durationMin ? Number(template.durationMin) : null,
            areaTags: template.areaTags,
          }),
        ),
      );
      localStorage.setItem(STORAGE_KEY, "1");
      onDone();
    });
  }

  function skip() {
    localStorage.setItem(STORAGE_KEY, "1");
    onDone();
  }

  const steps = ["What is tracked", "How often", "What you already do"];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {steps.map((label, index) => (
            <span
              key={label}
              className={cn(
                "text-[11px]",
                index === step ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {index > 0 && <span className="mr-2 text-muted-foreground/50">·</span>}
              {label}
            </span>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={skip} disabled={isPending}>
          <X className="mr-1 h-3.5 w-3.5" />
          Skip
        </Button>
      </div>

      <div className="p-4">
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Everything off the bike is tracked against six areas of the body. When a session is
              logged, the areas it covers reset.
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {FOCUS_AREAS.map((area) => (
                <li key={area} className="rounded-md border border-border px-3 py-2">
                  <span className="text-sm font-medium">{AREA_LABELS[area]}</span>
                  {/* Thoracic spine is its own only region, so the second line
                      would just repeat the first. */}
                  {!(AREA_REGIONS[area].length === 1 &&
                     REGION_LABELS[AREA_REGIONS[area][0]] === AREA_LABELS[area]) && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {AREA_REGIONS[area].map((region) => REGION_LABELS[region]).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {(["fresh", "due", "overdue"] as const).map((status) => (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: coverageColor(status) }}
                  />
                  {status === "fresh"
                    ? "recently covered"
                    : status === "due"
                      ? "approaching its interval"
                      : "past its interval"}
                </span>
              ))}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              How many days you want to go, at most, between sessions covering each area. These
              suit a cyclist&apos;s load pattern; change any that do not suit yours.
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {FOCUS_AREAS.map((area) => (
                <li key={area} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-sm">{AREA_LABELS[area]}</span>
                  <span className="inline-flex items-center overflow-hidden rounded-md border border-border">
                    <button
                      type="button"
                      aria-label={`Decrease ${AREA_LABELS[area]}`}
                      disabled={targets[area] <= 1}
                      onClick={() => setTargets((t) => ({ ...t, [area]: t[area] - 1 }))}
                      className="h-7 w-7 text-sm hover:bg-accent disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-14 border-x border-border py-1 text-center text-xs tabular-nums">
                      {targets[area]} d
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${AREA_LABELS[area]}`}
                      disabled={targets[area] >= 60}
                      onClick={() => setTargets((t) => ({ ...t, [area]: t[area] + 1 }))}
                      className="h-7 w-7 text-sm hover:bg-accent disabled:opacity-40"
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Add the sessions you already do regularly — a gym session, a yoga class. Ticking one
              off later updates the areas it covers, without logging individual exercises.
            </p>

            {templates.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {templates.map((template, index) => {
                  const Icon = MODALITY_ICONS[template.modality];
                  return (
                    <li key={index} className="flex items-center gap-2.5 px-3 py-2">
                      <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: modalityColor(template.modality) }}
                      />
                      <span className="flex-1 text-sm">{template.name}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {template.durationMin}m ·{" "}
                        {template.areaTags.map((area) => AREA_LABELS[area]).join(", ") || "no areas"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${template.name}`}
                        onClick={() => setTemplates((list) => list.filter((_, i) => i !== index))}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="grid gap-2.5 rounded-md border border-dashed border-border p-3">
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_MODALITIES.map((option) => {
                  const Icon = MODALITY_ICONS[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={draft.modality === option}
                      onClick={() => setDraft((d) => ({ ...d, modality: option }))}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        draft.modality === option
                          ? "border-foreground bg-accent font-medium"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" style={{ color: modalityColor(option) }} />
                      {MODALITY_LABELS[option]}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
                <div className="grid gap-1.5">
                  <Label htmlFor="setup-template-name" className="text-xs">
                    Name
                  </Label>
                  <Input
                    id="setup-template-name"
                    value={draft.name}
                    onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                    placeholder="Legs — hypertrophy"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="setup-template-duration" className="text-xs">
                    Minutes
                  </Label>
                  <Input
                    id="setup-template-duration"
                    type="number"
                    min={1}
                    max={600}
                    value={draft.durationMin}
                    onChange={(event) => setDraft((d) => ({ ...d, durationMin: event.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {FOCUS_AREAS.map((area) => {
                  const isActive = draft.areaTags.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          areaTags: d.areaTags.includes(area)
                            ? d.areaTags.filter((a) => a !== area)
                            : [...d.areaTags, area],
                        }))
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
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

              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                disabled={!draft.name.trim()}
                onClick={() => {
                  setTemplates((list) => [...list, draft]);
                  setDraft({ ...EMPTY_TEMPLATE });
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={step === 0 || isPending}
          onClick={() => setStep((current) => current - 1)}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button size="sm" onClick={() => setStep((current) => current + 1)}>
            Next
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" onClick={finish} disabled={isPending}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? "Saving…" : "Finish"}
          </Button>
        )}
      </div>
    </div>
  );
}
