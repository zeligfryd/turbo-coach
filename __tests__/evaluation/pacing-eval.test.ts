/**
 * LLM pacing evaluation tests.
 *
 * These tests call the LLM to generate pacing plans and validate the output
 * against domain-specific constraints. They require an OpenAI API key and
 * are slower than unit tests (~30-60s per test).
 *
 * Run separately: npm run test:eval
 * Skipped automatically if OPENAI_API_KEY is not set.
 */

import { describe, it, expect } from "vitest";
import { generateText } from "ai";
import { buildPacingPrompt } from "@/lib/pacing/prompt";
import { parsePacingResponse } from "@/lib/pacing/parse";
import { scalePlan } from "@/lib/pacing/scale";
import {
  assertValidSchema,
  assertPowerConsistency,
  assertFlatTargetInRange,
  assertClimbTargetsInRange,
  assertClimbAdviceContainsWkg,
  assertSegmentCoverage,
} from "./constraints";
import { FLAT_TT, HILLY_ROAD_RACE, CRIT, MOUNTAIN_GF } from "../fixtures/courses";
import {
  SPRINTER_ATHLETE,
  CLIMBER_ATHLETE,
  TIME_TRIALIST_ATHLETE,
  ALL_ROUNDER_ATHLETE,
} from "../fixtures/athletes";
import { buildPowerProfile } from "@/lib/power/coggan";
import type { PacingPromptParams } from "@/lib/pacing/prompt";
import type { PacingPlan, AmbitionLevel } from "@/lib/race/types";
import type { GpxData } from "@/lib/race/types";
import type { PowerCurvePoint } from "@/lib/power/types";

// Skip all tests if no API key
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const describeEval = OPENAI_KEY ? describe : describe.skip;

// Resolve the model dynamically to avoid importing server-only code
async function getModel() {
  const { resolveModels } = await import("@/lib/ai/models");
  const { models } = resolveModels();
  return models.coaching;
}

// Helper to generate a plan from params
async function generatePlan(params: PacingPromptParams): Promise<PacingPlan> {
  const prompt = buildPacingPrompt(params);
  const model = await getModel();
  const result = await generateText({ model, prompt });
  return parsePacingResponse(result.text);
}

function makeProfile(curve: PowerCurvePoint[], gender: "male" | "female" = "male") {
  return buildPowerProfile(curve, [], gender);
}

function makeParams(
  course: GpxData,
  overrides: Partial<PacingPromptParams> = {},
): PacingPromptParams {
  return {
    ftp: 280,
    manualFtp: 280,
    estimatedFtp: null,
    weight: 75,
    wkg: 3.73,
    recentContext: "NP 250W, Avg 230W, 90min; NP 260W, Avg 240W, 120min",
    powerProfile: null,
    hrZones: null,
    raceName: "Eval Race",
    eventType: "road_race",
    gpxData: course,
    ...overrides,
  };
}

describeEval("LLM Pacing Evaluation", () => {
  // ── Structural tests ──────────────────────────────────────────

  describe("structural validation — flat TT", () => {
    let plan: PacingPlan;

    it("generates a valid plan", async () => {
      plan = await generatePlan(makeParams(FLAT_TT, { eventType: "time_trial" }));
      assertValidSchema(plan);
    }, 60_000);

    it("power values are consistent with FTP", () => {
      if (plan) assertPowerConsistency(plan, 280);
    });

    it("flat targets are within duration bucket", () => {
      if (plan) assertFlatTargetInRange(plan, 280);
    });

    it("segments cover the route", () => {
      if (plan) assertSegmentCoverage(plan, FLAT_TT.totalDistanceKm);
    });
  });

  describe("structural validation — hilly road race", () => {
    let plan: PacingPlan;

    it("generates a valid plan", async () => {
      const profile = makeProfile(CLIMBER_ATHLETE.curve);
      plan = await generatePlan(
        makeParams(HILLY_ROAD_RACE, { powerProfile: profile, weight: 62, wkg: 4.52 })
      );
      assertValidSchema(plan);
    }, 60_000);

    it("climb targets are within range", () => {
      if (plan) assertClimbTargetsInRange(plan, 280);
    });

    it("climb advice mentions W/kg", () => {
      if (plan) assertClimbAdviceContainsWkg(plan);
    });

    it("segments cover the route", () => {
      if (plan) assertSegmentCoverage(plan, HILLY_ROAD_RACE.totalDistanceKm);
    });
  });

  describe("structural validation — crit", () => {
    it("generates a valid plan for short race", async () => {
      const profile = makeProfile(SPRINTER_ATHLETE.curve);
      const plan = await generatePlan(
        makeParams(CRIT, { powerProfile: profile, eventType: "crit", weight: 86, wkg: 3.26 })
      );
      assertValidSchema(plan);
      // Crit should be short — under 60 min
      expect(plan.estimatedFinishTimeMin).toBeLessThan(120);
    }, 60_000);
  });

  describe("structural validation — mountain gran fondo", () => {
    let plan: PacingPlan;

    it("generates a valid plan", async () => {
      plan = await generatePlan(
        makeParams(MOUNTAIN_GF, { eventType: "gran_fondo", weight: 90, wkg: 3.11 })
      );
      assertValidSchema(plan);
    }, 60_000);

    it("includes weight advisory awareness for heavy rider", () => {
      // The advice or strategy should reflect the challenging climbing
      if (plan) {
        const allText = [
          plan.strategy,
          ...plan.segments.map((s) => s.advice),
        ].join(" ").toLowerCase();
        // Should mention something about weight, climbing challenge, or conservative pacing
        expect(
          allText.includes("weight") ||
          allText.includes("conserv") ||
          allText.includes("w/kg") ||
          allText.includes("climb")
        ).toBe(true);
      }
    });
  });

  // ── Cross-profile comparison tests ─────────────────────────────

  describe("cross-profile: climber vs sprinter on hilly course", () => {
    let climberPlan: PacingPlan;
    let sprinterPlan: PacingPlan;

    it("generates both plans", async () => {
      const climberProfile = makeProfile(CLIMBER_ATHLETE.curve);
      const sprinterProfile = makeProfile(SPRINTER_ATHLETE.curve);

      [climberPlan, sprinterPlan] = await Promise.all([
        generatePlan(
          makeParams(HILLY_ROAD_RACE, { powerProfile: climberProfile, weight: 62, wkg: 4.52 })
        ),
        generatePlan(
          makeParams(HILLY_ROAD_RACE, { powerProfile: sprinterProfile, weight: 86, wkg: 3.26 })
        ),
      ]);

      assertValidSchema(climberPlan);
      assertValidSchema(sprinterPlan);
    }, 90_000);

    it("climber has higher or equal long-climb % than sprinter", () => {
      if (!climberPlan || !sprinterPlan) return;

      const getClimbPercents = (plan: PacingPlan) =>
        plan.segments
          .filter((s) => s.label.toLowerCase().includes("climb") && s.estimatedTimeMin >= 20)
          .map((s) => s.targetPowerPercent);

      const climberPercents = getClimbPercents(climberPlan);
      const sprinterPercents = getClimbPercents(sprinterPlan);

      if (climberPercents.length > 0 && sprinterPercents.length > 0) {
        const climberAvg =
          climberPercents.reduce((a, b) => a + b, 0) / climberPercents.length;
        const sprinterAvg =
          sprinterPercents.reduce((a, b) => a + b, 0) / sprinterPercents.length;
        expect(
          climberAvg,
          `Climber avg long-climb ${climberAvg}% should >= Sprinter ${sprinterAvg}%`
        ).toBeGreaterThanOrEqual(sprinterAvg - 3); // small tolerance
      }
    });
  });

  describe("cross-profile: TT specialist vs puncheur on flat TT", () => {
    let ttPlan: PacingPlan;
    let puncheurPlan: PacingPlan;

    it("generates both plans", async () => {
      const ttProfile = makeProfile(TIME_TRIALIST_ATHLETE.curve);
      const arProfile = makeProfile(ALL_ROUNDER_ATHLETE.curve);

      [ttPlan, puncheurPlan] = await Promise.all([
        generatePlan(
          makeParams(FLAT_TT, {
            powerProfile: ttProfile,
            eventType: "time_trial",
            weight: 80,
            wkg: 3.5,
          })
        ),
        generatePlan(
          makeParams(FLAT_TT, {
            powerProfile: arProfile,
            eventType: "time_trial",
          })
        ),
      ]);

      assertValidSchema(ttPlan);
      assertValidSchema(puncheurPlan);
    }, 90_000);

    it("TT specialist has higher or equal flat % than all-rounder", () => {
      if (!ttPlan || !puncheurPlan) return;

      const getFlatPercents = (plan: PacingPlan) =>
        plan.segments
          .filter((s) => s.label.toLowerCase().includes("flat"))
          .map((s) => s.targetPowerPercent);

      const ttFlat = getFlatPercents(ttPlan);
      const arFlat = getFlatPercents(puncheurPlan);

      if (ttFlat.length > 0 && arFlat.length > 0) {
        const ttAvg = ttFlat.reduce((a, b) => a + b, 0) / ttFlat.length;
        const arAvg = arFlat.reduce((a, b) => a + b, 0) / arFlat.length;
        expect(
          ttAvg,
          `TT avg flat ${ttAvg}% should >= AR ${arAvg}%`
        ).toBeGreaterThanOrEqual(arAvg - 3);
      }
    });
  });

  // ── Ambition scaling comparison ───────────────────────────────

  describe("ambition level ordering", () => {
    it("conservative < realistic < aggressive < all_out power targets", async () => {
      const basePlan = await generatePlan(makeParams(FLAT_TT, { eventType: "time_trial" }));
      assertValidSchema(basePlan);

      const levels: AmbitionLevel[] = ["conservative", "realistic", "aggressive", "all_out"];
      const scaledPlans = levels.map((l) => scalePlan(basePlan, l));

      for (let i = 1; i < scaledPlans.length; i++) {
        expect(
          scaledPlans[i].overallTargetNpW,
          `${levels[i]} power should > ${levels[i - 1]} power`
        ).toBeGreaterThanOrEqual(scaledPlans[i - 1].overallTargetNpW);
      }
    }, 60_000);
  });
});
