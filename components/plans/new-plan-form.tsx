"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createPlan } from "@/app/plans/actions";
import { scaffoldManualPlan } from "@/app/plans/composer-actions";
import { cn } from "@/lib/utils";

export function NewPlanForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [goal, setGoal] = useState("");
  const [philosophy, setPhilosophy] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Manual by default. The coach path still exists and is one click away, but
  // it is the one that needs a conversation before it produces anything —
  // building it yourself starts working immediately.
  const [mode, setMode] = useState<"manual" | "coach">("manual");
  const [workWeeks, setWorkWeeks] = useState(3);
  const [recoveryWeeks, setRecoveryWeeks] = useState(1);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createPlan({
        name,
        duration_weeks: durationWeeks,
        goal: goal.trim() || null,
        philosophy: philosophy.trim() || null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }

      // Scaffolding here rather than in the composer means the grid is never
      // an empty screen with a "set up your pattern first" message on it.
      if (mode === "manual") {
        const scaffold = await scaffoldManualPlan({
          planId: res.id,
          workWeeks,
          recoveryWeeks,
          durationWeeks,
        });
        if (!scaffold.success) {
          setError(scaffold.error);
          return;
        }
      }

      router.push(`/plans/${res.id}`);
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>How do you want to build it?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  key: "manual" as const,
                  title: "Build it myself",
                  blurb: "Pick a work/recovery pattern, lay out a week, derive the rest.",
                },
                {
                  key: "coach" as const,
                  title: "Ask the coach",
                  blurb: "Describe the goal and let it propose the structure.",
                },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={mode === option.key}
                  onClick={() => setMode(option.key)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mode === option.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          {mode === "manual" && (
            <div className="space-y-1.5">
              <Label>Work / recovery pattern</Label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={workWeeks}
                  onChange={(e) => setWorkWeeks(Number(e.target.value))}
                  className="w-16"
                  aria-label="Work weeks"
                />
                <span className="text-muted-foreground">weeks building, then</span>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  value={recoveryWeeks}
                  onChange={(e) => setRecoveryWeeks(Number(e.target.value))}
                  className="w-16"
                  aria-label="Recovery weeks"
                />
                <span className="text-muted-foreground">recovering, repeated.</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2026 Spring base"
              required
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="duration">Duration (weeks)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              max={52}
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
              required
            />
            <p className="text-xs text-muted-foreground">
              Between 1 and 52. You can restructure blocks inside the editor.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal">Goal (optional)</Label>
            <Input
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Peak for a hilly gran fondo in May"
              maxLength={240}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="philosophy">Philosophy (optional)</Label>
            <textarea
              id="philosophy"
              value={philosophy}
              onChange={(e) => setPhilosophy(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Polarised base, two hard sessions a week, one long ride, endurance otherwise."
              maxLength={1000}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" asChild>
              <Link href="/plans">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Creating…" : "Create plan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
