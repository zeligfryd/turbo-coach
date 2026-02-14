"use client";

import { GripVertical, Trash2, Copy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BuilderInterval = {
  durationSeconds: number;
  intensityPercentStart?: number;
  intensityPercentEnd?: number;
};

type IntervalType = "constant" | "ramp" | "freeRide";

interface IntervalEditorProps {
  interval: BuilderInterval;
  index: number;
  onUpdate: (index: number, interval: Partial<BuilderInterval>) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  isNested?: boolean; // When true, apply nested styling
}

function formatSecondsToMMSS(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function parseMMSSToSeconds(input: string): number | null {
  // Handle MM:SS format
  if (input.includes(":")) {
    const parts = input.split(":");
    if (parts.length !== 2) return null;
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs) || secs >= 60 || secs < 0) return null;
    return mins * 60 + secs;
  }
  // Handle plain seconds
  const seconds = parseInt(input, 10);
  if (isNaN(seconds) || seconds <= 0) return null;
  return seconds;
}

function getIntervalType(interval: BuilderInterval): IntervalType {
  if (interval.intensityPercentStart === undefined) return "freeRide";
  if (interval.intensityPercentEnd !== undefined && interval.intensityPercentEnd !== interval.intensityPercentStart) {
    return "ramp";
  }
  return "constant";
}

export function IntervalEditor({
  interval,
  index,
  onUpdate,
  onDelete,
  onDuplicate,
  dragHandleProps,
  isNested = false,
}: IntervalEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [durationInput, setDurationInput] = useState(formatSecondsToMMSS(interval.durationSeconds));
  const intervalType = getIntervalType(interval);

  const handleDurationChange = (value: string) => {
    setDurationInput(value);
    const seconds = parseMMSSToSeconds(value);
    if (seconds !== null) {
      onUpdate(index, { durationSeconds: seconds });
    }
  };

  const handleDurationBlur = () => {
    // Reformat to MM:SS on blur
    setDurationInput(formatSecondsToMMSS(interval.durationSeconds));
  };

  const handleTypeChange = (type: IntervalType) => {
    if (type === "freeRide") {
      onUpdate(index, {
        intensityPercentStart: undefined,
        intensityPercentEnd: undefined,
      });
    } else if (type === "constant") {
      onUpdate(index, {
        intensityPercentStart: interval.intensityPercentStart ?? 50,
        intensityPercentEnd: undefined,
      });
    } else if (type === "ramp") {
      onUpdate(index, {
        intensityPercentStart: interval.intensityPercentStart ?? 50,
        intensityPercentEnd: interval.intensityPercentEnd ?? 80,
      });
    }
  };

  const handleIntensityStartChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      onUpdate(index, { intensityPercentStart: num });
    }
  };

  const handleIntensityEndChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      onUpdate(index, { intensityPercentEnd: num });
    }
  };

  const durationError = parseMMSSToSeconds(durationInput) === null;
  const intensityStartError = intervalType !== "freeRide" && (interval.intensityPercentStart === undefined || interval.intensityPercentStart < 0);
  const intensityEndError = intervalType === "ramp" && (interval.intensityPercentEnd === undefined || interval.intensityPercentEnd < 0);
  const hasError = durationError || intensityStartError || intensityEndError;

  // Mobile: Compact view summary
  let summary = `${formatSecondsToMMSS(interval.durationSeconds)}`;
  if (intervalType === "constant") {
    summary += ` | Constant | ${interval.intensityPercentStart}%`;
  } else if (intervalType === "ramp") {
    summary += ` | Ramp | ${interval.intensityPercentStart}% → ${interval.intensityPercentEnd}%`;
  } else {
    summary += ` | Free Ride`;
  }

  return (
    <div className={cn(
      "border border-border rounded-lg",
      isNested ? "bg-background" : "bg-card",
      hasError && "border-destructive"
    )}>
      {/* MOBILE LAYOUT - Expandable/Collapsible */}
      <div className="md:hidden">
        <div className="flex items-center gap-1.5 p-2">
          {/* Drag Handle */}
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Index */}
          <span className="text-sm font-medium text-muted-foreground w-5">
            {index + 1}.
          </span>

          {/* Summary - clickable to expand */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-1 text-left text-sm hover:text-foreground transition-colors"
          >
            {summary}
          </button>

          {/* Action Buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDuplicate(index)}
            className="h-7 w-7 p-0"
            title="Duplicate"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(index)}
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Expanded View - Mobile */}
        {isExpanded && (
          <div className="px-2 pb-2 space-y-3 pt-2 border-t border-border">
            {/* Duration Input */}
            <div>
              <Label htmlFor={`duration-${index}`} className="text-xs">Duration</Label>
              <Input
                id={`duration-${index}`}
                value={durationInput}
                onChange={(e) => handleDurationChange(e.target.value)}
                onBlur={handleDurationBlur}
                placeholder="MM:SS"
                className={cn("h-8 text-sm", durationError && "border-destructive")}
              />
            </div>

            {/* Interval Type Selector */}
            <div>
              <Label className="text-xs">Type</Label>
              <div className="flex gap-1 mt-1">
                <Button
                  type="button"
                  variant={intervalType === "constant" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTypeChange("constant")}
                  className="flex-1 h-8"
                >
                  Constant
                </Button>
                <Button
                  type="button"
                  variant={intervalType === "ramp" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTypeChange("ramp")}
                  className="flex-1 h-8"
                >
                  Ramp
                </Button>
                <Button
                  type="button"
                  variant={intervalType === "freeRide" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTypeChange("freeRide")}
                  className="flex-1 h-8"
                >
                  Free Ride
                </Button>
              </div>
            </div>

            {/* Power Inputs */}
            {intervalType === "constant" && (
              <div>
                <Label htmlFor={`intensity-${index}`} className="text-xs">Power (% FTP)</Label>
                <Input
                  id={`intensity-${index}`}
                  type="number"
                  min="0"
                  step="1"
                  value={interval.intensityPercentStart ?? ""}
                  onChange={(e) => handleIntensityStartChange(e.target.value)}
                  placeholder="50"
                  className={cn("h-8 text-sm", intensityStartError && "border-destructive")}
                />
              </div>
            )}

            {intervalType === "ramp" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor={`intensity-start-${index}`} className="text-xs">Start %</Label>
                  <Input
                    id={`intensity-start-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    value={interval.intensityPercentStart ?? ""}
                    onChange={(e) => handleIntensityStartChange(e.target.value)}
                    placeholder="50"
                    className={cn("h-8 text-sm", intensityStartError && "border-destructive")}
                  />
                </div>
                <div>
                  <Label htmlFor={`intensity-end-${index}`} className="text-xs">End %</Label>
                  <Input
                    id={`intensity-end-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    value={interval.intensityPercentEnd ?? ""}
                    onChange={(e) => handleIntensityEndChange(e.target.value)}
                    placeholder="80"
                    className={cn("h-8 text-sm", intensityEndError && "border-destructive")}
                  />
                </div>
              </div>
            )}

            {intervalType === "freeRide" && (
              <p className="text-xs text-muted-foreground">
                No power target
              </p>
            )}

            {hasError && (
              <p className="text-xs text-destructive">
                Please fix validation errors
              </p>
            )}
          </div>
        )}
      </div>

      {/* DESKTOP LAYOUT - Inline */}
      <div className="hidden md:flex items-center gap-3 p-2">
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Index */}
        <span className="text-sm font-medium text-muted-foreground w-5">
          {index + 1}.
        </span>

        {/* Duration Input */}
        <Input
          value={durationInput}
          onChange={(e) => handleDurationChange(e.target.value)}
          onBlur={handleDurationBlur}
          placeholder="MM:SS"
          className={cn("w-20 h-8 text-sm", durationError && "border-destructive")}
        />

        {/* Type Selector */}
        <div className="flex rounded-md border border-input">
          <Button
            type="button"
            variant={intervalType === "constant" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTypeChange("constant")}
            className="h-8 px-3 rounded-none rounded-l-md border-r"
          >
            Constant
          </Button>
          <Button
            type="button"
            variant={intervalType === "ramp" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTypeChange("ramp")}
            className="h-8 px-3 rounded-none border-r"
          >
            Ramp
          </Button>
          <Button
            type="button"
            variant={intervalType === "freeRide" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTypeChange("freeRide")}
            className="h-8 px-3 rounded-none rounded-r-md"
          >
            Free Ride
          </Button>
        </div>

        {/* Power Inputs - Conditional based on type */}
        {intervalType === "constant" && (
          <Input
            type="number"
            min="0"
            step="1"
            value={interval.intensityPercentStart ?? ""}
            onChange={(e) => handleIntensityStartChange(e.target.value)}
            placeholder="% FTP"
            className={cn("w-24 h-8 text-sm", intensityStartError && "border-destructive")}
          />
        )}

        {intervalType === "ramp" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="1"
              value={interval.intensityPercentStart ?? ""}
              onChange={(e) => handleIntensityStartChange(e.target.value)}
              placeholder="Start %"
              className={cn("w-20 h-8 text-sm", intensityStartError && "border-destructive")}
            />
            <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <Input
              type="number"
              min="0"
              step="1"
              value={interval.intensityPercentEnd ?? ""}
              onChange={(e) => handleIntensityEndChange(e.target.value)}
              placeholder="End %"
              className={cn("w-20 h-8 text-sm", intensityEndError && "border-destructive")}
            />
          </div>
        )}

        {intervalType === "freeRide" && (
          <span className="text-sm text-muted-foreground italic">
            No power target
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action Buttons */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDuplicate(index)}
          className="h-8 w-8 p-0"
          title="Duplicate interval"
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(index)}
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          title="Delete interval"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Error Messages - Full Width Below */}
      {hasError && (
        <div className="hidden md:block px-2 pb-2 text-xs text-destructive">
          {durationError && "Invalid duration. "}
          {intensityStartError && "Invalid start power. "}
          {intensityEndError && "Invalid end power."}
        </div>
      )}
    </div>
  );
}
