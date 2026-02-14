import { FTMS_CONTROL_OP_CODE } from "@/lib/ble/ftms-constants";
import type { FtmsControlResponse } from "@/lib/ble/types";

function toArrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function int16ToLeBytes(value: number): [number, number] {
  const normalized = value & 0xffff;
  return [normalized & 0xff, (normalized >> 8) & 0xff];
}

function uint16ToLeBytes(value: number): [number, number] {
  return [value & 0xff, (value >> 8) & 0xff];
}

export function buildRequestControlCommand(): ArrayBuffer {
  return toArrayBuffer([FTMS_CONTROL_OP_CODE.REQUEST_CONTROL]);
}

export function buildResetCommand(): ArrayBuffer {
  return toArrayBuffer([FTMS_CONTROL_OP_CODE.RESET]);
}

export function buildSetTargetPowerCommand(watts: number): ArrayBuffer {
  const clamped = Math.max(-32768, Math.min(32767, Math.round(watts)));
  const [lo, hi] = int16ToLeBytes(clamped);
  return toArrayBuffer([FTMS_CONTROL_OP_CODE.SET_TARGET_POWER, lo, hi]);
}

export function buildSetTargetResistanceCommand(level: number): ArrayBuffer {
  // FTMS requires UINT8 with 0.1 resolution.
  const encoded = Math.max(0, Math.min(255, Math.round(level * 10)));
  return toArrayBuffer([FTMS_CONTROL_OP_CODE.SET_TARGET_RESISTANCE, encoded]);
}

export function buildStartOrResumeCommand(): ArrayBuffer {
  return toArrayBuffer([FTMS_CONTROL_OP_CODE.START_OR_RESUME]);
}

export function buildStopOrPauseCommand(type: "stop" | "pause"): ArrayBuffer {
  return toArrayBuffer([
    FTMS_CONTROL_OP_CODE.STOP_OR_PAUSE,
    type === "stop" ? 0x01 : 0x02,
  ]);
}

export function buildIndoorBikeSimulationCommand(params: {
  windSpeedMps: number; // SINT16, 0.001
  gradePercent: number; // SINT16, 0.01
  crr: number; // UINT8, 0.0001
  cw: number; // UINT8, 0.01
}): ArrayBuffer {
  const wind = Math.max(-32768, Math.min(32767, Math.round(params.windSpeedMps * 1000)));
  const grade = Math.max(-32768, Math.min(32767, Math.round(params.gradePercent * 100)));
  const crr = Math.max(0, Math.min(255, Math.round(params.crr * 10000)));
  const cw = Math.max(0, Math.min(255, Math.round(params.cw * 100)));

  const [windLo, windHi] = int16ToLeBytes(wind);
  const [gradeLo, gradeHi] = int16ToLeBytes(grade);
  return toArrayBuffer([
    FTMS_CONTROL_OP_CODE.SET_INDOOR_BIKE_SIMULATION,
    windLo,
    windHi,
    gradeLo,
    gradeHi,
    crr,
    cw,
  ]);
}

export function isSuccessfulControlResponse(response: FtmsControlResponse): boolean {
  return response.resultCode === "success";
}

export function ensureSuccessfulControlResponse(
  response: FtmsControlResponse,
  operationName: string,
): void {
  if (!isSuccessfulControlResponse(response)) {
    throw new Error(
      `${operationName} failed: ${response.resultCode} (raw=${response.rawResultCode})`,
    );
  }
}

export function buildWheelCircumferenceCommand(wheelCircumferenceMm: number): ArrayBuffer {
  const encoded = Math.max(0, Math.min(65535, Math.round(wheelCircumferenceMm * 10)));
  const [lo, hi] = uint16ToLeBytes(encoded);
  return toArrayBuffer([0x12, lo, hi]);
}

export function buildSpinDownCommand(type: "start" | "ignore"): ArrayBuffer {
  return toArrayBuffer([FTMS_CONTROL_OP_CODE.SPIN_DOWN_CONTROL, type === "start" ? 0x01 : 0x02]);
}
