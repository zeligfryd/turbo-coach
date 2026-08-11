"use client";

/**
 * Asks for one number, immediately after logging, and only then.
 *
 * Every bike sRPE in the database is estimated from intensity factor, so the
 * whole session-load side rests on a curve rather than on anything reported.
 * The old screen offered the 1–10 scale as a permanent row of ten small
 * buttons under every logged session, which is both easy to ignore and a lot
 * of furniture to carry.
 *
 * Here it is transient: it appears where the session card was, at the one
 * moment the answer is known, and it can be skipped by doing nothing. Undo
 * lives alongside it because a mis-tap on a phone is routine.
 */

import { Undo2 } from "lucide-react";

import { Hint } from "@/components/training/hint";

const SCALE = [
  { value: 2, label: "Easy" },
  { value: 4, label: "Steady" },
  { value: 6, label: "Hard" },
  { value: 8, label: "Very hard" },
  { value: 10, label: "Max" },
];

export function RpePrompt({
  name,
  onRpe,
  onUndo,
  onDismiss,
  disabled,
}: {
  name: string;
  onRpe: (value: number) => void;
  onUndo: () => void;
  onDismiss: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{name} logged</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Hint term="srpe" underline={false}>
              How hard was it?
            </Hint>{" "}
            Optional.
          </p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          disabled={disabled}
          className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          Undo
        </button>
      </div>

      {/* Five words rather than ten numbers: a rating you can give without
          having to remember what 7 means. The value stored is still 1–10. */}
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {SCALE.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onRpe(value)}
            disabled={disabled}
            className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border border-border text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="text-sm font-semibold tabular-nums">{value}</span>
            <span className="px-0.5 text-[10px] leading-tight text-muted-foreground">{label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        disabled={disabled}
        className="mt-2 min-h-[36px] w-full text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip
      </button>
    </section>
  );
}
