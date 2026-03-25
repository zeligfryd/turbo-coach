import { describe, it, expect } from "vitest";
import { buildPacingPrompt, resolveFtp } from "@/lib/pacing/prompt";
import type { PacingPromptParams } from "@/lib/pacing/prompt";
import { FLAT_TT, HILLY_ROAD_RACE } from "../fixtures/courses";
import type { PowerProfile } from "@/lib/power/types";

const MOCK_PROFILE: PowerProfile = {
  type: "Climber",
  scores: { "5s": 2, "1min": 3, "5min": 5, "20min": 5 },
  scores42d: { "5s": 2, "1min": 3, "5min": 4, "20min": 4 },
  weakness: "5s",
  description: "Strong sustained power",
  estimatedFtp: 270,
  allTimePeaks: { "5s": 700, "1min": 350, "5min": 320, "20min": 285 },
  peakWkg: { "5s": 11.3, "1min": 5.6, "5min": 5.2, "20min": 4.6 },
};

function makeParams(overrides: Partial<PacingPromptParams> = {}): PacingPromptParams {
  return {
    ftp: 280,
    manualFtp: 280,
    estimatedFtp: null,
    weight: 75,
    wkg: 3.73,
    recentContext: "NP 250W, Avg 230W, 90min",
    powerProfile: null,
    raceName: "Test Race",
    eventType: "road_race",
    gpxData: FLAT_TT,
    ...overrides,
  };
}

describe("resolveFtp", () => {
  it("returns manual FTP when both present", () => {
    expect(resolveFtp(300, 270)).toBe(300);
  });

  it("returns estimated FTP when manual is null", () => {
    expect(resolveFtp(null, 270)).toBe(270);
  });

  it("returns null when both are null", () => {
    expect(resolveFtp(null, null)).toBeNull();
  });

  it("returns manual FTP even if 0", () => {
    expect(resolveFtp(0, 270)).toBe(0);
  });
});

describe("buildPacingPrompt", () => {
  describe("required sections", () => {
    it("contains FTP value", () => {
      const prompt = buildPacingPrompt(makeParams());
      expect(prompt).toContain("FTP: 280W");
    });

    it("contains weight", () => {
      const prompt = buildPacingPrompt(makeParams());
      expect(prompt).toContain("Weight: 75 kg");
    });

    it("contains route segments section", () => {
      const prompt = buildPacingPrompt(makeParams());
      expect(prompt).toContain("Route segments:");
    });

    it("contains pacing target generation rules", () => {
      const prompt = buildPacingPrompt(makeParams());
      expect(prompt).toContain("PACING TARGET GENERATION RULES");
    });

    it("contains race name and event type", () => {
      const prompt = buildPacingPrompt(makeParams());
      expect(prompt).toContain("Test Race (road_race)");
    });

    it("contains recent rides context", () => {
      const prompt = buildPacingPrompt(makeParams());
      expect(prompt).toContain("NP 250W, Avg 230W, 90min");
    });
  });

  describe("FTP labelling", () => {
    it("manual FTP shows no estimated label", () => {
      const prompt = buildPacingPrompt(makeParams({ manualFtp: 280 }));
      expect(prompt).toContain("FTP: 280W");
      expect(prompt).not.toContain("(estimated)");
    });

    it("estimated FTP shows estimated label", () => {
      const prompt = buildPacingPrompt(
        makeParams({ ftp: 265, manualFtp: null, estimatedFtp: 265 })
      );
      expect(prompt).toContain("FTP: 265W (estimated)");
    });
  });

  describe("power profile integration", () => {
    it("includes profile type and scores when profile present", () => {
      const prompt = buildPacingPrompt(makeParams({ powerProfile: MOCK_PROFILE }));
      expect(prompt).toContain("Type: Climber");
      expect(prompt).toContain("5s=2");
      expect(prompt).toContain("20min=5");
    });

    it("includes weakness field", () => {
      const prompt = buildPacingPrompt(makeParams({ powerProfile: MOCK_PROFILE }));
      expect(prompt).toContain("Weakness: 5s");
    });

    it("includes profile-type modifier rules", () => {
      const prompt = buildPacingPrompt(makeParams({ powerProfile: MOCK_PROFILE }));
      expect(prompt).toContain("Profile-type modifiers");
      expect(prompt).toContain("The athlete is a Climber");
    });

    it("includes peak W/kg data", () => {
      const prompt = buildPacingPrompt(makeParams({ powerProfile: MOCK_PROFILE }));
      expect(prompt).toContain("Peak W/kg:");
      expect(prompt).toContain("W/kg");
    });

    it("includes peak watts data", () => {
      const prompt = buildPacingPrompt(makeParams({ powerProfile: MOCK_PROFILE }));
      expect(prompt).toContain("Peak watts:");
    });

    it("omits profile section when no profile", () => {
      const prompt = buildPacingPrompt(makeParams({ powerProfile: null }));
      expect(prompt).not.toContain("Profile-type modifiers");
      expect(prompt).not.toContain("weakness");
    });

    it("includes estimated FTP note when using estimated", () => {
      const prompt = buildPacingPrompt(
        makeParams({
          ftp: 270,
          manualFtp: null,
          estimatedFtp: 270,
          powerProfile: MOCK_PROFILE,
        })
      );
      expect(prompt).toContain("FTP is estimated");
    });
  });

  describe("weight advisory in prompt", () => {
    it("includes STRONG advisory for heavy rider on mountain course", () => {
      const prompt = buildPacingPrompt(
        makeParams({ weight: 90, gpxData: HILLY_ROAD_RACE })
      );
      expect(prompt).toContain("WEIGHT ADVISORY (STRONG)");
    });

    it("no weight advisory for light rider on flat course", () => {
      const prompt = buildPacingPrompt(makeParams({ weight: 65, gpxData: FLAT_TT }));
      expect(prompt).not.toContain("WEIGHT");
    });
  });

  describe("all GPX segments appear", () => {
    it("includes all segment labels from the course", () => {
      const prompt = buildPacingPrompt(makeParams({ gpxData: HILLY_ROAD_RACE }));
      for (const seg of HILLY_ROAD_RACE.segments) {
        expect(prompt).toContain(seg.label);
      }
    });
  });

  describe("unknown weight", () => {
    it("shows 'unknown' when weight is null", () => {
      const prompt = buildPacingPrompt(makeParams({ weight: null, wkg: null }));
      expect(prompt).toContain("Weight: unknown");
    });
  });
});
