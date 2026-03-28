"use client";

import { useEffect, useState } from "react";
import { RaceHeader } from "./race-header";
import { RaceReadiness } from "./race-readiness";
import { PacingCalculator } from "./pacing-calculator";
import { PeriodisationCta } from "./periodisation-cta";
import { ProfileRaceNote } from "./profile-race-note";
import { useCoachRaceContext } from "@/components/coach/coach-race-context";
import type { RaceEvent, GpxData, PacingPlan } from "@/lib/race/types";
import { daysUntilRace } from "@/lib/race/readiness";

interface RaceDetailClientProps {
  race: RaceEvent;
  userFtp: number | null;
  userWeight: number | null;
}

export function RaceDetailClient({ race: initialRace, userFtp, userWeight }: RaceDetailClientProps) {
  const [race, setRace] = useState(initialRace);
  const { setRaceContext, openCoach } = useCoachRaceContext();

  const days = daysUntilRace(race.race_date);

  // Sync race context into the coach whenever race state changes.
  // Cleared on unmount — the coach uses getRaceEvents to re-fetch if needed
  // when continuing the conversation from outside the race page.
  useEffect(() => {
    setRaceContext({
      id: race.id,
      name: race.name,
      race_date: race.race_date,
      event_type: race.event_type,
      distance_km: race.distance_km ?? null,
      elevation_m: race.elevation_m ?? null,
      readiness_score: race.readiness_score ?? null,
      route_segments: race.gpx_data?.segments ?? null,
      pacing_plan: race.pacing_plan ?? null,
    });

    return () => setRaceContext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race]);

  const handleGpxProcessed = (gpxData: GpxData, distanceKm: number, elevationM: number) => {
    setRace((prev) => ({
      ...prev,
      gpx_data: gpxData,
      distance_km: distanceKm,
      elevation_m: elevationM,
    }));
  };

  const handleReadinessUpdated = (score: number, interpretation: string) => {
    setRace((prev) => ({
      ...prev,
      readiness_score: score,
      readiness_interpretation: interpretation,
    }));
  };

  const handlePacingGenerated = (plan: PacingPlan) => {
    setRace((prev) => ({ ...prev, pacing_plan: plan }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <RaceHeader
        race={race}
        daysToRace={days}
        onAskCoach={openCoach}
      />

      <RaceReadiness
        race={race}
        daysToRace={days}
        onScoreClick={openCoach}
        onReadinessUpdated={handleReadinessUpdated}
      />

      <PacingCalculator
        race={race}
        userFtp={userFtp}
        userWeight={userWeight}
        onGpxProcessed={handleGpxProcessed}
        onPacingGenerated={handlePacingGenerated}
        onDiscuss={openCoach}
      />

      <ProfileRaceNote eventType={race.event_type} />

      <PeriodisationCta race={race} />
    </div>
  );
}
