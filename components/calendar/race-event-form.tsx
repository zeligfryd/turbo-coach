"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/race/types";
import type { EventType } from "@/lib/race/types";
import { createRaceEvent } from "@/app/race/actions";

interface RaceEventFormModalProps {
  open: boolean;
  defaultDate: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function RaceEventFormModal({ open, defaultDate, onClose, onCreated }: RaceEventFormModalProps) {
  const [name, setName] = useState("");
  const [raceDate, setRaceDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [eventType, setEventType] = useState<EventType>("road_race");
  const [distanceKm, setDistanceKm] = useState("");
  const [elevationM, setElevationM] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Reset form when defaultDate changes
  if (defaultDate && raceDate !== defaultDate) {
    setRaceDate(defaultDate);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Race name is required");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const result = await createRaceEvent({
      name: name.trim(),
      race_date: raceDate,
      event_type: eventType,
      distance_km: distanceKm ? parseFloat(distanceKm) : null,
      elevation_m: elevationM ? parseFloat(elevationM) : null,
    });

    setIsSubmitting(false);

    if (result.success) {
      setName("");
      setDistanceKm("");
      setElevationM("");
      onCreated(result.id);
    } else {
      setError(result.error ?? "Failed to create race event");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Race Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Race Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Criterium"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Date</label>
              <input
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Distance (km)</label>
              <input
                type="number"
                step="0.1"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Elevation (m)</label>
              <input
                type="number"
                step="1"
                value={elevationM}
                onChange={(e) => setElevationM(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Race"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
