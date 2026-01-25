"use client";

import { GripVertical, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
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
  dragHandleProps?: any;
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

  // Compact view summary
  let summary = `${formatSecondsToMMSS(interval.durationSeconds)}`;
  if (intervalType === "constant") {
    summary += ` | Constant | ${interval.intensityPercentStart}%`;
  } else if (intervalType === "ramp") {
    summary += ` | Ramp | ${interval.intensityPercentStart}% → ${interval.intensityPercentEnd}%`;
  } else {
    summary += ` | Free Ride`;
  }

  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      {/* Compact View */}
      <div className="flex items-center gap-2">
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Index */}
        <span className="text-sm font-medium text-muted-foreground w-6">
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

      {/* Expanded View */}
      {isExpanded && (
        <div className="mt-4 space-y-4 pt-4 border-t border-border">
          {/* Duration Input */}
          <div>
            <Label htmlFor={`duration-${index}`}>Duration (MM:SS or seconds)</Label>
            <Input
              id={`duration-${index}`}
              value={durationInput}
              onChange={(e) => handleDurationChange(e.target.value)}
              onBlur={handleDurationBlur}
              placeholder="5:00"
              className={cn(durationError && "border-destructive")}
            />
            {durationError && (
              <p className="text-xs text-destructive mt-1">
                Enter duration as MM:SS (e.g., 5:00) or seconds (e.g., 300)
              </p>
            )}
          </div>

          {/* Interval Type Selector */}
          <div>
            <Label>Type</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant={intervalType === "constant" ? "default" : "outline"}
                size="sm"
                onClick={() => handleTypeChange("constant")}
              >
                Constant
              </Button>
              <Button
                type="button"
                variant={intervalType === "ramp" ? "default" : "outline"}
                size="sm"
                onClick={() => handleTypeChange("ramp")}
              >
                Ramp
              </Button>
              <Button
                type="button"
                variant={intervalType === "freeRide" ? "default" : "outline"}
                size="sm"
                onClick={() => handleTypeChange("freeRide")}
              >
                Free Ride
              </Button>
            </div>
          </div>

          {/* Power Inputs */}
          {intervalType === "constant" && (
            <div>
              <Label htmlFor={`intensity-${index}`}>Power (% FTP)</Label>
              <Input
                id={`intensity-${index}`}
                type="number"
                min="0"
                step="1"
                value={interval.intensityPercentStart ?? ""}
                onChange={(e) => handleIntensityStartChange(e.target.value)}
                placeholder="50"
                className={cn(intensityStartError && "border-destructive")}
              />
              {intensityStartError && (
                <p className="text-xs text-destructive mt-1">Power must be 0 or greater</p>
              )}
            </div>
          )}

          {intervalType === "ramp" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`intensity-start-${index}`}>Start Power (% FTP)</Label>
                <Input
                  id={`intensity-start-${index}`}
                  type="number"
                  min="0"
                  step="1"
                  value={interval.intensityPercentStart ?? ""}
                  onChange={(e) => handleIntensityStartChange(e.target.value)}
                  placeholder="50"
                  className={cn(intensityStartError && "border-destructive")}
                />
              </div>
              <div>
                <Label htmlFor={`intensity-end-${index}`}>End Power (% FTP)</Label>
                <Input
                  id={`intensity-end-${index}`}
                  type="number"
                  min="0"
                  step="1"
                  value={interval.intensityPercentEnd ?? ""}
                  onChange={(e) => handleIntensityEndChange(e.target.value)}
                  placeholder="80"
                  className={cn(intensityEndError && "border-destructive")}
                />
              </div>
              {(intensityStartError || intensityEndError) && (
                <p className="text-xs text-destructive col-span-2">
                  Both start and end power must be 0 or greater
                </p>
              )}
            </div>
          )}

          {intervalType === "freeRide" && (
            <p className="text-sm text-muted-foreground">
              No power target. Ride at any intensity you like.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
