"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { RaceEvent } from "@/lib/race/types";

interface RaceReadinessProps {
  race: RaceEvent;
  daysToRace: number;
  onScoreClick: () => void;
  onReadinessUpdated: (score: number, interpretation: string) => void;
}

function getScoreColor(score: number): string {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 25) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreRingColor(score: number): string {
  if (score >= 75) return "stroke-green-500";
  if (score >= 50) return "stroke-yellow-500";
  if (score >= 25) return "stroke-orange-500";
  return "stroke-red-500";
}

function ScoreCircle({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="relative w-28 h-28">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          className={getScoreRingColor(score)}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</span>
      </div>
    </div>
  );
}

export function RaceReadiness({ race, daysToRace, onScoreClick, onReadinessUpdated }: RaceReadinessProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [score, setScore] = useState<number | null>(race.readiness_score);
  const [interpretation, setInterpretation] = useState<string | null>(race.readiness_interpretation);

  // Auto-fetch readiness on mount if not cached
  useEffect(() => {
    if (score != null && interpretation) return;
    let cancelled = false;

    setIsLoading(true);
    fetch("/api/race/readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId: race.id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.score != null) {
          setScore(data.score);
          setInterpretation(data.interpretation ?? null);
          onReadinessUpdated(data.score, data.interpretation ?? "");
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race.id]);

  return (
    <div
      className="rounded-xl border bg-card p-6 cursor-pointer hover:ring-1 hover:ring-primary/30 transition-shadow"
      onClick={onScoreClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onScoreClick()}
    >
      <h2 className="text-lg font-semibold mb-4">Race Readiness</h2>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Analysing your readiness...</span>
        </div>
      ) : score != null ? (
        <div className="flex items-center gap-6">
          <ScoreCircle score={score} />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground mb-1">
              {daysToRace === 0
                ? "Race day readiness"
                : `Readiness with ${daysToRace} days to go`}
            </div>
            {interpretation && (
              <p className="text-sm text-foreground leading-relaxed">{interpretation}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">Click to discuss with your coach</p>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          No wellness data available. Sync your Intervals.icu data to see your readiness score.
        </div>
      )}
    </div>
  );
}
