"use client";

/**
 * Explanation in place (D9).
 *
 * Three components, one source of copy (lib/training/glossary.ts):
 *   <Hint>       wraps a term so it carries its own explanation.
 *   <HintIcon>   a standalone ⓘ for when there is no term to wrap.
 *   <InfoPanel>  a dismissible "how to read this" strip at the top of a surface.
 *
 * Rules: help never blocks, tooltips open on hover AND keyboard focus, and a
 * hint that would merely restate its label is not written. Deliberately not a
 * `title` attribute — those are invisible on touch, unstyled, and skipped by
 * most screen readers.
 */

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { glossary, type GlossaryKey } from "@/lib/training/glossary";
import { cn } from "@/lib/utils";

function HintBody({ termKey }: { termKey: GlossaryKey }) {
  const entry = glossary(termKey);
  return (
    <>
      <p className="font-medium text-popover-foreground">{entry.term}</p>
      <p className="mt-1 text-muted-foreground">{entry.short}</p>
      {entry.why && <p className="mt-1.5 text-muted-foreground">{entry.why}</p>}
    </>
  );
}

/**
 * Wraps a label so it explains itself. The trigger is a button so it is
 * reachable by keyboard; the dotted underline is the affordance.
 *
 *   <Hint term="staleness">Time since last</Hint>
 */
export function Hint({
  term,
  children,
  className,
  underline = true,
  side = "top",
}: {
  term: GlossaryKey;
  children?: React.ReactNode;
  className?: string;
  underline?: boolean;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const entry = glossary(term);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // A tooltip trigger that does nothing on click still must not submit
          // a surrounding form.
          onClick={(event) => event.preventDefault()}
          className={cn(
            "cursor-help text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm",
            underline && "underline decoration-dotted decoration-muted-foreground/60 underline-offset-4",
            className
          )}
        >
          {children ?? entry.term}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        <HintBody termKey={term} />
      </TooltipContent>
    </Tooltip>
  );
}

/** A standalone ⓘ, for headings and controls that shouldn't carry an underline. */
export function HintIcon({
  term,
  className,
  side = "top",
}: {
  term: GlossaryKey;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const entry = glossary(term);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.preventDefault()}
          aria-label={`What is ${entry.term}?`}
          className={cn(
            "inline-flex items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full",
            className
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        <HintBody termKey={term} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A "how to read this" strip for the top of a new surface. Dismissal is
 * remembered per surface, so it explains once and then gets out of the way.
 */
export function InfoPanel({
  id,
  title,
  children,
  className,
}: {
  /** Stable key for the dismissal memory, e.g. "coverage". */
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const storageKey = `turbo-coach-info-dismissed-${id}`;
  // Start hidden and reveal after reading localStorage, so a dismissed panel
  // never flashes in on load.
  const [state, setState] = useState<"pending" | "shown" | "hidden">("pending");

  useEffect(() => {
    setState(localStorage.getItem(storageKey) === "1" ? "hidden" : "shown");
  }, [storageKey]);

  if (state !== "shown") return null;

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border/70 bg-card px-4 py-3 pr-10 text-sm shadow-sm",
        className
      )}
    >
      <div className="flex gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <div className="mt-1 text-muted-foreground [&_p+p]:mt-1.5">{children}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(storageKey, "1");
          setState("hidden");
        }}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
