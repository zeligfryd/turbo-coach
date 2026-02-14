export interface BleFilter {
  services?: string[];
  name?: string;
  namePrefix?: string;
}

export interface BleDevice {
  id: string;
  name: string | null;
}

export interface BleConnection {
  device: BleDevice;
  readCharacteristic(serviceUuid: string, charUuid: string): Promise<DataView>;
  writeCharacteristic(
    serviceUuid: string,
    charUuid: string,
    data: ArrayBuffer,
  ): Promise<void>;
  subscribe(
    serviceUuid: string,
    charUuid: string,
    callback: (data: DataView) => void,
  ): Promise<() => Promise<void>>;
  disconnect(): Promise<void>;
  onDisconnected(callback: () => void): () => void;
}

export interface BleAdapter {
  isAvailable(): boolean;
  requestDevice(filters: BleFilter[]): Promise<BleDevice>;
  connect(device: BleDevice): Promise<BleConnection>;
}

export type FtmsCapabilities = {
  supportsPowerTarget: boolean;
  supportsResistanceTarget: boolean;
  supportsSimulation: boolean;
  supportsSpinDown: boolean;
};

export type IndoorBikeDataRecord = {
  moreData: boolean;
  instantaneousSpeedKph?: number;
  averageSpeedKph?: number;
  instantaneousCadenceRpm?: number;
  averageCadenceRpm?: number;
  totalDistanceMeters?: number;
  resistanceLevel?: number;
  instantaneousPowerWatts?: number;
  averagePowerWatts?: number;
  expendedEnergyKcal?: number;
  heartRateBpm?: number;
  elapsedTimeSeconds?: number;
  remainingTimeSeconds?: number;
  timestamp: number;
};

export type FtmsControlResultCode =
  | "success"
  | "op_code_not_supported"
  | "invalid_parameter"
  | "operation_failed"
  | "control_not_permitted"
  | "reserved";

export type FtmsControlResponse = {
  requestOpCode: number;
  resultCode: FtmsControlResultCode;
  rawResultCode: number;
  responseParameter?: DataView;
};

export type FtmsPowerRange = {
  minWatts: number;
  maxWatts: number;
  stepWatts: number;
};

export type FtmsResistanceRange = {
  minLevel: number;
  maxLevel: number;
  step: number;
};

export type FtmsStatusEvent = {
  opCode: number;
  name: string;
  parameter?: number[];
};
