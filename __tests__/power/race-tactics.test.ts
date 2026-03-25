import { describe, it, expect } from "vitest";
import { getRaceTacticNote } from "@/lib/power/coggan";
import type { ProfileType } from "@/lib/power/types";

const ALL_PROFILE_TYPES: ProfileType[] = [
  "Sprinter",
  "Anaerobic",
  "Puncheur",
  "Climber",
  "Time Trialist",
  "All-rounder",
];

const KNOWN_EVENT_TYPES = ["crit", "road_race", "time_trial", "gran_fondo", "hill_climb"];

describe("getRaceTacticNote", () => {
  it("returns a non-empty string for all profile types with default event", () => {
    for (const type of ALL_PROFILE_TYPES) {
      const note = getRaceTacticNote(type, "default");
      expect(note.length, `${type} + default should return non-empty`).toBeGreaterThan(0);
    }
  });

  it("returns specific advice for Sprinter + crit", () => {
    const note = getRaceTacticNote("Sprinter", "crit");
    expect(note.toLowerCase()).toContain("sprint");
  });

  it("returns specific advice for Climber + hill_climb", () => {
    const note = getRaceTacticNote("Climber", "hill_climb");
    expect(note.toLowerCase()).toContain("tempo");
  });

  it("returns specific advice for Time Trialist + time_trial", () => {
    const note = getRaceTacticNote("Time Trialist", "time_trial");
    expect(note.toLowerCase()).toContain("steady");
  });

  it("falls back to default for unknown event type", () => {
    const note = getRaceTacticNote("Sprinter", "unknown_event");
    const defaultNote = getRaceTacticNote("Sprinter", "default");
    expect(note).toBe(defaultNote);
  });

  it("falls back to All-rounder for unknown profile type", () => {
    const note = getRaceTacticNote("Unknown" as ProfileType, "crit");
    const arNote = getRaceTacticNote("All-rounder", "crit");
    expect(note).toBe(arNote);
  });

  it("returns different advice for different profile types on the same event", () => {
    const sprinterCrit = getRaceTacticNote("Sprinter", "crit");
    const climberCrit = getRaceTacticNote("Climber", "crit");
    expect(sprinterCrit).not.toBe(climberCrit);
  });

  it("covers all profile × known event combinations without throwing", () => {
    for (const profile of ALL_PROFILE_TYPES) {
      for (const event of KNOWN_EVENT_TYPES) {
        expect(() => getRaceTacticNote(profile, event)).not.toThrow();
      }
    }
  });
});
