"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface WorkoutMetadataProps {
  name: string;
  category: string;
  description: string;
  tags: string[];
  isPublic: boolean;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string[]) => void;
  onPublicChange: (value: boolean) => void;
}

const CATEGORIES = [
  { value: "recovery", label: "Recovery" },
  { value: "endurance", label: "Endurance" },
  { value: "tempo", label: "Tempo" },
  { value: "threshold", label: "Threshold" },
  { value: "vo2max", label: "VO2 Max" },
  { value: "anaerobic", label: "Anaerobic" },
  { value: "custom", label: "Custom" },
];

export function WorkoutMetadata({
  name,
  category,
  description,
  tags,
  isPublic,
  onNameChange,
  onCategoryChange,
  onDescriptionChange,
  onTagsChange,
  onPublicChange,
}: WorkoutMetadataProps) {
  // Track raw input value separately so user can type commas
  const [tagsInput, setTagsInput] = useState(tags.join(", "));

  // Update local input when tags prop changes (e.g., when loading a workout)
  useEffect(() => {
    setTagsInput(tags.join(", "));
  }, [tags]);

  const parseAndUpdateTags = (value: string) => {
    // Parse comma-separated tags
    const newTags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    onTagsChange(newTags);
  };

  const handleTagsBlur = () => {
    // Parse tags when user leaves the input
    parseAndUpdateTags(tagsInput);
  };

  const handleTagsKeyDown = (e: React.KeyboardEvent) => {
    // Parse tags when user presses Enter
    if (e.key === "Enter") {
      e.preventDefault();
      parseAndUpdateTags(tagsInput);
    }
  };

  return (
    <div className="space-y-4">
      {/* Name and Visibility Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="workout-name">
            Workout Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="workout-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="My Custom Workout"
            required
          />
        </div>

        <div className="flex items-end">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-public"
              checked={isPublic}
              onCheckedChange={(checked) => onPublicChange(checked === true)}
            />
            <Label
              htmlFor="is-public"
              className="text-sm font-normal cursor-pointer"
            >
              Make this workout public (visible to all users)
            </Label>
          </div>
        </div>
      </div>

      {/* Category */}
      <div>
        <Label htmlFor="workout-category">Category</Label>
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger id="workout-category">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="workout-description">Description (optional)</Label>
        <textarea
          id="workout-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe your workout..."
          rows={3}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Tags */}
      <div>
        <Label htmlFor="workout-tags">Tags (optional, comma-separated)</Label>
        <Input
          id="workout-tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onBlur={handleTagsBlur}
          onKeyDown={handleTagsKeyDown}
          placeholder="interval, vo2max, hard"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
