"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { WorkoutProtocol, UserParameters } from "@/lib/workouts/protocols";
import {
  getParameterDefaults,
  validateUserParameters,
  calculateProtocolDuration,
  formatDuration,
  getIntensityLabel,
} from "@/lib/workouts/protocols";
import { CATEGORY_LABELS } from "@/lib/workouts/types";

interface ProtocolParameterFormProps {
  protocol: WorkoutProtocol;
  onGenerate: (protocol: WorkoutProtocol, params: UserParameters) => void;
  onBack: () => void;
}

export function ProtocolParameterForm({
  protocol,
  onGenerate,
  onBack,
}: ProtocolParameterFormProps) {
  const [params, setParams] = useState<UserParameters>(() =>
    getParameterDefaults(protocol)
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [estimatedDuration, setEstimatedDuration] = useState<number>(0);

  // Calculate estimated duration whenever params change
  useEffect(() => {
    try {
      const duration = calculateProtocolDuration(protocol, params);
      setEstimatedDuration(Math.ceil(duration / 60)); // Convert to minutes
      setErrors([]);
    } catch (error) {
      console.error("Error calculating duration:", error);
      setEstimatedDuration(0);
    }
  }, [params, protocol]);

  const handleParamChange = (paramId: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setParams((prev) => ({ ...prev, [paramId]: numValue }));
    }
  };

  const handleGenerate = () => {
    const validation = validateUserParameters(protocol, params);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    onGenerate(protocol, params);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{protocol.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">
                  {CATEGORY_LABELS[protocol.category]}
                </Badge>
                {protocol.intensity_level && (
                  <Badge variant="secondary">
                    {getIntensityLabel(protocol.intensity_level)}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {protocol.description && (
            <p className="text-muted-foreground">{protocol.description}</p>
          )}
        </div>

        {/* Parameters Form */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {/* Parameter inputs */}
            {protocol.parameters.length > 0 ? (
              <div className="space-y-4">
                <h3 className="font-semibold">Customize Parameters</h3>
                {protocol.parameters.map((param) => (
                  <div key={param.id} className="space-y-2">
                    <Label htmlFor={param.id}>{param.label}</Label>
                    <Input
                      id={param.id}
                      type="number"
                      value={params[param.id] || param.default}
                      onChange={(e) => handleParamChange(param.id, e.target.value)}
                      min={param.min}
                      max={param.max}
                      step={param.step || 1}
                    />
                    {(param.min !== undefined || param.max !== undefined) && (
                      <p className="text-xs text-muted-foreground">
                        Range: {param.min ?? "no min"} - {param.max ?? "no max"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                <Info className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  This protocol has no customizable parameters. Click generate to use the default structure.
                </p>
              </div>
            )}

            {/* Preview */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
              <h3 className="font-semibold">Preview</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Duration:</span>
                  <span className="font-medium">{formatDuration(estimatedDuration)}</span>
                </div>
                <WorkoutStructurePreview protocol={protocol} params={params} />
              </div>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="font-semibold text-destructive mb-2">Validation Errors:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-destructive">
                  {errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-between">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleGenerate}>Generate Workout</Button>
        </div>
      </div>
    </div>
  );
}

interface WorkoutStructurePreviewProps {
  protocol: WorkoutProtocol;
  params: UserParameters;
}

function WorkoutStructurePreview({ protocol, params }: WorkoutStructurePreviewProps) {
  const structure = protocol.structure;

  const replaceVars = (value: string | number): string => {
    if (typeof value === "number") return value.toString();
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return params[key]?.toString() || "?";
    });
  };

  const formatSeconds = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <div className="space-y-1 text-sm">
      {structure.warmup && (
        <div className="text-muted-foreground">
          • Warmup: {formatSeconds(structure.warmup.duration_seconds)} ({structure.warmup.start}% → {structure.warmup.end}%)
        </div>
      )}

      {structure.main_work.type === "repeating_intervals" && (
        <div className="text-muted-foreground">
          • Main: {replaceVars(structure.main_work.sets)} sets × {replaceVars(structure.main_work.reps_per_set)} reps of interval pattern
        </div>
      )}

      {structure.main_work.type === "repeating_steady" && (
        <div className="text-muted-foreground">
          • Main: {replaceVars(structure.main_work.count)} intervals @ {structure.main_work.work.intensity_percent}%
        </div>
      )}

      {structure.main_work.type === "steady_block" && (
        <div className="text-muted-foreground">
          • Main: Steady effort @ {structure.main_work.intensity_percent}%
        </div>
      )}

      {structure.main_work.type === "over_under" && (
        <div className="text-muted-foreground">
          • Main: {replaceVars(structure.main_work.sets)} sets × {replaceVars(structure.main_work.reps_per_set)} over-under cycles
        </div>
      )}

      {structure.main_work.type === "pyramid" && (
        <div className="text-muted-foreground">
          • Main: {replaceVars(structure.main_work.sets)} pyramid set(s) with {structure.main_work.steps.length} steps
        </div>
      )}

      {structure.main_work.type === "sprint_intervals" && (
        <div className="text-muted-foreground">
          • Main: {replaceVars(structure.main_work.sets)} sets × {replaceVars(structure.main_work.reps_per_set)} sprints
        </div>
      )}

      {structure.cooldown && (
        <div className="text-muted-foreground">
          • Cooldown: {formatSeconds(structure.cooldown.duration_seconds)} ({structure.cooldown.start}% → {structure.cooldown.end}%)
        </div>
      )}
    </div>
  );
}
