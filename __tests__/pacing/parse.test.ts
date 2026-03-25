import { describe, it, expect } from "vitest";
import { parsePacingResponse } from "@/lib/pacing/parse";

const VALID_JSON = JSON.stringify({
  overallTargetNpW: 250,
  estimatedFinishTimeMin: 180,
  strategy: "Pace conservatively on the climbs.",
  segments: [
    {
      label: "Flat 1",
      startKm: 0,
      endKm: 20,
      targetPowerW: 240,
      targetPowerPercent: 85,
      estimatedTimeMin: 35,
      advice: "Settle into tempo.",
    },
  ],
});

describe("parsePacingResponse", () => {
  it("parses valid JSON correctly", () => {
    const plan = parsePacingResponse(VALID_JSON);
    expect(plan.overallTargetNpW).toBe(250);
    expect(plan.estimatedFinishTimeMin).toBe(180);
    expect(plan.strategy).toBe("Pace conservatively on the climbs.");
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].label).toBe("Flat 1");
    expect(plan.segments[0].targetPowerW).toBe(240);
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const wrapped = "```json\n" + VALID_JSON + "\n```";
    const plan = parsePacingResponse(wrapped);
    expect(plan.overallTargetNpW).toBe(250);
    expect(plan.segments).toHaveLength(1);
  });

  it("parses JSON with leading text", () => {
    const withPreamble = "Here is the pacing plan:\n" + VALID_JSON;
    const plan = parsePacingResponse(withPreamble);
    expect(plan.overallTargetNpW).toBe(250);
  });

  it("throws when no JSON at all", () => {
    expect(() => parsePacingResponse("No JSON here")).toThrow(
      "No JSON object found"
    );
  });

  it("throws when segments are missing", () => {
    const noSegments = JSON.stringify({
      overallTargetNpW: 250,
      estimatedFinishTimeMin: 180,
      strategy: "Test",
    });
    expect(() => parsePacingResponse(noSegments)).toThrow(
      "Invalid pacing plan structure"
    );
  });

  it("throws when overallTargetNpW is not a number", () => {
    const bad = JSON.stringify({
      overallTargetNpW: "250",
      estimatedFinishTimeMin: 180,
      strategy: "Test",
      segments: [],
    });
    expect(() => parsePacingResponse(bad)).toThrow("Invalid pacing plan structure");
  });

  it("coerces string numbers in segments to Number", () => {
    const withStrings = JSON.stringify({
      overallTargetNpW: 250,
      estimatedFinishTimeMin: 180,
      strategy: "Test",
      segments: [
        {
          label: "Flat",
          startKm: "0",
          endKm: "20",
          targetPowerW: "240",
          targetPowerPercent: "85",
          estimatedTimeMin: "35",
          advice: "Go fast.",
        },
      ],
    });
    const plan = parsePacingResponse(withStrings);
    expect(plan.segments[0].targetPowerW).toBe(240);
    expect(plan.segments[0].startKm).toBe(0);
    expect(typeof plan.segments[0].targetPowerW).toBe("number");
  });

  it("ignores extra fields in response", () => {
    const withExtra = JSON.stringify({
      overallTargetNpW: 250,
      estimatedFinishTimeMin: 180,
      strategy: "Test",
      extraField: "should be ignored",
      segments: [
        {
          label: "Flat",
          startKm: 0,
          endKm: 20,
          targetPowerW: 240,
          targetPowerPercent: 85,
          estimatedTimeMin: 35,
          advice: "Go.",
          extraSegField: true,
        },
      ],
    });
    const plan = parsePacingResponse(withExtra);
    expect(plan.overallTargetNpW).toBe(250);
    expect((plan as Record<string, unknown>)["extraField"]).toBeUndefined();
  });

  it("rounds segment numeric fields to integers", () => {
    const withDecimals = JSON.stringify({
      overallTargetNpW: 250.7,
      estimatedFinishTimeMin: 180.3,
      strategy: "Test",
      segments: [
        {
          label: "Flat",
          startKm: 0,
          endKm: 20,
          targetPowerW: 240.6,
          targetPowerPercent: 85.4,
          estimatedTimeMin: 35.9,
          advice: "Go.",
        },
      ],
    });
    const plan = parsePacingResponse(withDecimals);
    expect(plan.overallTargetNpW).toBe(251);
    expect(plan.estimatedFinishTimeMin).toBe(180);
    expect(plan.segments[0].targetPowerW).toBe(241);
    expect(plan.segments[0].targetPowerPercent).toBe(85);
    expect(plan.segments[0].estimatedTimeMin).toBe(36);
  });

  it("handles empty string input", () => {
    expect(() => parsePacingResponse("")).toThrow("No JSON object found");
  });

  it("handles empty segments array", () => {
    const emptySegs = JSON.stringify({
      overallTargetNpW: 250,
      estimatedFinishTimeMin: 180,
      strategy: "No segments needed.",
      segments: [],
    });
    const plan = parsePacingResponse(emptySegs);
    expect(plan.segments).toEqual([]);
  });
});
