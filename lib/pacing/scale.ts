import type { PacingPlan, AmbitionLevel } from "@/lib/race/types";
import { AMBITION_SCALING } from "@/lib/race/types";

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
 * @param ftp  Athlete's FTP in watts.  When provided, capped watts are
 *             re-derived from FTP × cappedPct for maximum accuracy.
 *             When omitted, proportional re-scaling is used as a fallback.
 */
export function scalePlan(plan: PacingPlan, ambition: AmbitionLevel, ftp?: number): PacingPlan {
  const { power, time } = AMBITION_SCALING[ambition];
  return {
    overallTargetNpW: Math.round(plan.overallTargetNpW * power),
    estimatedFinishTimeMin: Math.round(plan.estimatedFinishTimeMin * time),
    strategy: plan.strategy,
    segments: plan.segments.map((seg) => {
      const scaledPct = Math.round(seg.targetPowerPercent * power);
      const ceiling = durationCeilingPct(seg.estimatedTimeMin);
      const cappedPct = Math.min(scaledPct, ceiling);

      let cappedW: number;
      if (cappedPct === scaledPct) {
        // No ceiling applied — use direct watt scaling for precision
        cappedW = Math.round(seg.targetPowerW * power);
      } else if (ftp) {
        // Ceiling applied — derive watts from FTP for accuracy
        cappedW = Math.round(ftp * cappedPct / 100);
      } else {
        // Ceiling applied, no FTP — proportional re-scaling from original
        cappedW = Math.round(seg.targetPowerW * (cappedPct / (seg.targetPowerPercent || 1)));
      }

      return {
        ...seg,
        targetPowerW: cappedW,
        targetPowerPercent: cappedPct,
        estimatedTimeMin: Math.round(seg.estimatedTimeMin * time),
        // HR fields kept as hard ceilings — not scaled with power
      };
    }),
  };
}
