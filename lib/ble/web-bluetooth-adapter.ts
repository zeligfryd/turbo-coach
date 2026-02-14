import type { BleAdapter, BleConnection, BleDevice, BleFilter } from "@/lib/ble/types";

type CharacteristicKey = `${string}:${string}`;

type WebBleCharacteristic = {
  value: DataView | null;
  readValue: () => Promise<DataView>;
  writeValueWithResponse: (data: ArrayBuffer) => Promise<void>;
  startNotifications: () => Promise<void>;
  stopNotifications: () => Promise<void>;
  addEventListener: (name: string, callback: (event: Event) => void) => void;
  removeEventListener: (name: string, callback: (event: Event) => void) => void;
};

type WebBleService = {
  getCharacteristic: (uuid: string) => Promise<WebBleCharacteristic>;
};

type WebBleGattServer = {
  connected: boolean;
  connect?: () => Promise<WebBleGattServer>;
  disconnect: () => void;
  getPrimaryService: (serviceUuid: string) => Promise<WebBleService>;
};

type WebBleDevice = {
  id: string;
  name: string | null;
  gatt?: WebBleGattServer;
  addEventListener: (name: string, callback: () => void) => void;
  removeEventListener: (name: string, callback: () => void) => void;
};

type WebBluetoothNavigator = Navigator & {
  bluetooth: {
    requestDevice: (request: {
      filters: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
      optionalServices?: string[];
    }) => Promise<WebBleDevice>;
  };
};

function isBluetoothDevice(value: unknown): value is WebBleDevice {
  return !!value && typeof value === "object" && "gatt" in value;
}

class WebBleConnection implements BleConnection {
  private readonly gattServer: WebBleGattServer;
  private readonly characteristicCache = new Map<CharacteristicKey, WebBleCharacteristic>();
  private readonly disconnectedCallbacks = new Set<() => void>();
  private readonly disconnectionHandler: () => void;

  device: BleDevice;

  constructor(
    private readonly bluetoothDevice: WebBleDevice,
    gattServer: WebBleGattServer,
  ) {
    this.gattServer = gattServer;
    this.device = {
      id: bluetoothDevice.id,
      name: bluetoothDevice.name ?? null,
    };
    this.disconnectionHandler = () => {
      this.disconnectedCallbacks.forEach((callback) => callback());
    };
    this.bluetoothDevice.addEventListener("gattserverdisconnected", this.disconnectionHandler);
  }

  async disconnect(): Promise<void> {
    this.bluetoothDevice.removeEventListener("gattserverdisconnected", this.disconnectionHandler);
    if (this.gattServer.connected) {
      this.gattServer.disconnect();
    }
  }

  onDisconnected(callback: () => void): () => void {
    this.disconnectedCallbacks.add(callback);
    return () => {
      this.disconnectedCallbacks.delete(callback);
    };
  }

  async readCharacteristic(serviceUuid: string, charUuid: string): Promise<DataView> {
    const characteristic = await this.getCharacteristic(serviceUuid, charUuid);
    const value = await characteristic.readValue();
    return value;
  }

  async writeCharacteristic(
    serviceUuid: string,
    charUuid: string,
    data: ArrayBuffer,
  ): Promise<void> {
    const characteristic = await this.getCharacteristic(serviceUuid, charUuid);
    await characteristic.writeValueWithResponse(data);
  }

  async subscribe(
    serviceUuid: string,
    charUuid: string,
    callback: (data: DataView) => void,
  ): Promise<() => Promise<void>> {
    const characteristic = await this.getCharacteristic(serviceUuid, charUuid);
    const listener = (event: Event) => {
      const target = event.target as WebBleCharacteristic | null;
      if (!target?.value) {
        return;
      }
      callback(target.value);
    };

    characteristic.addEventListener("characteristicvaluechanged", listener);
    await characteristic.startNotifications();

    return async () => {
      characteristic.removeEventListener("characteristicvaluechanged", listener);
      await characteristic.stopNotifications();
    };
  }

  private async getCharacteristic(
    serviceUuid: string,
    charUuid: string,
  ): Promise<WebBleCharacteristic> {
    const key: CharacteristicKey = `${serviceUuid}:${charUuid}`;
    const cached = this.characteristicCache.get(key);
    if (cached) {
      return cached;
    }

    const service = await this.gattServer.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(charUuid);
    this.characteristicCache.set(key, characteristic);
    return characteristic;
  }
}

export class WebBluetoothAdapter implements BleAdapter {
  private lastDeviceById = new Map<string, WebBleDevice>();

  isAvailable(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  async requestDevice(filters: BleFilter[]): Promise<BleDevice> {
    if (!this.isAvailable()) {
      throw new Error("Web Bluetooth is not available in this browser.");
    }

    const nav = navigator as WebBluetoothNavigator;
    const device = await nav.bluetooth.requestDevice({
      filters: filters.map((filter) => ({
        services: filter.services,
        name: filter.name,
        namePrefix: filter.namePrefix,
      })),
      optionalServices: [],
    });

    this.lastDeviceById.set(device.id, device);
    return {
      id: device.id,
      name: device.name ?? null,
    };
  }

  async connect(device: BleDevice): Promise<BleConnection> {
    const bluetoothDevice = this.lastDeviceById.get(device.id);
    if (!bluetoothDevice || !isBluetoothDevice(bluetoothDevice)) {
      throw new Error("Device handle not found. Request the device again.");
    }

    const gattServer = await bluetoothDevice.gatt?.connect?.();
    if (!gattServer) {
      throw new Error("Failed to connect to trainer.");
    }
    return new WebBleConnection(bluetoothDevice, gattServer);
  }
}
