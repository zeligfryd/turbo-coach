import type { PacingPlan, AmbitionLevel, GpxData } from "@/lib/race/types";
import { AMBITION_SCALING } from "@/lib/race/types";
import { recomputePlanTimes, type PhysicsOptions } from "@/lib/pacing/physics";

/**
 * Maximum sustainable % FTP by segment duration.
 * Prevents ambition scaling from pushing long-segment targets into
 * physiologically impossible territory (e.g. 110% FTP for 45 minutes).
 */
function durationCeilingPct(estMin: number): number {
  if (estMin > 60) return 95;   // threshold zone max ~60 min
  if (estMin > 20) return 105;  // VO2 onset — 20-60 min ceiling
  if (estMin > 5)  return 115;  // medium effort — 5-20 min ceiling
  return 150;                   // short burst — no practical ceiling
}

/**
 * Scale a pacing plan by an ambition level.
 *
 * HR zone/bpm fields are intentionally NOT scaled — they serve as hard
 * physiological ceilings that remain valid at any ambition level.  At
 * higher ambition settings the athlete will simply approach those ceilings
 * more closely; if they exceed them they are overcooking it.
 *
 * When gpxData and riderWeightKg are provided, segment times are
 * recomputed from scaled power targets using the physics model instead
 * of applying a flat time multiplier.
 *
 * @param ftp  Athlete's FTP in watts.  When provided, capped watts are
 *             re-derived from FTP x cappedPct for maximum accuracy.
 *             When omitted, proportional re-scaling is used as a fallback.
 */
export function scalePlan(
  plan: PacingPlan,
  ambition: AmbitionLevel,
  ftp?: number,
  gpxData?: GpxData,
  riderWeightKg?: number,
  eventType?: string,
  physicsOptions?: PhysicsOptions,
): PacingPlan {
  const { power, time } = AMBITION_SCALING[ambition];

  const scaled: PacingPlan = {
    overallTargetNpW: Math.round(plan.overallTargetNpW * power),
    estimatedFinishTimeMin: Math.round(plan.estimatedFinishTimeMin * time),
    strategy: plan.strategy,
    segments: plan.segments.map((seg) => {
      const scaledPct = Math.round(seg.targetPowerPercent * power);
      const ceiling = durationCeilingPct(seg.estimatedTimeMin);
      const cappedPct = Math.min(scaledPct, ceiling);

      let cappedW: number;
      if (cappedPct === scaledPct) {
        cappedW = Math.round(seg.targetPowerW * power);
      } else if (ftp) {
        cappedW = Math.round(ftp * cappedPct / 100);
      } else {
        cappedW = Math.round(seg.targetPowerW * (cappedPct / (seg.targetPowerPercent || 1)));
      }

      return {
        ...seg,
        targetPowerW: cappedW,
        targetPowerPercent: cappedPct,
        estimatedTimeMin: Math.round(seg.estimatedTimeMin * time),
      };
    }),
  };

  // Recompute times from physics if we have the data
  if (gpxData && riderWeightKg) {
    return recomputePlanTimes(scaled, gpxData, riderWeightKg, eventType ?? "other", physicsOptions);
  }

  return scaled;
}
