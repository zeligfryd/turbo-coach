"use client";

import { useEffect, useRef } from "react";
import { X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoachChatController, CoachChatPanel } from "@/components/coach/coach-chat-panel";
import type { RaceEvent } from "@/lib/race/types";
import { EVENT_TYPE_LABELS } from "@/lib/race/types";
import type { EventType } from "@/lib/race/types";

interface RaceCoachPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  race: RaceEvent;
  daysToRace: number;
  seedMessage: string | null;
  onSeedConsumed: () => void;
}

function buildRaceContextPrefix(race: RaceEvent, daysToRace: number): string {
  const parts = [
    `[Race context: ${race.name}`,
    `${EVENT_TYPE_LABELS[race.event_type as EventType] ?? race.event_type}`,
    `${race.race_date} (${daysToRace} days away)`,
  ];
  if (race.distance_km != null) parts.push(`${race.distance_km}km`);
  if (race.elevation_m != null) parts.push(`${race.elevation_m}m elevation`);
  if (race.readiness_score != null) parts.push(`readiness ${race.readiness_score}/100`);
  if (race.pacing_plan) {
    parts.push(`target NP ${race.pacing_plan.overallTargetNpW}W`);
    parts.push(`est. ${Math.round(race.pacing_plan.estimatedFinishTimeMin)}min`);
  }
  return parts.join(" · ") + "]\n\n";
}

export function RaceCoachPanel({
  open,
  onOpenChange,
  race,
  daysToRace,
  seedMessage,
  onSeedConsumed,
}: RaceCoachPanelProps) {
  const controller = useCoachChatController();
  const hasSentSeed = useRef(false);
  const lastSeedRef = useRef<string | null>(null);

  // When a seed message is provided and panel opens, send it via sendSuggestion
  useEffect(() => {
    if (!seedMessage || !open) return;
    if (controller.status !== "ready") return;
    if (hasSentSeed.current && lastSeedRef.current === seedMessage) return;

    const prefix = buildRaceContextPrefix(race, daysToRace);
    controller.sendSuggestion(prefix + seedMessage);
    hasSentSeed.current = true;
    lastSeedRef.current = seedMessage;
    onSeedConsumed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedMessage, open, controller.status]);

  // Reset seed tracking when panel closes
  useEffect(() => {
    if (!open) {
      hasSentSeed.current = false;
      lastSeedRef.current = null;
    }
  }, [open]);

  // Wrap onSubmit to inject race context into manual messages
  const wrappedController = {
    ...controller,
    onSubmit: async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = controller.input.trim();
      if (!text) return;

      const prefix = buildRaceContextPrefix(race, daysToRace);
      controller.setInput("");
      await controller.sendSuggestion(prefix + text);
    },
  };

  if (!open) {
    return null;
  }

  return (
    <>
      {/* Desktop: right sidebar */}
      <div className="hidden md:flex w-[400px] border-l flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Coach — {race.name}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <CoachChatPanel controller={wrappedController} showSettingsTrigger={false} />
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Coach — {race.name}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <CoachChatPanel controller={wrappedController} showSettingsTrigger={false} />
        </div>
      </div>
    </>
  );
}
