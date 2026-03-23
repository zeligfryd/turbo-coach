"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Calendar, MapPin, Mountain, Trash2, MessageCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EVENT_TYPE_LABELS } from "@/lib/race/types";
import type { RaceEvent, EventType } from "@/lib/race/types";
import { deleteRaceEvent } from "@/app/race/actions";

interface RaceHeaderProps {
  race: RaceEvent;
  daysToRace: number;
  onAskCoach: () => void;
}

export function RaceHeader({ race, daysToRace, onAskCoach }: RaceHeaderProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const raceDate = new Date(race.race_date + "T00:00:00");
  const formattedDate = raceDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleDelete = async () => {
    if (!confirm(`Delete "${race.name}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    const result = await deleteRaceEvent(race.id);
    if (result.success) {
      router.push("/calendar");
    } else {
      setIsDeleting(false);
      alert(result.error ?? "Failed to delete");
    }
  };

  const countdownLabel =
    daysToRace === 0
      ? "Race day!"
      : daysToRace === 1
        ? "Tomorrow"
        : `${daysToRace} days`;

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push("/calendar")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Calendar
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Flag className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{race.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formattedDate}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                {EVENT_TYPE_LABELS[race.event_type as EventType] ?? race.event_type}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onAskCoach}>
            <MessageCircle className="h-4 w-4" />
            Ask Coach
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Countdown + metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-center">
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">{countdownLabel}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {daysToRace === 0 ? "Good luck!" : "to race"}
          </div>
        </div>
        <div className="rounded-lg bg-card border p-4 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-xs">Distance</span>
          </div>
          <div className="text-xl font-semibold">
            {race.distance_km != null ? `${race.distance_km} km` : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-card border p-4 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Mountain className="h-3.5 w-3.5" />
            <span className="text-xs">Elevation</span>
          </div>
          <div className="text-xl font-semibold">
            {race.elevation_m != null ? `${race.elevation_m} m` : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-card border p-4 text-center">
          <div className="text-xs text-muted-foreground mb-1">Event Type</div>
          <div className="text-xl font-semibold">
            {EVENT_TYPE_LABELS[race.event_type as EventType] ?? race.event_type}
          </div>
        </div>
      </div>
    </div>
  );
}
