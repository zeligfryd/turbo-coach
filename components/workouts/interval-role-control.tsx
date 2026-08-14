"use client";

/**
 * Saying what an interval is for.
 *
 * Progression operators act only on work intervals, so a wrong role produces
 * variations that are wrong in a plausible way — a warm-up creeping up two
 * minutes a week, a recovery valley climbing to threshold. The numbers still
 * add up and the plan still looks reasonable, which is exactly why this has to
 * be visible rather than inferred behind the scenes.
 *
 * Until you touch it, the role shown is inferred and marked as such. Choosing
 * one writes it down, and from then on nothing re-guesses it.
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INTERVAL_ROLES, type IntervalRole } from "@/lib/workouts/types";
import { cn } from "@/lib/utils";

export const ROLE_LABELS: Record<IntervalRole, string> = {
  work: "Work",
  recovery: "Recovery",
  warmup: "Warm-up",
  cooldown: "Cool-down",
};

/**
 * Work is the only one that carries weight, so it is the only one with colour.
 * Painting all four would turn a list of intervals into a colour chart and bury
 * the single distinction that matters.
 */
export const ROLE_COLORS: Record<IntervalRole, string> = {
  work: "hsl(var(--primary))",
  recovery: "hsl(var(--muted-foreground))",
  warmup: "hsl(var(--muted-foreground))",
  cooldown: "hsl(var(--muted-foreground))",
};

export function RoleDot({
  role,
  inferred,
  className,
}: {
  role: IntervalRole;
  inferred: boolean;
  className?: string;
}) {
  return (
    <span
      // Hollow while inferred, filled once you have said so. A guess and a
      // decision should not look identical.
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={
        inferred
          ? { border: `1.5px solid ${ROLE_COLORS[role]}` }
          : { backgroundColor: ROLE_COLORS[role] }
      }
      title={inferred ? `${ROLE_LABELS[role]} (inferred)` : ROLE_LABELS[role]}
      aria-hidden="true"
    />
  );
}

export function IntervalRoleControl({
  role,
  inferred,
  onChange,
  label = "Role",
}: {
  role: IntervalRole;
  inferred: boolean;
  onChange: (role: IntervalRole) => void;
  label?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {label}
        {inferred && <span className="ml-1.5 text-[10px]">inferred — tap to confirm</span>}
      </p>
      <div
        className="mt-1 inline-flex overflow-hidden rounded-md border border-border"
        role="group"
        aria-label="Interval role"
      >
        {INTERVAL_ROLES.map((option) => {
          const active = option === role;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active && !inferred}
              onClick={() => onChange(option)}
              className={cn(
                "min-h-[32px] border-r border-border px-2.5 text-xs transition-colors last:border-r-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active
                  ? inferred
                    ? "bg-accent font-medium text-foreground"
                    : "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {ROLE_LABELS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The dot, as the control.
 *
 * The desktop row is already a single line of duration, type, power and
 * cadence; a four-button group would push it wider still. The dot is the role
 * indicator anyway, so clicking it to change the role costs no width and needs
 * no explaining.
 */
export function RoleMenu({
  role,
  inferred,
  onChange,
}: {
  role: IntervalRole;
  inferred: boolean;
  onChange: (role: IntervalRole) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Role: ${ROLE_LABELS[role]}${inferred ? " (inferred)" : ""}. Change it.`}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RoleDot role={role} inferred={inferred} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {INTERVAL_ROLES.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onChange(option)}>
            <RoleDot role={option} inferred={false} className="mr-2" />
            {ROLE_LABELS[option]}
            {option === role && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {inferred ? "inferred" : "set"}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
