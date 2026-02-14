"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { BleDevice, FtmsCapabilities, IndoorBikeDataRecord } from "@/lib/ble/types";
import { WebBluetoothAdapter } from "@/lib/ble/web-bluetooth-adapter";
import { computeRideMetrics, getRollingAveragePower } from "@/lib/ride/metrics-computer";
import { RideEngine } from "@/lib/ride/ride-engine";
import { SessionRecorder } from "@/lib/ride/session-recorder";
import type { RideMetrics, RideMode, RideSample, RideState } from "@/lib/ride/types";
import { TrainerManager } from "@/lib/ride/trainer-manager";
import type { Workout } from "@/lib/workouts/types";
import { DeviceScanner } from "@/components/ride/device-scanner";
import { MetricsPanel } from "@/components/ride/metrics-panel";
import { ModeSwitcher } from "@/components/ride/mode-switcher";
import { PowerControl } from "@/components/ride/power-control";
import { RideChart } from "@/components/ride/ride-chart";
import { TrainerStatus } from "@/components/ride/trainer-status";
import { WorkoutOverlay } from "@/components/ride/workout-overlay";
import { WorkoutSelector } from "@/components/ride/workout-selector";

type RidePageClientProps = {
  workouts: Workout[];
  userId: string;
  ftpWatts: number;
  initialWorkoutId?: string | null;
};

const ZERO_METRICS: RideMetrics = {
  elapsedSeconds: 0,
  intervalElapsedSeconds: 0,
  avgPowerWatts: 0,
  normalizedPowerWatts: null,
  intensityFactor: null,
  tss: 0,
  avgCadenceRpm: null,
  maxPowerWatts: 0,
  maxCadenceRpm: 0,
  distanceMeters: null,
};

export function RidePageClient({
  workouts,
  userId,
  ftpWatts,
  initialWorkoutId = null,
}: RidePageClientProps) {
  const trainerManagerRef = useRef<TrainerManager | null>(null);
  const rideEngineRef = useRef(new RideEngine());
  const recorderRef = useRef(new SessionRecorder());
  const latestBikeDataRef = useRef<IndoorBikeDataRecord | null>(null);

  const [rideState, setRideState] = useState<RideState>("idle");
  const [rideMode, setRideMode] = useState<RideMode>("free_ride");
  const [chartViewMode, setChartViewMode] = useState<"full" | "zoom">("full");
  const [connectedDevice, setConnectedDevice] = useState<BleDevice | null>(null);
  const [capabilities, setCapabilities] = useState<FtmsCapabilities | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [samples, setSamples] = useState<RideSample[]>([]);
  const [metrics, setMetrics] = useState<RideMetrics>(ZERO_METRICS);
  const [manualTargetPower, setManualTargetPower] = useState(Math.round(ftpWatts * 0.65));
  const [warning, setWarning] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [liveBikeData, setLiveBikeData] = useState<IndoorBikeDataRecord | null>(null);
  const hasAutoLoadedInitialWorkoutRef = useRef(false);

  const workoutState = rideEngineRef.current.getWorkoutEngine().getState();
  const latestRecord = latestBikeDataRef.current;
  const currentPower =
    liveBikeData?.instantaneousPowerWatts ??
    getRollingAveragePower(samples, 3) ??
    latestRecord?.instantaneousPowerWatts ??
    null;
  const currentCadence =
    liveBikeData?.instantaneousCadenceRpm ?? latestRecord?.instantaneousCadenceRpm ?? null;
  const currentSpeed =
    liveBikeData?.instantaneousSpeedKph ?? latestRecord?.instantaneousSpeedKph ?? null;
  const currentTargetPower =
    rideMode === "erg"
      ? workoutState?.position?.targetPowerWatts ?? manualTargetPower
      : null;

  useEffect(() => {
    const manager = new TrainerManager(new WebBluetoothAdapter());
    trainerManagerRef.current = manager;

    const unsubs = [
      manager.on("data", (record) => {
        latestBikeDataRef.current = record;
        setLiveBikeData(record);
      }),
      manager.on("status", (status) => {
        if (status.name === "control_permission_lost") {
          setWarning("Trainer control permission lost. Re-acquiring...");
        }
      }),
      manager.on("warning", (message) => {
        setWarning(message);
      }),
      manager.on("disconnect", () => {
        setConnectedDevice(null);
        setCapabilities(null);
        setWarning("Trainer disconnected.");
        rideEngineRef.current.pauseRide();
        setRideState("paused");
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      void manager.disconnect();
    };
  }, []);

  useEffect(() => {
    if (hasAutoLoadedInitialWorkoutRef.current) {
      return;
    }
    if (!initialWorkoutId) {
      hasAutoLoadedInitialWorkoutRef.current = true;
      return;
    }

    const initialWorkout = workouts.find((workout) => workout.id === initialWorkoutId);
    if (!initialWorkout) {
      hasAutoLoadedInitialWorkoutRef.current = true;
      return;
    }

    handleLoadWorkout(initialWorkout);
    hasAutoLoadedInitialWorkoutRef.current = true;
  }, [initialWorkoutId, workouts]);

  useEffect(() => {
    if (rideState !== "riding") {
      return;
    }

    const timer = window.setInterval(() => {
      const workoutEngine = rideEngineRef.current.getWorkoutEngine();
      const nextTarget = workoutEngine.tick(1000);
      const activeErgTarget =
        rideMode === "erg"
          ? nextTarget ?? workoutEngine.getCurrentPosition()?.targetPowerWatts ?? manualTargetPower
          : null;

      if (rideMode === "erg" && activeErgTarget !== null && trainerManagerRef.current?.isConnected()) {
        void trainerManagerRef.current.setTargetPower(activeErgTarget).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Failed to send ERG target.";
          setWarning(message);
        });
      }

      const record = latestBikeDataRef.current;
      setSamples((previous) => {
        const previousElapsed = previous[previous.length - 1]?.elapsedSeconds ?? 0;
        const elapsedSeconds = previousElapsed + 1;
        const sample: RideSample = {
          timestamp: Date.now(),
          elapsedSeconds,
          mode: rideMode,
          powerWatts: record?.instantaneousPowerWatts ?? null,
          targetPowerWatts:
            rideMode === "erg"
              ? activeErgTarget
              : null,
          cadenceRpm: record?.instantaneousCadenceRpm ?? null,
          speedKph: record?.instantaneousSpeedKph ?? null,
          resistanceLevel: record?.resistanceLevel ?? null,
          distanceMeters: record?.totalDistanceMeters ?? null,
          intervalIndex: workoutEngine.getCurrentPosition()?.intervalIndex ?? null,
        };
        const next = [...previous, sample];
        recorderRef.current.addSample(sample);
        const nextMetrics = computeRideMetrics(next, ftpWatts);
        const intervalElapsed = workoutEngine.getCurrentPosition()?.intervalElapsedSeconds ?? 0;
        setMetrics({ ...nextMetrics, intervalElapsedSeconds: intervalElapsed });
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [rideState, rideMode, manualTargetPower, ftpWatts]);

  async function handleConnectDevice(device: BleDevice): Promise<void> {
    if (!trainerManagerRef.current) return;
    setIsBusy(true);
    setWarning(null);
    try {
      const result = await trainerManagerRef.current.connect(device);
      setConnectedDevice(result.device);
      setCapabilities(result.capabilities);
      rideEngineRef.current.setConnected();
      setRideState("connected");
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Failed to connect trainer.");
    } finally {
      setIsBusy(false);
    }
  }

  function handleLoadWorkout(workout: Workout): void {
    setSelectedWorkout(workout);
    rideEngineRef.current.loadWorkout(workout, ftpWatts);
    setRideMode("erg");
    rideEngineRef.current.switchMode("erg");
  }

  async function handleModeChange(nextMode: RideMode): Promise<void> {
    setRideMode(nextMode);
    rideEngineRef.current.switchMode(nextMode);

    if (
      nextMode === "erg" &&
      trainerManagerRef.current?.isConnected()
    ) {
      const target =
        rideEngineRef.current.getWorkoutEngine().getCurrentPosition()?.targetPowerWatts ??
        manualTargetPower;
      if (target !== null && target !== undefined) {
        try {
          await trainerManagerRef.current.setTargetPower(target);
        } catch (error) {
          setWarning(error instanceof Error ? error.message : "Failed to restore ERG target.");
        }
      }
    }
  }

  async function handleStartRide(): Promise<void> {
    if (!trainerManagerRef.current || !trainerManagerRef.current.isConnected()) {
      setWarning("Connect a trainer first.");
      return;
    }
    setWarning(null);
    recorderRef.current.start();
    setSamples([]);
    setMetrics(ZERO_METRICS);
    rideEngineRef.current.startRide();
    setRideState("riding");
    try {
      await trainerManagerRef.current.startOrResume();
    } catch {
      // Keep session running even when trainer does not support start/resume.
    }
  }

  async function handlePauseRide(): Promise<void> {
    if (!trainerManagerRef.current?.isConnected()) return;
    rideEngineRef.current.pauseRide();
    setRideState("paused");
    try {
      await trainerManagerRef.current.stopOrPause("pause");
    } catch {
      // Keep local pause state even if command is rejected.
    }
  }

  async function persistSession(status: "completed" | "aborted"): Promise<void> {
    const supabase = createClient();
    const dataPoints = recorderRef.current.getSamples();
    const latest = dataPoints[dataPoints.length - 1];

    await supabase.from("ride_sessions").insert({
      user_id: userId,
      workout_id: selectedWorkout?.id ?? null,
      started_at: recorderRef.current.toJSON().startedAt,
      ended_at: new Date().toISOString(),
      duration_seconds: latest?.elapsedSeconds ?? 0,
      workout_completed: !!rideEngineRef.current.getWorkoutEngine().isComplete(),
      status,
      avg_power: metrics.avgPowerWatts,
      normalized_power: metrics.normalizedPowerWatts,
      max_power: metrics.maxPowerWatts,
      avg_cadence: metrics.avgCadenceRpm,
      max_cadence: metrics.maxCadenceRpm,
      intensity_factor: metrics.intensityFactor,
      tss: metrics.tss,
      total_distance: metrics.distanceMeters,
      ftp_at_time: ftpWatts,
      trainer_name: connectedDevice?.name ?? null,
      data_points: dataPoints,
    });
  }

  async function handleStopRide(status: "completed" | "aborted" = "completed"): Promise<void> {
    if (rideState === "idle") return;
    recorderRef.current.stop();
    if (status === "completed") {
      rideEngineRef.current.completeRide();
      setRideState("completed");
    } else {
      rideEngineRef.current.abortRide();
      setRideState("aborted");
    }

    try {
      await trainerManagerRef.current?.stopOrPause("stop");
    } catch {
      // Intentionally ignore command rejection at session end.
    }
    await persistSession(status);
  }

  async function handleManualPower(step: number): Promise<void> {
    const next = Math.max(50, manualTargetPower + step);
    setManualTargetPower(next);
    if (rideMode === "erg" && trainerManagerRef.current?.isConnected()) {
      try {
        await trainerManagerRef.current.setTargetPower(next);
      } catch (error) {
        setWarning(error instanceof Error ? error.message : "Failed to set target power.");
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ride</h1>
          <p className="text-sm text-muted-foreground">
            One ride page for ERG and Free Ride. Switch modes at any time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DeviceScanner
            disabled={isBusy}
            requestDevice={async () => {
              if (!trainerManagerRef.current) {
                throw new Error("Trainer manager not initialized.");
              }
              return trainerManagerRef.current.requestTrainerDevice();
            }}
            onDeviceSelected={handleConnectDevice}
          />
          <WorkoutSelector workouts={workouts} onSelect={handleLoadWorkout} />
          <ModeSwitcher mode={rideMode} onChange={(mode) => void handleModeChange(mode)} />
        </div>
      </div>

      {warning && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {warning}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <MetricsPanel
            currentPower={currentPower}
            cadence={currentCadence}
            speedKph={currentSpeed}
            targetPower={currentTargetPower}
            metrics={metrics}
            mode={rideMode}
          />
          <RideChart
            samples={samples}
            workoutState={workoutState}
            ftpWatts={ftpWatts}
            mode={rideMode}
            chartViewMode={chartViewMode}
            onToggleChartViewMode={() =>
              setChartViewMode((current) => (current === "full" ? "zoom" : "full"))
            }
          />
          <WorkoutOverlay executionState={workoutState} mode={rideMode} />
        </div>

        <div className="space-y-4">
          <TrainerStatus connected={!!connectedDevice} deviceName={connectedDevice?.name} />

          <PowerControl
            mode={rideMode}
            targetPower={manualTargetPower}
            onDecreasePower={() => void handleManualPower(-5)}
            onIncreasePower={() => void handleManualPower(5)}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Session Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                onClick={() => void handleStartRide()}
                disabled={!connectedDevice || rideState === "riding"}
              >
                Start Ride
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => void handlePauseRide()}
                disabled={rideState !== "riding"}
              >
                Pause
              </Button>
              <Button
                className="w-full"
                variant="destructive"
                onClick={() => void handleStopRide("completed")}
                disabled={rideState !== "riding" && rideState !== "paused"}
              >
                Stop & Save
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => void handleStopRide("aborted")}
                disabled={rideState !== "riding" && rideState !== "paused"}
              >
                Abort
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
