"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Upload, Loader2, MessageCircle, Zap, Clock, TrendingUp, HelpCircle, AlertTriangle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RaceEvent, GpxData, PacingPlan, AmbitionLevel } from "@/lib/race/types";
import { AMBITION_LEVELS, AMBITION_LABELS } from "@/lib/race/types";
import { scalePlan } from "@/lib/pacing/scale";

const ElevationProfileChart = dynamic(
  () => import("./elevation-profile-chart").then((mod) => ({ default: mod.ElevationProfileChart })),
  { ssr: false, loading: () => <div className="h-[200px] flex items-center justify-center text-muted-foreground">Loading chart...</div> }
);

interface PacingCalculatorProps {
  race: RaceEvent;
  userFtp: number | null;
  userWeight: number | null;
  onGpxProcessed: (gpxData: GpxData, distanceKm: number, elevationM: number) => void;
  onPacingGenerated: (plan: PacingPlan) => void;
  onDiscuss: () => void;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

const AMBITION_WARNINGS: Partial<Record<AmbitionLevel, string>> = {
  aggressive:
    "At this target, you're betting on a good day. A 5% fade in the final hour would cost you more time than the aggressive start saves.",
  all_out:
    "All-out targets assume peak conditions and perfect execution. If it goes wrong, it goes very wrong.",
};

export function PacingCalculator({
  race,
  userFtp,
  userWeight,
  onGpxProcessed,
  onPacingGenerated,
  onDiscuss,
}: PacingCalculatorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingGpx, setIsUploadingGpx] = useState(false);
  const [isGeneratingPacing, setIsGeneratingPacing] = useState(false);
  const [gpxError, setGpxError] = useState("");
  const [pacingError, setPacingError] = useState("");
  const [ambition, setAmbition] = useState<AmbitionLevel>("realistic");

  const gpxData = race.gpx_data;
  const basePlan = race.pacing_plan;
  const pacingPlan = basePlan ? scalePlan(basePlan, ambition, userFtp ?? undefined) : null;

  const handleGpxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingGpx(true);
    setGpxError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("raceId", race.id);

      const res = await fetch("/api/race/gpx", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setGpxError(data.error ?? "Failed to process GPX");
        return;
      }

      onGpxProcessed(data.gpxData, data.distance_km, data.elevation_m);
    } catch {
      setGpxError("Failed to upload GPX file");
    } finally {
      setIsUploadingGpx(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGeneratePacing = async () => {
    if (!userFtp) {
      setPacingError("Set your FTP in your profile first.");
      return;
    }

    setIsGeneratingPacing(true);
    setPacingError("");

    try {
      const res = await fetch("/api/race/pacing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId: race.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPacingError(data.error ?? "Failed to generate pacing plan");
        return;
      }

      onPacingGenerated(data as PacingPlan);
    } catch {
      setPacingError("Failed to generate pacing plan");
    } finally {
      setIsGeneratingPacing(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 space-y-6">
      <h2 className="text-lg font-semibold">Event Pacing</h2>

      {/* GPX Upload */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Route Profile</h3>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx"
              className="hidden"
              onChange={handleGpxUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingGpx}
            >
              {isUploadingGpx ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing your route...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {gpxData ? "Replace GPX" : "Upload GPX"}
                </>
              )}
            </Button>
          </div>
        </div>

        {gpxError && <p className="text-sm text-destructive">{gpxError}</p>}

        {gpxData ? (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-4">
              <ElevationProfileChart gpxData={gpxData} height={220} />
            </div>

            {/* Segment summary */}
            {gpxData.segments.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Detected Segments</h4>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {gpxData.segments.map((seg, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
                        seg.type === "climb"
                          ? "bg-red-500/5"
                          : seg.type === "descent"
                            ? "bg-blue-500/5"
                            : "bg-muted/30"
                      }`}
                    >
                      <span className="font-medium">{seg.label}</span>
                      <span className="text-muted-foreground">{seg.distanceKm}km</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Upload a GPX file to see the elevation profile and get pacing targets</p>
          </div>
        )}
      </div>

      {/* Pacing Targets */}
      {gpxData && (
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Pacing Targets</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGeneratePacing}
              disabled={isGeneratingPacing || !userFtp}
            >
              {isGeneratingPacing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Computing targets...
                </>
              ) : pacingPlan ? (
                "Regenerate"
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Generate Pacing Plan
                </>
              )}
            </Button>
          </div>

          {pacingError && <p className="text-sm text-destructive">{pacingError}</p>}
          {!userFtp && (
            <p className="text-sm text-muted-foreground">Set your FTP in your profile to generate pacing targets.</p>
          )}

          {pacingPlan && (
            <div className="space-y-4">
              {/* Ambition slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ambition</h4>
                  <span className="text-xs font-medium">{AMBITION_LABELS[ambition]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={AMBITION_LEVELS.indexOf(ambition)}
                  onChange={(e) => setAmbition(AMBITION_LEVELS[Number(e.target.value)])}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  {AMBITION_LEVELS.map((level) => (
                    <span key={level}>{AMBITION_LABELS[level]}</span>
                  ))}
                </div>
                {AMBITION_WARNINGS[ambition] && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{AMBITION_WARNINGS[ambition]}</span>
                  </div>
                )}
              </div>

              {/* Overall targets */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <Zap className="h-4 w-4 mx-auto text-primary mb-1" />
                  <div className="text-lg font-bold">{pacingPlan.overallTargetNpW}W</div>
                  <div className="text-xs text-muted-foreground">Target NP</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto text-primary mb-1" />
                  <div className="text-lg font-bold">{formatTime(pacingPlan.estimatedFinishTimeMin)}</div>
                  <div className="text-xs text-muted-foreground">Est. Finish</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center relative group/if">
                  <TrendingUp className="h-4 w-4 mx-auto text-primary mb-1" />
                  <div className="text-lg font-bold">{Math.round((pacingPlan.overallTargetNpW / userFtp!) * 100)}%</div>
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
                    IF Target
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-md bg-popover border shadow-md px-3 py-2 text-xs text-left text-popover-foreground opacity-0 pointer-events-none group-hover/if:opacity-100 group-hover/if:pointer-events-auto transition-opacity z-10">
                    <span className="font-semibold">Intensity Factor</span> — ratio of target normalised power to your FTP. An IF of 100% means riding at threshold; above 100% means you&apos;re above FTP.
                  </div>
                </div>
              </div>

              {/* Strategy */}
              <div className="text-sm text-foreground bg-muted/30 rounded-lg p-3">
                {pacingPlan.strategy}
              </div>

              {/* Per-segment targets */}
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Segment Targets</h4>
                <div className="space-y-2">
                  {pacingPlan.segments.map((seg, i) => (
                    <div key={i} className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{seg.label}</span>
                        <div className="flex items-center gap-2">
                          {seg.targetHrZone && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-500">
                              <Heart className="h-3 w-3" />
                              {seg.targetHrZone}{seg.targetHrBpm ? ` (${seg.targetHrBpm})` : ""}
                            </span>
                          )}
                          <span className="text-sm font-bold text-primary">{seg.targetPowerW}W ({seg.targetPowerPercent}%)</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Est. {formatTime(seg.estimatedTimeMin)} · km {seg.startKm}–{seg.endKm}
                      </div>
                      {seg.advice && (
                        <p className="text-xs text-foreground mt-1">{seg.advice}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Discuss button */}
              <Button variant="outline" size="sm" onClick={onDiscuss}>
                <MessageCircle className="h-4 w-4" />
                Discuss this pacing plan
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
