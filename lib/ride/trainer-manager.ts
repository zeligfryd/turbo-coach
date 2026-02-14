import {
  buildIndoorBikeSimulationCommand,
  buildRequestControlCommand,
  buildSetTargetPowerCommand,
  buildSetTargetResistanceCommand,
  buildSpinDownCommand,
  buildStartOrResumeCommand,
  buildStopOrPauseCommand,
  ensureSuccessfulControlResponse,
} from "@/lib/ble/ftms-control";
import { FTMS } from "@/lib/ble/ftms-constants";
import {
  parseControlPointResponse,
  parseFitnessMachineStatus,
  parseFtmsCapabilities,
  parseIndoorBikeData,
  parseSupportedPowerRange,
  parseSupportedResistanceRange,
} from "@/lib/ble/ftms-parser";
import type {
  BleAdapter,
  BleConnection,
  BleDevice,
  FtmsCapabilities,
  FtmsControlResponse,
  FtmsPowerRange,
  FtmsResistanceRange,
  FtmsStatusEvent,
  IndoorBikeDataRecord,
} from "@/lib/ble/types";
import { CommandQueue } from "@/lib/ride/command-queue";

type TrainerManagerListeners = {
  data: (record: IndoorBikeDataRecord) => void;
  status: (status: FtmsStatusEvent) => void;
  disconnect: () => void;
  warning: (message: string) => void;
};

export type TrainerConnectResult = {
  device: BleDevice;
  capabilities: FtmsCapabilities;
  powerRange?: FtmsPowerRange;
  resistanceRange?: FtmsResistanceRange;
};

export class TrainerManager {
  private connection: BleConnection | null = null;
  private commandQueue = new CommandQueue();
  private listeners: { [K in keyof TrainerManagerListeners]: Set<TrainerManagerListeners[K]> } = {
    data: new Set(),
    status: new Set(),
    disconnect: new Set(),
    warning: new Set(),
  };
  private unsubs: Array<() => Promise<void> | void> = [];

  private pendingControlResponses: Array<(response: FtmsControlResponse) => void> = [];
  private latestRequestedPower: number | null = null;
  private inFlightPowerWrite: Promise<void> | null = null;

  private capabilities: FtmsCapabilities | null = null;
  private powerRange?: FtmsPowerRange;
  private resistanceRange?: FtmsResistanceRange;

  constructor(private readonly adapter: BleAdapter) {}

  on<K extends keyof TrainerManagerListeners>(
    eventName: K,
    callback: TrainerManagerListeners[K],
  ): () => void {
    this.listeners[eventName].add(callback);
    return () => {
      this.listeners[eventName].delete(callback);
    };
  }

  isConnected(): boolean {
    return !!this.connection;
  }

  getCapabilities(): FtmsCapabilities | null {
    return this.capabilities;
  }

  getPowerRange(): FtmsPowerRange | undefined {
    return this.powerRange;
  }

  getResistanceRange(): FtmsResistanceRange | undefined {
    return this.resistanceRange;
  }

  async requestTrainerDevice(): Promise<BleDevice> {
    return this.adapter.requestDevice([{ services: [FTMS.SERVICE_UUID] }]);
  }

  async connect(device: BleDevice): Promise<TrainerConnectResult> {
    this.connection = await this.adapter.connect(device);

    this.unsubs.push(
      this.connection.onDisconnected(() => {
        this.emit("disconnect");
      }),
    );

    // Discover by reading required characteristics.
    const featureValue = await this.connection.readCharacteristic(
      FTMS.SERVICE_UUID,
      FTMS.FITNESS_MACHINE_FEATURE_UUID,
    );
    this.capabilities = parseFtmsCapabilities(featureValue);

    try {
      const powerRangeValue = await this.connection.readCharacteristic(
        FTMS.SERVICE_UUID,
        FTMS.SUPPORTED_POWER_RANGE_UUID,
      );
      this.powerRange = parseSupportedPowerRange(powerRangeValue);
    } catch {
      this.powerRange = undefined;
    }

    try {
      const resistanceRangeValue = await this.connection.readCharacteristic(
        FTMS.SERVICE_UUID,
        FTMS.SUPPORTED_RESISTANCE_RANGE_UUID,
      );
      this.resistanceRange = parseSupportedResistanceRange(resistanceRangeValue);
    } catch {
      this.resistanceRange = undefined;
    }

    // Subscriptions
    const unsubscribeBikeData = await this.connection.subscribe(
      FTMS.SERVICE_UUID,
      FTMS.INDOOR_BIKE_DATA_UUID,
      (value) => {
        const parsed = parseIndoorBikeData(value);
        this.emit("data", parsed);
      },
    );
    this.unsubs.push(unsubscribeBikeData);

    const unsubscribeStatus = await this.connection.subscribe(
      FTMS.SERVICE_UUID,
      FTMS.FITNESS_MACHINE_STATUS_UUID,
      (value) => {
        const parsed = parseFitnessMachineStatus(value);
        this.emit("status", parsed);
      },
    );
    this.unsubs.push(unsubscribeStatus);

    const unsubscribeControlPoint = await this.connection.subscribe(
      FTMS.SERVICE_UUID,
      FTMS.FITNESS_MACHINE_CONTROL_POINT_UUID,
      (value) => {
        const response = parseControlPointResponse(value);
        const resolve = this.pendingControlResponses.shift();
        if (resolve) {
          resolve(response);
        }
      },
    );
    this.unsubs.push(unsubscribeControlPoint);

    await this.requestControl();

    return {
      device,
      capabilities: this.capabilities,
      powerRange: this.powerRange,
      resistanceRange: this.resistanceRange,
    };
  }

  async disconnect(): Promise<void> {
    for (const unsub of this.unsubs.splice(0)) {
      await unsub();
    }
    if (this.connection) {
      await this.connection.disconnect();
    }
    this.connection = null;
    this.capabilities = null;
    this.powerRange = undefined;
    this.resistanceRange = undefined;
  }

  async requestControl(): Promise<void> {
    const response = await this.writeControlPoint(buildRequestControlCommand());
    ensureSuccessfulControlResponse(response, "Request Control");
  }

  async startOrResume(): Promise<void> {
    const response = await this.writeControlPoint(buildStartOrResumeCommand());
    ensureSuccessfulControlResponse(response, "Start or Resume");
  }

  async stopOrPause(type: "stop" | "pause"): Promise<void> {
    const response = await this.writeControlPoint(buildStopOrPauseCommand(type));
    ensureSuccessfulControlResponse(response, "Stop or Pause");
  }

  async setTargetPower(watts: number): Promise<void> {
    this.latestRequestedPower = watts;
    if (this.inFlightPowerWrite) {
      return;
    }

    this.inFlightPowerWrite = this.flushLatestPowerTarget();
    try {
      await this.inFlightPowerWrite;
    } finally {
      this.inFlightPowerWrite = null;
    }
  }

  private async flushLatestPowerTarget(): Promise<void> {
    while (this.latestRequestedPower !== null) {
      const watts = this.latestRequestedPower;
      this.latestRequestedPower = null;
      await this.sendTargetPower(watts);
    }
  }

  private async sendTargetPower(watts: number): Promise<void> {
    const response = await this.commandQueue.enqueuePowerCommand(() =>
      this.writeControlPoint(buildSetTargetPowerCommand(watts)),
    );
    if (response.resultCode === "control_not_permitted") {
      this.emit("warning", "Trainer control was lost. Reacquiring control...");
      await this.requestControl();
      const retryResponse = await this.commandQueue.enqueuePowerCommand(() =>
        this.writeControlPoint(buildSetTargetPowerCommand(watts)),
      );
      ensureSuccessfulControlResponse(retryResponse, "Set Target Power");
      return;
    }
    ensureSuccessfulControlResponse(response, "Set Target Power");
  }

  async setTargetResistance(level: number): Promise<void> {
    const response = await this.commandQueue.enqueuePowerCommand(() =>
      this.writeControlPoint(buildSetTargetResistanceCommand(level)),
    );
    ensureSuccessfulControlResponse(response, "Set Target Resistance");
  }

  async setSimulationParams(params: {
    windSpeedMps: number;
    gradePercent: number;
    crr: number;
    cw: number;
  }): Promise<void> {
    const response = await this.commandQueue.enqueuePowerCommand(() =>
      this.writeControlPoint(buildIndoorBikeSimulationCommand(params)),
    );
    ensureSuccessfulControlResponse(response, "Set Simulation Params");
  }

  async startSpinDown(): Promise<void> {
    const response = await this.writeControlPoint(buildSpinDownCommand("start"));
    ensureSuccessfulControlResponse(response, "Spin Down");
  }

  private async writeControlPoint(command: ArrayBuffer): Promise<FtmsControlResponse> {
    if (!this.connection) {
      throw new Error("Trainer is not connected.");
    }
    const connection = this.connection;
    const responsePromise = new Promise<FtmsControlResponse>((resolve, reject) => {
      const resolver = (response: FtmsControlResponse) => {
        clearTimeout(timeout);
        resolve(response);
      };
      const timeout = setTimeout(() => {
        this.pendingControlResponses = this.pendingControlResponses.filter(
          (callback) => callback !== resolver,
        );
        reject(new Error("Trainer control point response timeout."));
      }, 8000);

      this.pendingControlResponses.push(resolver);
    });

    await connection.writeCharacteristic(
      FTMS.SERVICE_UUID,
      FTMS.FITNESS_MACHINE_CONTROL_POINT_UUID,
      command,
    );

    return responsePromise;
  }

  private emit<K extends keyof TrainerManagerListeners>(
    eventName: K,
    payload?: Parameters<TrainerManagerListeners[K]>[0],
  ): void {
    for (const callback of this.listeners[eventName]) {
      if (payload === undefined) {
        (callback as () => void)();
      } else {
        (callback as (arg: unknown) => void)(payload);
      }
    }
  }
}
