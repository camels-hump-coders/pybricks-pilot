interface BluetoothService {
  requestDevice(): Promise<BluetoothDevice | null>;
  connectToDevice(deviceId: string): Promise<BluetoothDevice | null>;
  connect(device: BluetoothDevice): Promise<BluetoothRemoteGATTServer>;
  disconnect(server: BluetoothRemoteGATTServer): Promise<void>;
  isConnected(device: BluetoothDevice): boolean;
  discoverServices(
    server: BluetoothRemoteGATTServer,
  ): Promise<BluetoothRemoteGATTService[]>;
  getCharacteristic(
    service: BluetoothRemoteGATTService,
    uuid: string,
  ): Promise<BluetoothRemoteGATTCharacteristic>;
  writeData(
    characteristic: BluetoothRemoteGATTCharacteristic,
    data: BufferSource,
  ): Promise<void>;
  readData(
    characteristic: BluetoothRemoteGATTCharacteristic,
  ): Promise<DataView>;
  subscribeToNotifications(
    characteristic: BluetoothRemoteGATTCharacteristic,
    callback: (data: DataView) => void,
  ): Promise<void>;
  addEventListener(
    event: "disconnected",
    callback: (device: BluetoothDevice) => void,
  ): void;
  removeEventListener(
    event: "disconnected",
    callback: (device: BluetoothDevice) => void,
  ): void;
}

// Pybricks service UUIDs (official Pybricks protocol)
export const PYBRICKS_SERVICE_UUID = "c5f50001-8280-46da-89f4-6d8051e4aeef";
export const PYBRICKS_COMMAND_EVENT_CHAR_UUID =
  "c5f50002-8280-46da-89f4-6d8051e4aeef";
export const PYBRICKS_HUB_CAPABILITIES_CHAR_UUID =
  "c5f50003-8280-46da-89f4-6d8051e4aeef";

export interface HubInfo {
  name: string;
  manufacturer?: string;
  firmwareRevision?: string;
  batteryLevel?: number;
}

class WebBluetoothService implements BluetoothService {
  private connectedDevices = new Map<
    BluetoothDevice,
    BluetoothRemoteGATTServer
  >();
  private disconnectListeners = new Set<(device: BluetoothDevice) => void>();

  async requestDevice(): Promise<BluetoothDevice | null> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API is not supported in this browser");
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [PYBRICKS_SERVICE_UUID] }],
        // Removed optionalServices since Pybricks hubs don't expose standard BLE services
      });

      device.addEventListener(
        "gattserverdisconnected",
        this.onDeviceDisconnected,
      );
      return device;
    } catch (error) {
      if (error instanceof Error && error.name === "NotFoundError") {
        return null;
      }
      throw error;
    }
  }

  async connectToDevice(deviceId: string): Promise<BluetoothDevice | null> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API is not supported in this browser");
    }

    try {
      // Check if getDevices is available (Chrome 85+)
      if (navigator.bluetooth.getDevices) {
        const devices = await navigator.bluetooth.getDevices();
        const device = devices.find((d) => d.id === deviceId);
        return device || null;
      } else {
        console.warn(
          "navigator.bluetooth.getDevices is not supported in this browser",
        );
        return null;
      }
    } catch (error) {
      console.warn("Failed to get previously paired device:", error);
      return null;
    }
  }

  async connect(device: BluetoothDevice): Promise<BluetoothRemoteGATTServer> {
    if (!device.gatt) {
      throw new Error("Device does not support GATT");
    }

    // Add disconnect listener before connecting
    device.addEventListener(
      "gattserverdisconnected",
      this.onDeviceDisconnected,
    );

    const server = await device.gatt.connect();
    this.connectedDevices.set(device, server);
    return server;
  }

  async disconnect(server: BluetoothRemoteGATTServer): Promise<void> {
    if (server.connected) {
      server.disconnect();
    }

    const device = Array.from(this.connectedDevices.entries()).find(
      ([_, s]) => s === server,
    )?.[0];

    if (device) {
      device.removeEventListener(
        "gattserverdisconnected",
        this.onDeviceDisconnected,
      );
      this.connectedDevices.delete(device);
    }
  }

  isConnected(device: BluetoothDevice): boolean {
    const server = this.connectedDevices.get(device);
    return server?.connected ?? false;
  }

  async discoverServices(
    server: BluetoothRemoteGATTServer,
  ): Promise<BluetoothRemoteGATTService[]> {
    const services = await server.getPrimaryServices();
    return services;
  }

  async getCharacteristic(
    service: BluetoothRemoteGATTService,
    uuid: string,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    return await service.getCharacteristic(uuid);
  }

  async writeData(
    characteristic: BluetoothRemoteGATTCharacteristic,
    data: BufferSource,
  ): Promise<void> {
    // Check if the characteristic supports write with response
    // Pybricks v3.3+ uses writeValueWithResponse for better reliability
    if (characteristic.properties.write) {
      await characteristic.writeValueWithResponse(data);
    } else if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(data);
    } else {
      throw new Error("Characteristic does not support writing");
    }
  }

  async readData(
    characteristic: BluetoothRemoteGATTCharacteristic,
  ): Promise<DataView> {
    return await characteristic.readValue();
  }

  async subscribeToNotifications(
    characteristic: BluetoothRemoteGATTCharacteristic,
    callback: (data: DataView) => void,
  ): Promise<void> {
    characteristic.addEventListener("characteristicvaluechanged", (event) => {
      const target = event.target;
      if (target && "value" in target && (target as any).value) {
        callback((target as any).value);
      }
    });

    await characteristic.startNotifications();
  }

  async getHubInfo(server: BluetoothRemoteGATTServer): Promise<HubInfo> {
    // For Pybricks hubs, we'll use basic info and rely on telemetry for battery/status
    const info: HubInfo = {
      name: server.device?.name || "Pybricks Hub",
      manufacturer: "LEGO Group",
      firmwareRevision: "Pybricks",
    };

    // Note: Pybricks hubs don't typically expose standard Bluetooth services
    // Battery level and other telemetry should come from Python program telemetry
    return info;
  }

  addEventListener(
    _event: "disconnected",
    callback: (device: BluetoothDevice) => void,
  ): void {
    this.disconnectListeners.add(callback);
  }

  removeEventListener(
    _event: "disconnected",
    callback: (device: BluetoothDevice) => void,
  ): void {
    this.disconnectListeners.delete(callback);
  }

  private onDeviceDisconnected = (event: Event) => {
    const target = event.target;
    if (target && typeof target === "object" && "device" in target) {
      const device = (target as any).device;
      if (device?.id) {
        this.connectedDevices.delete(device);
        // Notify all disconnect listeners
        this.disconnectListeners.forEach((listener) => {
          listener(device);
        });
      }
    }
  };
}

export const bluetoothService = new WebBluetoothService();
