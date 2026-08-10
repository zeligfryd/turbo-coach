"use client";

/**
 * Saved sessions.
 *
 * A template is a session you do often, stored once with its length and the
 * areas it covers. Scheduling one, or ticking it, updates coverage without
 * logging individual exercises — which is how strength work stays visible to
 * the coverage view before a per-exercise strength tool exists.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hint } from "@/components/training/hint";
import {
  createBlockTemplateAction,
  deleteBlockTemplateAction,
  getBlockTemplates,
} from "@/app/training/actions";
import { MODALITY_ICONS, formatMinutes, modalityColor } from "@/lib/training/display";
import {
  AREA_LABELS,
  BLOCK_MODALITIES,
  FOCUS_AREAS,
  MODALITY_LABELS,
  type BlockModality,
  type FocusArea,
} from "@/lib/training/taxonomy";
import type { BlockTemplateRow } from "@/lib/training/types";
import { cn } from "@/lib/utils";

export function TemplateManager() {
  const [templates, setTemplates] = useState<BlockTemplateRow[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [modality, setModality] = useState<BlockModality>("strength");
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("45");
  const [rpe, setRpe] = useState("7");
  const [areaTags, setAreaTags] = useState<FocusArea[]>([]);

  const refresh = useCallback(async () => {
    const result = await getBlockTemplates();
    if (result.success) setTemplates(result.data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function reset() {
    setModality("strength");
    setName("");
    setDuration("45");
    setRpe("7");
    setAreaTags([]);
    setIsAdding(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            <Hint term="block_template" underline={false}>
              Saved sessions
            </Hint>
          </h2>
          <p className="text-sm text-muted-foreground">
            Sessions you repeat, with the areas they cover.
          </p>
        </div>
        {!isAdding && (
          <Button size="sm" variant="outline" onClick={() => setIsAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_MODALITIES.map((option) => {
              const Icon = MODALITY_ICONS[option];
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={modality === option}
                  onClick={() => setModality(option)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    modality === option
                      ? "border-foreground bg-accent"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: modalityColor(option) }} />
                  {MODALITY_LABELS[option]}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_100px_100px]">
            <div className="grid gap-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Legs — hypertrophy"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="template-duration">Minutes</Label>
              <Input
                id="template-duration"
                type="number"
                min={1}
                max={600}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="template-rpe">
                <Hint term="srpe" underline={false}>
                  RPE
                </Hint>
              </Label>
              <Input
                id="template-rpe"
                type="number"
                min={1}
                max={10}
                value={rpe}
                onChange={(event) => setRpe(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>
              <Hint term="focus_area" underline={false}>
                Areas covered
              </Hint>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_AREAS.map((area) => {
                const isActive = areaTags.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() =>
                      setAreaTags((current) =>
                        current.includes(area)
                          ? current.filter((a) => a !== area)
                          : [...current, area],
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
                    {AREA_LABELS[area]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!name.trim() || isPending}
              onClick={() =>
                startTransition(async () => {
                  await createBlockTemplateAction({
                    modality,
                    name: name.trim(),
                    durationMin: duration ? Number(duration) : null,
                    defaultRpe: rpe ? Number(rpe) : null,
                    areaTags,
                  });
                  reset();
                  await refresh();
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {templates.length === 0 && !isAdding ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No saved sessions yet.
        </p>
      ) : (
        templates.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {templates.map((template) => {
              const Icon = MODALITY_ICONS[template.modality];
              return (
                <li key={template.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: modalityColor(template.modality) }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{template.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {formatMinutes(template.duration_min)}
                      {template.default_rpe ? ` · RPE ${template.default_rpe}` : ""}
                      {template.area_tags.length > 0 &&
                        ` · ${template.area_tags.map((a) => AREA_LABELS[a]).join(", ")}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${template.name}`}
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteBlockTemplateAction(template.id);
                        await refresh();
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
