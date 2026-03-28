"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type PacingSegmentContext = {
  label: string;
  startKm: number;
  endKm: number;
  targetPowerW: number;
  targetPowerPercent: number;
  estimatedTimeMin: number;
  advice: string;
  targetHrZone: string | null;
  targetHrBpm: string | null;
};

export type RouteSegmentContext = {
  label: string;
  startKm: number;
  endKm: number;
  distanceKm: number;
  elevationGainM: number;
  avgGradientPercent: number;
  type: "climb" | "descent" | "flat";
};

export type RaceContextData = {
  id: string;
  name: string;
  race_date: string;
  event_type: string;
  distance_km: number | null;
  elevation_m: number | null;
  readiness_score?: number | null;
  route_segments?: RouteSegmentContext[] | null;
  pacing_plan?: {
    overallTargetNpW: number;
    estimatedFinishTimeMin: number;
    strategy: string;
    segments: PacingSegmentContext[];
  } | null;
};

type CoachRaceContextValue = {
  raceContext: RaceContextData | null;
  setRaceContext: (data: RaceContextData | null) => void;
  openCoach: () => void;
  registerOpenCoach: (fn: () => void) => void;
};

const CoachRaceContext = createContext<CoachRaceContextValue>({
  raceContext: null,
  setRaceContext: () => {},
  openCoach: () => {},
  registerOpenCoach: () => {},
});

export function CoachRaceProvider({ children }: { children: ReactNode }) {
  const [raceContext, setRaceContext] = useState<RaceContextData | null>(null);
  const openCoachRef = useRef<() => void>(() => {});

  const openCoach = useCallback(() => openCoachRef.current(), []);
  const registerOpenCoach = useCallback((fn: () => void) => {
    openCoachRef.current = fn;
  }, []);

  const value = useMemo(
    () => ({ raceContext, setRaceContext, openCoach, registerOpenCoach }),
    [raceContext, openCoach, registerOpenCoach]
  );

  return <CoachRaceContext.Provider value={value}>{children}</CoachRaceContext.Provider>;
}

export function useCoachRaceContext() {
  return useContext(CoachRaceContext);
}
