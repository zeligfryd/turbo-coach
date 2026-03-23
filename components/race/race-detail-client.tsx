"use client";

import { useState } from "react";
import { RaceHeader } from "./race-header";
import { RaceReadiness } from "./race-readiness";
import { PacingCalculator } from "./pacing-calculator";
import { PeriodisationCta } from "./periodisation-cta";
import { ProfileRaceNote } from "./profile-race-note";
import { RaceCoachPanel } from "./race-coach-panel";
import type { RaceEvent, GpxData, PacingPlan } from "@/lib/race/types";
import { daysUntilRace } from "@/lib/race/readiness";

interface RaceDetailClientProps {
  race: RaceEvent;
  userFtp: number | null;
  userWeight: number | null;
}

export function RaceDetailClient({ race: initialRace, userFtp, userWeight }: RaceDetailClientProps) {
  const [race, setRace] = useState(initialRace);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachSeed, setCoachSeed] = useState<string | null>(null);

  const days = daysUntilRace(race.race_date);

  const openCoach = (seed?: string) => {
    if (seed) setCoachSeed(seed);
    setCoachOpen(true);
  };

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
    <div className="flex h-full min-h-0">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-8">
          <RaceHeader
            race={race}
            daysToRace={days}
            onAskCoach={() => openCoach(`Tell me about my preparation for ${race.name}`)}
          />

          <RaceReadiness
            race={race}
            daysToRace={days}
            onScoreClick={() => openCoach(`Tell me more about my readiness for ${race.name}`)}
            onReadinessUpdated={handleReadinessUpdated}
          />

          <PacingCalculator
            race={race}
            userFtp={userFtp}
            userWeight={userWeight}
            onGpxProcessed={handleGpxProcessed}
            onPacingGenerated={handlePacingGenerated}
            onDiscuss={() => openCoach(`Walk me through this pacing plan for ${race.name}`)}
          />

          <ProfileRaceNote eventType={race.event_type} />

          <PeriodisationCta race={race} />
        </div>
      </div>

      {/* In-page coach chat */}
      <RaceCoachPanel
        open={coachOpen}
        onOpenChange={setCoachOpen}
        race={race}
        daysToRace={days}
        seedMessage={coachSeed}
        onSeedConsumed={() => setCoachSeed(null)}
      />
    </div>
  );
}
