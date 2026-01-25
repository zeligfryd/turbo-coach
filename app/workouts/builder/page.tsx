"use client";

import React, { useReducer, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WorkoutMetadata } from "@/components/workouts/workout-metadata";
import { IntervalEditor, type BuilderInterval } from "@/components/workouts/interval-editor";
import { RepeatGroupEditor, type RepeatGroupData } from "@/components/workouts/repeat-group-editor";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { Workout, BuilderItem, WorkoutInterval } from "@/lib/workouts/types";
import {
  flattenBuilderItems,
  calculateAveragePower,
  calculateWork,
  calculateTSS,
  formatWork,
  calculateTotalDurationFromItems,
  calculateAverageIntensityFromItems,
  formatDuration,
  DEFAULT_FTP_WATTS,
} from "@/lib/workouts/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const IntensityBarChart = dynamic(
  () => import("@/components/workouts/intensity-bar-chart").then((mod) => ({ default: mod.IntensityBarChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground bg-muted/30 rounded-lg">
        Loading preview...
      </div>
    ),
  }
);

type BuilderState = {
  name: string;
  category: string;
  description: string;
  tags: string[];
  isPublic: boolean;
  items: BuilderItem[]; // Changed from intervals
  workoutId?: string;
  mode: "create" | "edit" | "copy";
};

type BuilderAction =
  | { type: "ADD_INTERVAL" }
  | { type: "ADD_REPEAT_GROUP" }
  | { type: "UPDATE_ITEM"; index: number; item: Partial<BuilderItem> }
  | { type: "UPDATE_INTERVAL"; index: number; interval: Partial<BuilderInterval> }
  | { type: "UPDATE_REPEAT_COUNT"; groupIndex: number; count: number }
  | { type: "UPDATE_INTERVAL_IN_GROUP"; groupIndex: number; intervalIndex: number; interval: Partial<BuilderInterval> }
  | { type: "ADD_INTERVAL_TO_GROUP"; groupIndex: number }
  | { type: "DELETE_INTERVAL_FROM_GROUP"; groupIndex: number; intervalIndex: number }
  | { type: "DUPLICATE_INTERVAL_IN_GROUP"; groupIndex: number; intervalIndex: number }
  | { type: "DELETE_ITEM"; index: number }
  | { type: "DELETE_INTERVAL"; index: number }
  | { type: "DUPLICATE_ITEM"; index: number }
  | { type: "DUPLICATE_INTERVAL"; index: number }
  | { type: "REORDER_ITEMS"; oldIndex: number; newIndex: number }
  | { type: "REORDER_INTERVALS"; oldIndex: number; newIndex: number }
  | { type: "SET_METADATA"; field: string; value: any }
  | { type: "LOAD_WORKOUT"; workout: Workout; mode: "edit" | "copy" };

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "ADD_INTERVAL":
      return {
        ...state,
        items: [
          ...state.items,
          {
            type: "interval",
            data: { durationSeconds: 300, intensityPercentStart: 50 },
          },
        ],
      };

    case "ADD_REPEAT_GROUP":
      return {
        ...state,
        items: [
          ...state.items,
          {
            type: "repeat",
            data: {
              count: 5,
              intervals: [{ durationSeconds: 300, intensityPercentStart: 50 }],
            },
          },
        ],
      };

    case "UPDATE_INTERVAL":
      // Legacy action for backward compatibility with interval-only items
      return {
        ...state,
        items: state.items.map((item, i) =>
          i === action.index && item.type === "interval"
            ? { ...item, data: { ...item.data, ...action.interval } }
            : item
        ),
      };

    case "UPDATE_REPEAT_COUNT":
      return {
        ...state,
        items: state.items.map((item, i) =>
          i === action.groupIndex && item.type === "repeat"
            ? { ...item, data: { ...item.data, count: action.count } }
            : item
        ),
      };

    case "UPDATE_INTERVAL_IN_GROUP":
      return {
        ...state,
        items: state.items.map((item, i) =>
          i === action.groupIndex && item.type === "repeat"
            ? {
              ...item,
              data: {
                ...item.data,
                intervals: item.data.intervals.map((interval, j) =>
                  j === action.intervalIndex
                    ? { ...interval, ...action.interval }
                    : interval
                ),
              },
            }
            : item
        ),
      };

    case "ADD_INTERVAL_TO_GROUP":
      return {
        ...state,
        items: state.items.map((item, i) =>
          i === action.groupIndex && item.type === "repeat"
            ? {
              ...item,
              data: {
                ...item.data,
                intervals: [
                  ...item.data.intervals,
                  { durationSeconds: 300, intensityPercentStart: 50 },
                ],
              },
            }
            : item
        ),
      };

    case "DELETE_INTERVAL_FROM_GROUP":
      return {
        ...state,
        items: state.items.map((item, i) => {
          if (i === action.groupIndex && item.type === "repeat") {
            const newIntervals = item.data.intervals.filter(
              (_, j) => j !== action.intervalIndex
            );
            // If group would be empty after delete, remove the whole group
            if (newIntervals.length === 0) {
              return null;
            }
            return {
              ...item,
              data: { ...item.data, intervals: newIntervals },
            };
          }
          return item;
        }).filter((item): item is BuilderItem => item !== null),
      };

    case "DUPLICATE_INTERVAL_IN_GROUP":
      return {
        ...state,
        items: state.items.map((item, i) =>
          i === action.groupIndex && item.type === "repeat"
            ? {
              ...item,
              data: {
                ...item.data,
                intervals: [
                  ...item.data.intervals.slice(0, action.intervalIndex + 1),
                  { ...item.data.intervals[action.intervalIndex] },
                  ...item.data.intervals.slice(action.intervalIndex + 1),
                ],
              },
            }
            : item
        ),
      };

    case "DELETE_ITEM":
    case "DELETE_INTERVAL":
      return {
        ...state,
        items: state.items.filter((_, i) => i !== action.index),
      };

    case "DUPLICATE_ITEM":
    case "DUPLICATE_INTERVAL":
      const itemToDuplicate = state.items[action.index];
      return {
        ...state,
        items: [
          ...state.items.slice(0, action.index + 1),
          JSON.parse(JSON.stringify(itemToDuplicate)), // Deep clone
          ...state.items.slice(action.index + 1),
        ],
      };

    case "REORDER_ITEMS":
    case "REORDER_INTERVALS":
      return {
        ...state,
        items: arrayMove(state.items, action.oldIndex, action.newIndex),
      };

    case "SET_METADATA":
      return {
        ...state,
        [action.field]: action.value,
      };

    case "LOAD_WORKOUT":
      // Convert database BuilderItems to builder state
      const items: BuilderItem[] = action.workout.intervals.map((item) => {
        if (item.type === "interval") {
          return {
            type: "interval",
            data: {
              durationSeconds: item.data.durationSeconds,
              intensityPercentStart: item.data.intensityPercentStart,
              intensityPercentEnd: item.data.intensityPercentEnd,
            },
          };
        } else {
          return {
            type: "repeat",
            data: {
              count: item.data.count,
              intervals: item.data.intervals.map((interval) => ({
                durationSeconds: interval.durationSeconds,
                intensityPercentStart: interval.intensityPercentStart,
                intensityPercentEnd: interval.intensityPercentEnd,
              })),
            },
          };
        }
      });

      return {
        ...state,
        name: action.mode === "copy" ? `${action.workout.name} Copy` : action.workout.name,
        category: action.workout.category,
        description: action.workout.description || "",
        tags: action.workout.tags || [],
        isPublic: false,
        items,
        workoutId: action.mode === "edit" ? action.workout.id : undefined,
        mode: action.mode,
      };

    default:
      return state;
  }
}

// Sortable wrapper for interval editor
function SortableIntervalEditor({
  interval,
  index,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  interval: BuilderInterval;
  index: number;
  onUpdate: (index: number, interval: Partial<BuilderInterval>) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `item-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <IntervalEditor
        interval={interval}
        index={index}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Sortable wrapper for repeat group editor
function SortableRepeatGroupEditor({
  group,
  index,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddInterval,
  onUpdateInterval,
  onDeleteInterval,
  onDuplicateInterval,
}: {
  group: RepeatGroupData;
  index: number;
  onUpdate: (index: number, group: Partial<RepeatGroupData>) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
  onAddInterval: (groupIndex: number) => void;
  onUpdateInterval: (groupIndex: number, intervalIndex: number, interval: Partial<BuilderInterval>) => void;
  onDeleteInterval: (groupIndex: number, intervalIndex: number) => void;
  onDuplicateInterval: (groupIndex: number, intervalIndex: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `item-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <RepeatGroupEditor
        group={group}
        index={index}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onAddInterval={onAddInterval}
        onUpdateInterval={onUpdateInterval}
        onDeleteInterval={onDeleteInterval}
        onDuplicateInterval={onDuplicateInterval}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function WorkoutBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") || "create") as "create" | "edit" | "copy";
  const workoutId = searchParams.get("id");

  const [state, dispatch] = useReducer(builderReducer, {
    name: "",
    category: "custom",
    description: "",
    tags: [],
    isPublic: false,
    items: [],
    mode,
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [initialState, setInitialState] = React.useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<(() => void) | null>(null);
  const [userFtp, setUserFtp] = React.useState<number>(DEFAULT_FTP_WATTS);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load workout if in edit or copy mode
  useEffect(() => {
    if ((mode === "edit" || mode === "copy") && workoutId) {
      setIsLoading(true);
      const supabase = createClient();
      supabase
        .from("workouts")
        .select("*")
        .eq("id", workoutId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Error loading workout:", error);
            router.push("/workouts/custom");
            return;
          }
          if (data) {
            dispatch({ type: "LOAD_WORKOUT", workout: data as Workout, mode });
            // Set initial state after loading
            setTimeout(() => {
              setInitialState(JSON.stringify({
                name: data.name,
                category: data.category,
                description: data.description,
                tags: data.tags,
                isPublic: false,
                items: data.intervals, // Store items as-is
              }));
            }, 100);
          }
          setIsLoading(false);
        });
    }
  }, [mode, workoutId, router]);

  // Track changes
  useEffect(() => {
    const currentState = JSON.stringify({
      name: state.name,
      category: state.category,
      description: state.description,
      tags: state.tags,
      isPublic: state.isPublic,
      items: state.items,
    });

    // If we have an initial state, compare with current
    if (initialState) {
      setHasUnsavedChanges(currentState !== initialState);
    } else if (mode === "create") {
      // For create mode, check if anything has been entered
      const hasContent = state.name.trim() !== "" ||
        state.description.trim() !== "" ||
        state.items.length > 0;
      setHasUnsavedChanges(hasContent);
    }
  }, [state, initialState, mode]);

  // Fetch user's FTP
  useEffect(() => {
    const fetchUserFtp = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("ftp")
          .eq("id", user.id)
          .single();
        if (profile?.ftp) {
          setUserFtp(profile.ftp);
        }
      }
    };
    fetchUserFtp();
  }, []);

  // Warn on browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = parseInt(active.id.toString().split("-")[1]);
      const newIndex = parseInt(over.id.toString().split("-")[1]);
      dispatch({ type: "REORDER_INTERVALS", oldIndex, newIndex });
    }
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(() => () => router.back());
      setShowUnsavedDialog(true);
      return;
    }
    router.back();
  };

  const handleConfirmLeave = () => {
    setShowUnsavedDialog(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  const handleCancelLeave = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  };

  const handleSave = async () => {
    // Validation
    if (!state.name.trim()) {
      alert("Please enter a workout name");
      return;
    }

    if (state.items.length === 0) {
      alert("Please add at least one interval or repeat group");
      return;
    }

    // Validate all items
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];

      if (item.type === "interval") {
        // Validate single interval
        if (item.data.durationSeconds <= 0) {
          alert(`Interval ${i + 1}: Duration must be greater than 0`);
          return;
        }
        if (
          item.data.intensityPercentStart !== undefined &&
          item.data.intensityPercentStart < 0
        ) {
          alert(`Interval ${i + 1}: Power must be 0 or greater`);
          return;
        }
        if (
          item.data.intensityPercentEnd !== undefined &&
          item.data.intensityPercentEnd < 0
        ) {
          alert(`Interval ${i + 1}: End power must be 0 or greater`);
          return;
        }
      } else if (item.type === "repeat") {
        // Validate repeat group
        if (item.data.count < 1) {
          alert(`Repeat group ${i + 1}: Count must be at least 1`);
          return;
        }
        if (item.data.intervals.length === 0) {
          alert(`Repeat group ${i + 1}: Must contain at least one interval`);
          return;
        }
        // Validate intervals within the group
        for (let j = 0; j < item.data.intervals.length; j++) {
          const interval = item.data.intervals[j];
          if (interval.durationSeconds <= 0) {
            alert(
              `Repeat group ${i + 1}, interval ${j + 1}: Duration must be greater than 0`
            );
            return;
          }
          if (
            interval.intensityPercentStart !== undefined &&
            interval.intensityPercentStart < 0
          ) {
            alert(
              `Repeat group ${i + 1}, interval ${j + 1}: Power must be 0 or greater`
            );
            return;
          }
          if (
            interval.intensityPercentEnd !== undefined &&
            interval.intensityPercentEnd < 0
          ) {
            alert(
              `Repeat group ${i + 1}, interval ${j + 1}: End power must be 0 or greater`
            );
            return;
          }
        }
      }
    }

    // Check total expanded interval count
    const flattenedIntervals = flattenBuilderItems(state.items);
    if (flattenedIntervals.length > 500) {
      if (
        !confirm(
          `This workout will have ${flattenedIntervals.length} intervals when expanded. This might be excessive. Continue?`
        )
      ) {
        return;
      }
    }

    setIsSaving(true);

    try {
      // Convert builder items to database format
      const intervals = state.items.map((item): BuilderItem => {
        if (item.type === "interval") {
          return {
            type: "interval",
            data: {
              name: `Interval ${Math.random()}`, // Auto-generated, optional
              durationSeconds: item.data.durationSeconds,
              intensityPercentStart: item.data.intensityPercentStart,
              intensityPercentEnd: item.data.intensityPercentEnd,
            },
          };
        } else {
          return {
            type: "repeat",
            data: {
              count: item.data.count,
              intervals: item.data.intervals.map((interval, idx) => ({
                name: `Interval ${idx + 1}`,
                durationSeconds: interval.durationSeconds,
                intensityPercentStart: interval.intensityPercentStart,
                intensityPercentEnd: interval.intensityPercentEnd,
              })),
            },
          };
        }
      });

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("You must be logged in to save workouts");
        return;
      }

      const workoutData = {
        name: state.name.trim(),
        category: state.category,
        description: state.description.trim() || null,
        tags: state.tags,
        intervals, // Save as BuilderItem array
        is_public: state.isPublic,
        is_preset: false,
        user_id: user.id,
      };

      let error;
      if (state.mode === "edit" && state.workoutId) {
        // Update existing workout
        const result = await supabase
          .from("workouts")
          .update(workoutData)
          .eq("id", state.workoutId)
          .eq("user_id", user.id); // Ensure user owns the workout
        error = result.error;
      } else {
        // Create new workout
        const result = await supabase.from("workouts").insert(workoutData);
        error = result.error;
      }

      if (error) {
        console.error("Error saving workout:", error);
        alert(`Failed to save workout: ${error.message}`);
        return;
      }

      // Clear unsaved changes flag
      setHasUnsavedChanges(false);

      // Success! Navigate to custom workouts page
      router.push("/workouts/custom");
    } catch (error) {
      console.error("Error saving workout:", error);
      alert("Failed to save workout. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-medium">Loading workout...</div>
        </div>
      </div>
    );
  }

  // Flatten BuilderItems for chart preview
  const chartIntervals = flattenBuilderItems(state.items).map((interval, index) => ({
    name: `Interval ${index + 1}`,
    ...interval,
  }));

  // Calculate metrics from current state
  const durationSeconds = calculateTotalDurationFromItems(state.items);
  const avgIntensityPercent = calculateAverageIntensityFromItems(state.items);

  const avgPowerWatts = avgIntensityPercent > 0
    ? calculateAveragePower(avgIntensityPercent, userFtp)
    : null;

  const workKJ = avgIntensityPercent > 0 && durationSeconds > 0
    ? calculateWork(avgIntensityPercent, durationSeconds, userFtp)
    : null;

  const tss = avgIntensityPercent > 0 && durationSeconds > 0
    ? calculateTSS(avgIntensityPercent, durationSeconds)
    : null;

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">
            {state.mode === "create" && "Create Workout"}
            {state.mode === "edit" && "Edit Workout"}
            {state.mode === "copy" && "Copy Workout"}
          </h1>
          {hasUnsavedChanges && (
            <span className="text-sm text-muted-foreground italic">
              (Unsaved changes)
            </span>
          )}
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Workout"}
        </Button>
      </div>

      {/* Metadata */}
      <div className="mb-6 p-6 border border-border rounded-lg bg-card">
        <WorkoutMetadata
          name={state.name}
          category={state.category}
          description={state.description}
          tags={state.tags}
          isPublic={state.isPublic}
          onNameChange={(value) => dispatch({ type: "SET_METADATA", field: "name", value })}
          onCategoryChange={(value) => dispatch({ type: "SET_METADATA", field: "category", value })}
          onDescriptionChange={(value) =>
            dispatch({ type: "SET_METADATA", field: "description", value })
          }
          onTagsChange={(value) => dispatch({ type: "SET_METADATA", field: "tags", value })}
          onPublicChange={(value) => dispatch({ type: "SET_METADATA", field: "isPublic", value })}
        />
      </div>

      {/* Workout Metrics */}
      {state.items.length > 0 && (
        <div className="mb-6 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-semibold mb-4">Workout Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Duration</div>
              <div className="text-lg font-semibold text-foreground">
                {formatDuration(durationSeconds / 60)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Avg Power</div>
              <div className="text-lg font-semibold text-foreground">
                {avgPowerWatts !== null ? `${avgPowerWatts}W` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Work</div>
              <div className="text-lg font-semibold text-foreground">
                {workKJ !== null ? formatWork(workKJ) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">TSS</div>
              <div className="text-lg font-semibold text-foreground">
                {tss !== null ? tss : "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Preview Chart */}
      <div className="mb-6 p-6 border border-border rounded-lg bg-card">
        <h2 className="text-lg font-semibold mb-4">Preview</h2>
        <div className="h-[300px]">
          {state.items.length > 0 ? (
            <IntensityBarChart intervals={chartIntervals} ftpWatts={userFtp} height={300} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/30 rounded-lg">
              Add intervals to see the workout preview
            </div>
          )}
        </div>
      </div>

      {/* Intervals & Repeat Groups */}
      <div className="p-6 border border-border rounded-lg bg-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Intervals</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => dispatch({ type: "ADD_INTERVAL" })}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Interval
            </Button>
            <Button
              onClick={() => dispatch({ type: "ADD_REPEAT_GROUP" })}
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Repeat Group
            </Button>
          </div>
        </div>

        {state.items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No intervals yet. Click "Add Interval" or "Add Repeat Group" to get started.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={state.items.map((_, index) => `item-${index}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {state.items.map((item, index) => {
                  if (item.type === "interval") {
                    return (
                      <SortableIntervalEditor
                        key={`item-${index}`}
                        interval={item.data}
                        index={index}
                        onUpdate={(i, data) =>
                          dispatch({ type: "UPDATE_INTERVAL", index: i, interval: data })
                        }
                        onDelete={(i) => dispatch({ type: "DELETE_ITEM", index: i })}
                        onDuplicate={(i) => dispatch({ type: "DUPLICATE_ITEM", index: i })}
                      />
                    );
                  } else {
                    return (
                      <SortableRepeatGroupEditor
                        key={`item-${index}`}
                        group={item.data}
                        index={index}
                        onUpdate={(i, data) =>
                          dispatch({ type: "UPDATE_REPEAT_COUNT", groupIndex: i, count: data.count! })
                        }
                        onDelete={(i) => dispatch({ type: "DELETE_ITEM", index: i })}
                        onDuplicate={(i) => dispatch({ type: "DUPLICATE_ITEM", index: i })}
                        onAddInterval={(i) =>
                          dispatch({ type: "ADD_INTERVAL_TO_GROUP", groupIndex: i })
                        }
                        onUpdateInterval={(i, j, data) =>
                          dispatch({
                            type: "UPDATE_INTERVAL_IN_GROUP",
                            groupIndex: i,
                            intervalIndex: j,
                            interval: data,
                          })
                        }
                        onDeleteInterval={(i, j) =>
                          dispatch({
                            type: "DELETE_INTERVAL_FROM_GROUP",
                            groupIndex: i,
                            intervalIndex: j,
                          })
                        }
                        onDuplicateInterval={(i, j) =>
                          dispatch({
                            type: "DUPLICATE_INTERVAL_IN_GROUP",
                            groupIndex: i,
                            intervalIndex: j,
                          })
                        }
                      />
                    );
                  }
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelLeave}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function WorkoutBuilderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <WorkoutBuilderContent />
    </Suspense>
  );
}
