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
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { Workout } from "@/lib/workouts/types";
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
  intervals: BuilderInterval[];
  workoutId?: string;
  mode: "create" | "edit" | "copy";
};

type BuilderAction =
  | { type: "ADD_INTERVAL" }
  | { type: "UPDATE_INTERVAL"; index: number; interval: Partial<BuilderInterval> }
  | { type: "DELETE_INTERVAL"; index: number }
  | { type: "DUPLICATE_INTERVAL"; index: number }
  | { type: "REORDER_INTERVALS"; oldIndex: number; newIndex: number }
  | { type: "SET_METADATA"; field: string; value: any }
  | { type: "LOAD_WORKOUT"; workout: Workout; mode: "edit" | "copy" };

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "ADD_INTERVAL":
      return {
        ...state,
        intervals: [
          ...state.intervals,
          { durationSeconds: 300, intensityPercentStart: 50 },
        ],
      };

    case "UPDATE_INTERVAL":
      return {
        ...state,
        intervals: state.intervals.map((interval, i) =>
          i === action.index ? { ...interval, ...action.interval } : interval
        ),
      };

    case "DELETE_INTERVAL":
      return {
        ...state,
        intervals: state.intervals.filter((_, i) => i !== action.index),
      };

    case "DUPLICATE_INTERVAL":
      const intervalToDuplicate = state.intervals[action.index];
      return {
        ...state,
        intervals: [
          ...state.intervals.slice(0, action.index + 1),
          { ...intervalToDuplicate },
          ...state.intervals.slice(action.index + 1),
        ],
      };

    case "REORDER_INTERVALS":
      return {
        ...state,
        intervals: arrayMove(state.intervals, action.oldIndex, action.newIndex),
      };

    case "SET_METADATA":
      return {
        ...state,
        [action.field]: action.value,
      };

    case "LOAD_WORKOUT":
      return {
        ...state,
        name: action.mode === "copy" ? `${action.workout.name} Copy` : action.workout.name,
        category: action.workout.category,
        description: action.workout.description || "",
        tags: action.workout.tags || [],
        isPublic: false, // Default to private for copies and edits
        intervals: action.workout.intervals.map((interval) => ({
          durationSeconds: interval.durationSeconds,
          intensityPercentStart: interval.intensityPercentStart,
          intensityPercentEnd: interval.intensityPercentEnd,
        })),
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
    id: `interval-${index}`,
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
    intervals: [],
    mode,
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [initialState, setInitialState] = React.useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = React.useState(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<(() => void) | null>(null);

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
                intervals: data.intervals.map((i: any) => ({
                  durationSeconds: i.durationSeconds,
                  intensityPercentStart: i.intensityPercentStart,
                  intensityPercentEnd: i.intensityPercentEnd,
                })),
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
      intervals: state.intervals,
    });
    
    // If we have an initial state, compare with current
    if (initialState) {
      setHasUnsavedChanges(currentState !== initialState);
    } else if (mode === "create") {
      // For create mode, check if anything has been entered
      const hasContent = state.name.trim() !== "" || 
                        state.description.trim() !== "" || 
                        state.intervals.length > 0;
      setHasUnsavedChanges(hasContent);
    }
  }, [state, initialState, mode]);

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

    if (state.intervals.length === 0) {
      alert("Please add at least one interval");
      return;
    }

    // Validate all intervals
    for (let i = 0; i < state.intervals.length; i++) {
      const interval = state.intervals[i];
      if (interval.durationSeconds <= 0) {
        alert(`Interval ${i + 1}: Duration must be greater than 0`);
        return;
      }
      if (
        interval.intensityPercentStart !== undefined &&
        interval.intensityPercentStart < 0
      ) {
        alert(`Interval ${i + 1}: Power must be 0 or greater`);
        return;
      }
      if (
        interval.intensityPercentEnd !== undefined &&
        interval.intensityPercentEnd < 0
      ) {
        alert(`Interval ${i + 1}: End power must be 0 or greater`);
        return;
      }
    }

    setIsSaving(true);

    try {
      // Convert BuilderIntervals to WorkoutIntervals with auto-generated names
      const intervals = state.intervals.map((interval, index) => ({
        name: `Interval ${index + 1}`,
        durationSeconds: interval.durationSeconds,
        intensityPercentStart: interval.intensityPercentStart,
        intensityPercentEnd: interval.intensityPercentEnd,
      }));

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
        intervals,
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

  // Convert intervals to format expected by chart
  const chartIntervals = state.intervals.map((interval, index) => ({
    name: `Interval ${index + 1}`,
    durationSeconds: interval.durationSeconds,
    intensityPercentStart: interval.intensityPercentStart,
    intensityPercentEnd: interval.intensityPercentEnd,
  }));

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

      {/* Live Preview Chart */}
      <div className="mb-6 p-6 border border-border rounded-lg bg-card">
        <h2 className="text-lg font-semibold mb-4">Preview</h2>
        <div className="h-[300px]">
          {state.intervals.length > 0 ? (
            <IntensityBarChart intervals={chartIntervals} ftpWatts={250} height={300} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/30 rounded-lg">
              Add intervals to see the workout preview
            </div>
          )}
        </div>
      </div>

      {/* Intervals */}
      <div className="p-6 border border-border rounded-lg bg-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Intervals</h2>
          <Button
            onClick={() => dispatch({ type: "ADD_INTERVAL" })}
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Interval
          </Button>
        </div>

        {state.intervals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No intervals yet. Click "Add Interval" to get started.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={state.intervals.map((_, index) => `interval-${index}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {state.intervals.map((interval, index) => (
                  <SortableIntervalEditor
                    key={`interval-${index}`}
                    interval={interval}
                    index={index}
                    onUpdate={(i, data) =>
                      dispatch({ type: "UPDATE_INTERVAL", index: i, interval: data })
                    }
                    onDelete={(i) => dispatch({ type: "DELETE_INTERVAL", index: i })}
                    onDuplicate={(i) => dispatch({ type: "DUPLICATE_INTERVAL", index: i })}
                  />
                ))}
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
