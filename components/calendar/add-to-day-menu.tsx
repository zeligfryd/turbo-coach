"use client";

/**
 * The single "add something to this day" control.
 *
 * Replaces the three icon buttons that used to sit on every calendar cell — a
 * race flag, a plus and a dumbbell — which came to 21 controls per visible
 * week, most on days with nothing in them, none of them a comfortable tap
 * size on a phone.
 *
 * Two shapes, same menu:
 *   • `icon` (default) — a plus in the day header, revealed on hover or focus.
 *   • `fill` — for an empty day, where the whole cell is the button. Nothing is
 *     drawn until the day is hovered or focused, so an empty week reads as
 *     empty rather than as a grid of controls.
 */

import { Plus, Bike, Dumbbell, Flag } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  dateKey: string;
  onAdd: (date: string) => void;
  onAddRace?: (date: string) => void;
  onAddBlock?: (date: string) => void;
  variant?: "icon" | "fill";
  className?: string;
};

export function AddToDayMenu({
  dateKey,
  onAdd,
  onAddRace,
  onAddBlock,
  variant = "icon",
  className = "",
}: Props) {
  const trigger =
    variant === "fill" ? (
      <button
        type="button"
        // Fills the remaining cell height: the tap target is the day itself.
        className={cn(
          "group/add -m-1 flex min-h-[44px] flex-1 items-center justify-center rounded-md",
          "text-muted-foreground/0 transition-colors",
          "hover:bg-accent/60 hover:text-muted-foreground",
          "focus-visible:bg-accent/60 focus-visible:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
        aria-label={`Add to ${dateKey}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
        aria-label={`Add to ${dateKey}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onSelect={() => onAdd(dateKey)}>
          <Bike className="mr-2 h-4 w-4" aria-hidden="true" />
          Ride
        </DropdownMenuItem>
        {onAddBlock && (
          <DropdownMenuItem onSelect={() => onAddBlock(dateKey)}>
            <Dumbbell className="mr-2 h-4 w-4" aria-hidden="true" />
            Off-bike session
          </DropdownMenuItem>
        )}
        {onAddRace && (
          <DropdownMenuItem onSelect={() => onAddRace(dateKey)}>
            <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
            Race or event
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
