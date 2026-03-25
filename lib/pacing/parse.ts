import type { PacingPlan, PacingSegment } from "@/lib/race/types";

export function parsePacingResponse(text: string): PacingPlan {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON object found in response");
  }

  const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));

  if (
    typeof parsed.overallTargetNpW !== "number" ||
    typeof parsed.estimatedFinishTimeMin !== "number" ||
    !Array.isArray(parsed.segments)
  ) {
    throw new Error("Invalid pacing plan structure");
  }

  const segments: PacingSegment[] = parsed.segments.map(
    (seg: Record<string, unknown>) => ({
      label: String(seg.label ?? ""),
      startKm: Number(seg.startKm ?? 0),
      endKm: Number(seg.endKm ?? 0),
      targetPowerW: Math.round(Number(seg.targetPowerW ?? 0)),
      targetPowerPercent: Math.round(Number(seg.targetPowerPercent ?? 0)),
      estimatedTimeMin: Math.round(Number(seg.estimatedTimeMin ?? 0)),
      advice: String(seg.advice ?? ""),
    }),
  );

  return {
    overallTargetNpW: Math.round(parsed.overallTargetNpW),
    estimatedFinishTimeMin: Math.round(parsed.estimatedFinishTimeMin),
    strategy: String(parsed.strategy ?? ""),
    segments,
  };
}
