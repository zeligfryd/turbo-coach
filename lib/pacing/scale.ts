import type { PacingPlan, AmbitionLevel } from "@/lib/race/types";
import { AMBITION_SCALING } from "@/lib/race/types";

export function scalePlan(plan: PacingPlan, ambition: AmbitionLevel): PacingPlan {
  const { power, time } = AMBITION_SCALING[ambition];
  return {
    overallTargetNpW: Math.round(plan.overallTargetNpW * power),
    estimatedFinishTimeMin: Math.round(plan.estimatedFinishTimeMin * time),
    strategy: plan.strategy,
    segments: plan.segments.map((seg) => ({
      ...seg,
      targetPowerW: Math.round(seg.targetPowerW * power),
      targetPowerPercent: Math.round(seg.targetPowerPercent * power),
      estimatedTimeMin: Math.round(seg.estimatedTimeMin * time),
    })),
  };
}
