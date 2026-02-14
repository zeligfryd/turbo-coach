import {
  FITNESS_MACHINE_FEATURE_BITS,
  FITNESS_MACHINE_STATUS_OP,
  FTMS_CONTROL_OP_CODE,
  FTMS_CONTROL_RESULT,
  INDOOR_BIKE_DATA_FLAGS,
  TARGET_SETTING_FEATURE_BITS,
} from "@/lib/ble/ftms-constants";
import type {
  FtmsCapabilities,
  FtmsControlResponse,
  FtmsControlResultCode,
  FtmsPowerRange,
  FtmsResistanceRange,
  FtmsStatusEvent,
  IndoorBikeDataRecord,
} from "@/lib/ble/types";

function hasFlag(value: number, flag: number): boolean {
  return (value & flag) === flag;
}

export function parseIndoorBikeData(value: DataView): IndoorBikeDataRecord {
  let offset = 0;
  const flags = value.getUint16(offset, true);
  offset += 2;

  const record: IndoorBikeDataRecord = {
    moreData: hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.MORE_DATA),
    timestamp: Date.now(),
  };

  // Bit 0 semantics: when set, instantaneous speed is omitted.
  if (!record.moreData) {
    record.instantaneousSpeedKph = value.getUint16(offset, true) / 100;
    offset += 2;
  }

  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.AVERAGE_SPEED_PRESENT)) {
    record.averageSpeedKph = value.getUint16(offset, true) / 100;
    offset += 2;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.INSTANTANEOUS_CADENCE_PRESENT)) {
    record.instantaneousCadenceRpm = value.getUint16(offset, true) / 2;
    offset += 2;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.AVERAGE_CADENCE_PRESENT)) {
    record.averageCadenceRpm = value.getUint16(offset, true) / 2;
    offset += 2;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.TOTAL_DISTANCE_PRESENT)) {
    const b0 = value.getUint8(offset);
    const b1 = value.getUint8(offset + 1);
    const b2 = value.getUint8(offset + 2);
    record.totalDistanceMeters = b0 | (b1 << 8) | (b2 << 16);
    offset += 3;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.RESISTANCE_LEVEL_PRESENT)) {
    record.resistanceLevel = value.getInt16(offset, true) / 10;
    offset += 2;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.INSTANTANEOUS_POWER_PRESENT)) {
    record.instantaneousPowerWatts = value.getInt16(offset, true);
    offset += 2;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.AVERAGE_POWER_PRESENT)) {
    record.averagePowerWatts = value.getInt16(offset, true);
    offset += 2;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.EXPENDED_ENERGY_PRESENT)) {
    record.expendedEnergyKcal = value.getUint16(offset, true);
    offset += 5; // total energy (2) + energy per hour (2) + energy per minute (1)
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.HEART_RATE_PRESENT)) {
    record.heartRateBpm = value.getUint8(offset);
    offset += 1;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.MET_PRESENT)) {
    offset += 1;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.ELAPSED_TIME_PRESENT)) {
    record.elapsedTimeSeconds = value.getUint16(offset, true);
    offset += 2;
  }
  if (hasFlag(flags, INDOOR_BIKE_DATA_FLAGS.REMAINING_TIME_PRESENT)) {
    record.remainingTimeSeconds = value.getUint16(offset, true);
  }

  return record;
}

export function parseFtmsCapabilities(value: DataView): FtmsCapabilities {
  const fitnessMachineFeatures = value.getUint32(0, true);
  const targetSettingFeatures = value.getUint32(4, true);

  return {
    supportsPowerTarget: hasFlag(
      targetSettingFeatures,
      TARGET_SETTING_FEATURE_BITS.POWER_TARGET_SUPPORTED,
    ),
    supportsResistanceTarget: hasFlag(
      targetSettingFeatures,
      TARGET_SETTING_FEATURE_BITS.RESISTANCE_TARGET_SUPPORTED,
    ),
    supportsSimulation: hasFlag(
      targetSettingFeatures,
      TARGET_SETTING_FEATURE_BITS.INDOOR_BIKE_SIMULATION_SUPPORTED,
    ),
    supportsSpinDown: hasFlag(
      targetSettingFeatures,
      TARGET_SETTING_FEATURE_BITS.SPIN_DOWN_CONTROL_SUPPORTED,
    ),
  };
}

export function parseSupportedPowerRange(value: DataView): FtmsPowerRange {
  return {
    minWatts: value.getInt16(0, true),
    maxWatts: value.getInt16(2, true),
    stepWatts: value.getUint16(4, true),
  };
}

export function parseSupportedResistanceRange(value: DataView): FtmsResistanceRange {
  return {
    minLevel: value.getInt16(0, true) / 10,
    maxLevel: value.getInt16(2, true) / 10,
    step: value.getUint16(4, true) / 10,
  };
}

function parseControlResultCode(rawResultCode: number): FtmsControlResultCode {
  switch (rawResultCode) {
    case FTMS_CONTROL_RESULT.SUCCESS:
      return "success";
    case FTMS_CONTROL_RESULT.OP_CODE_NOT_SUPPORTED:
      return "op_code_not_supported";
    case FTMS_CONTROL_RESULT.INVALID_PARAMETER:
      return "invalid_parameter";
    case FTMS_CONTROL_RESULT.OPERATION_FAILED:
      return "operation_failed";
    case FTMS_CONTROL_RESULT.CONTROL_NOT_PERMITTED:
      return "control_not_permitted";
    default:
      return "reserved";
  }
}

export function parseControlPointResponse(value: DataView): FtmsControlResponse {
  const opCode = value.getUint8(0);
  if (opCode !== FTMS_CONTROL_OP_CODE.RESPONSE_CODE) {
    throw new Error(`Unexpected Control Point response op code: ${opCode}`);
  }

  const requestOpCode = value.getUint8(1);
  const rawResultCode = value.getUint8(2);
  const responseParameter =
    value.byteLength > 3 ? new DataView(value.buffer, value.byteOffset + 3) : undefined;

  return {
    requestOpCode,
    rawResultCode,
    resultCode: parseControlResultCode(rawResultCode),
    responseParameter,
  };
}

export function parseFitnessMachineStatus(value: DataView): FtmsStatusEvent {
  const opCode = value.getUint8(0);
  const parameter: number[] = [];
  for (let i = 1; i < value.byteLength; i += 1) {
    parameter.push(value.getUint8(i));
  }

  let name = `op_${opCode.toString(16)}`;
  switch (opCode) {
    case FITNESS_MACHINE_STATUS_OP.RESET:
      name = "reset";
      break;
    case FITNESS_MACHINE_STATUS_OP.STARTED_OR_RESUMED:
      name = "started_or_resumed";
      break;
    case FITNESS_MACHINE_STATUS_OP.TARGET_RESISTANCE_CHANGED:
      name = "target_resistance_changed";
      break;
    case FITNESS_MACHINE_STATUS_OP.TARGET_POWER_CHANGED:
      name = "target_power_changed";
      break;
    case FITNESS_MACHINE_STATUS_OP.SPIN_DOWN_STATUS:
      name = "spin_down_status";
      break;
    case FITNESS_MACHINE_STATUS_OP.CONTROL_PERMISSION_LOST:
      name = "control_permission_lost";
      break;
    default:
      break;
  }

  return {
    opCode,
    name,
    parameter: parameter.length > 0 ? parameter : undefined,
  };
}

export function hasPowerMeasurementSupport(value: DataView): boolean {
  const fitnessMachineFeatures = value.getUint32(0, true);
  return hasFlag(
    fitnessMachineFeatures,
    FITNESS_MACHINE_FEATURE_BITS.POWER_MEASUREMENT_SUPPORTED,
  );
}
