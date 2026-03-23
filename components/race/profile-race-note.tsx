"use client";

import { useState, useEffect } from "react";
import { User } from "lucide-react";
import type { PowerProfile } from "@/lib/power/types";
import { getRaceTacticNote } from "@/lib/power/coggan";

interface ProfileRaceNoteProps {
  eventType: string;
}

export function ProfileRaceNote({ eventType }: ProfileRaceNoteProps) {
  const [note, setNote] = useState<string | null>(null);
  const [profileType, setProfileType] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/power-curve");
        if (!res.ok) return;
        const data = await res.json();
        const profile = data.profile as PowerProfile | null;
        if (cancelled || !profile) return;
        const tactic = getRaceTacticNote(profile.type, eventType);
        if (tactic) {
          setNote(tactic);
          setProfileType(profile.type);
        }
      } catch {
        // Silently fail — this is an enhancement
      }
    }
    load();
    return () => { cancelled = true; };
  }, [eventType]);

  if (!note || !profileType) return null;

  return (
    <div className="rounded-xl border bg-card px-5 py-4 flex items-start gap-3">
      <User className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div className="text-sm">
        <span className="font-medium">As a {profileType.toLowerCase()}:</span>{" "}
        <span className="text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}
