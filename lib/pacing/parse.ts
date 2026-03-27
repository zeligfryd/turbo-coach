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

  if (parsed.estimatedFinishTimeMin <= 0) {
    throw new Error("estimatedFinishTimeMin must be positive");
  }

  if (parsed.overallTargetNpW <= 0) {
    throw new Error("overallTargetNpW must be positive");
  }

  const strategy = String(parsed.strategy ?? "");
  if (!strategy.trim()) {
    throw new Error("strategy field is missing or empty");
  }

  const segments: PacingSegment[] = parsed.segments.map(
    (seg: Record<string, unknown>, i: number) => {
      const targetPowerW = Math.round(Number(seg.targetPowerW ?? 0));
      const targetPowerPercent = Math.round(Number(seg.targetPowerPercent ?? 0));

      if (targetPowerW <= 0) {
        throw new Error(`Segment ${i} ("${seg.label}") has non-positive targetPowerW: ${targetPowerW}`);
      }
      if (targetPowerPercent <= 0) {
        throw new Error(`Segment ${i} ("${seg.label}") has non-positive targetPowerPercent: ${targetPowerPercent}`);
      }

      return {
        label: String(seg.label ?? ""),
        startKm: Number(seg.startKm ?? 0),
        endKm: Number(seg.endKm ?? 0),
        targetPowerW,
        targetPowerPercent,
        estimatedTimeMin: Math.round(Number(seg.estimatedTimeMin ?? 0)),
        advice: String(seg.advice ?? ""),
        targetHrZone: typeof seg.targetHrZone === "string" ? seg.targetHrZone : null,
        targetHrBpm: typeof seg.targetHrBpm === "string" ? seg.targetHrBpm : null,
      };
    },
  );

  return {
    overallTargetNpW: Math.round(parsed.overallTargetNpW),
    estimatedFinishTimeMin: Math.round(parsed.estimatedFinishTimeMin),
    strategy,
    segments,
  };
}
