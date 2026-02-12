"use client";

import { GripVertical, Trash2, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { IntervalEditor, type BuilderInterval } from "./interval-editor";

export type RepeatGroupData = {
  count: number;
  intervals: BuilderInterval[];
};

interface RepeatGroupEditorProps {
  group: RepeatGroupData;
  index: number;
  onUpdate: (index: number, group: Partial<RepeatGroupData>) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
  onAddInterval: (groupIndex: number) => void;
  onUpdateInterval: (groupIndex: number, intervalIndex: number, interval: Partial<BuilderInterval>) => void;
  onDeleteInterval: (groupIndex: number, intervalIndex: number) => void;
  onDuplicateInterval: (groupIndex: number, intervalIndex: number) => void;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  intervalDragHandleProps?: (intervalIndex: number) => HTMLAttributes<HTMLElement>;
}

export function RepeatGroupEditor({
  group,
  index,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddInterval,
  onUpdateInterval,
  onDeleteInterval,
  onDuplicateInterval,
  dragHandleProps,
  intervalDragHandleProps,
}: RepeatGroupEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [countInput, setCountInput] = useState(group.count.toString());

  const handleCountChange = (value: string) => {
    setCountInput(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 999) {
      onUpdate(index, { count: num });
    }
  };

  const handleCountBlur = () => {
    // Reset to valid value on blur if invalid
    setCountInput(group.count.toString());
  };

  const totalIntervals = group.count * group.intervals.length;
  const countError = parseInt(countInput, 10) < 1 || parseInt(countInput, 10) > 999 || isNaN(parseInt(countInput, 10));

  // Mobile: Compact view summary
  const summary = `Repeat ${group.count}x (${group.intervals.length} interval${group.intervals.length !== 1 ? 's' : ''})`;

  return (
    <div className={cn("border-2 border-primary/20 rounded-lg bg-card", countError && "border-destructive")}>
      {/* MOBILE LAYOUT - Expandable/Collapsible */}
      <div className="md:hidden">
        <div className="flex items-center gap-1.5 p-2 bg-primary/5">
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
            className="flex-1 text-left text-sm font-medium hover:text-foreground transition-colors"
          >
            {summary}
          </button>

          {/* Action Buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDuplicate(index)}
            className="h-7 w-7 p-0"
            title="Duplicate group"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(index)}
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            title="Delete group"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Expanded View - Mobile */}
        {isExpanded && (
          <div className="p-2 space-y-3">
            {/* Count Input */}
            <div>
              <Label htmlFor={`repeat-count-${index}`} className="text-xs">Repeat Count</Label>
              <Input
                id={`repeat-count-${index}`}
                type="number"
                min="1"
                max="999"
                value={countInput}
                onChange={(e) => handleCountChange(e.target.value)}
                onBlur={handleCountBlur}
                className={cn("h-8 text-sm", countError && "border-destructive")}
              />
            </div>

            {/* Intervals */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Intervals in Group</Label>
                <Button
                  onClick={() => onAddInterval(index)}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
              </div>
              <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                {group.intervals.map((interval, intervalIndex) => (
                  <IntervalEditor
                    key={intervalIndex}
                    interval={interval}
                    index={intervalIndex}
                    onUpdate={(_, data) => onUpdateInterval(index, intervalIndex, data)}
                    onDelete={() => onDeleteInterval(index, intervalIndex)}
                    onDuplicate={() => onDuplicateInterval(index, intervalIndex)}
                    dragHandleProps={intervalDragHandleProps?.(intervalIndex)}
                    isNested={true}
                  />
                ))}
              </div>
            </div>

            {/* Total Info */}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              = {totalIntervals} interval{totalIntervals !== 1 ? 's' : ''} when expanded
            </div>
          </div>
        )}
      </div>

      {/* DESKTOP LAYOUT - Inline */}
      <div className="hidden md:block">
        <div className="flex items-center gap-3 p-2 bg-primary/5">
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

          {/* Repeat Label + Count */}
          <span className="text-sm font-medium">Repeat</span>
          <Input
            type="number"
            min="1"
            max="999"
            value={countInput}
            onChange={(e) => handleCountChange(e.target.value)}
            onBlur={handleCountBlur}
            className={cn("w-16 h-8 text-sm", countError && "border-destructive")}
          />
          <span className="text-sm font-medium">x</span>

          {/* Add Interval Button */}
          <Button
            onClick={() => onAddInterval(index)}
            size="sm"
            variant="outline"
            className="h-8 gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Interval
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Total Info */}
          <span className="text-xs text-muted-foreground">
            = {totalIntervals} intervals
          </span>

          {/* Action Buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDuplicate(index)}
            className="h-8 w-8 p-0"
            title="Duplicate group"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(index)}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            title="Delete group"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Intervals List */}
        <div className="p-2 space-y-2 bg-muted/20">
          {group.intervals.map((interval, intervalIndex) => (
            <IntervalEditor
              key={intervalIndex}
              interval={interval}
              index={intervalIndex}
              onUpdate={(_, data) => onUpdateInterval(index, intervalIndex, data)}
              onDelete={() => onDeleteInterval(index, intervalIndex)}
              onDuplicate={() => onDuplicateInterval(index, intervalIndex)}
              dragHandleProps={intervalDragHandleProps?.(intervalIndex)}
              isNested={true}
            />
          ))}
        </div>
      </div>

      {/* Error Messages - Full Width Below */}
      {countError && (
        <div className="px-2 pb-2 text-xs text-destructive">
          Repeat count must be between 1 and 999
        </div>
      )}
    </div>
  );
}
