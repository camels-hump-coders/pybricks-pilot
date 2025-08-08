import {
  instrumentUserCode,
  type InstrumentationOptions,
} from "../utils/codeInstrumentation";
import {
  bluetoothService,
  PYBRICKS_COMMAND_EVENT_CHAR_UUID,
  PYBRICKS_HUB_CAPABILITIES_CHAR_UUID,
  PYBRICKS_SERVICE_UUID,
  type HubInfo,
} from "./bluetooth";
import { mpyCrossCompiler } from "./mpyCrossCompiler";

export interface ProgramStatus {
  running: boolean;
  error?: string;
  output?: string;
  statusFlags?: {
    batteryLowWarning: boolean;
    batteryCritical: boolean;
    batteryHighCurrent: boolean;
    bleAdvertising: boolean;
    powerButtonPressed: boolean;
    userProgramRunning: boolean;
    shutdownPending: boolean;
  };
  lastStatusUpdate?: number; // timestamp
  rawStatusCode?: number;
}

export interface TelemetryData {
  timestamp: number;
  type: string;
  // Hub data from PybricksPilot
  hub?: {
    battery?: {
      voltage: number;
      current: number;
    };
    imu?: {
      acceleration: [number, number, number];
      angular_velocity: [number, number, number];
      heading: number;
    };
    system?: {
      name: string;
    };
    gyro?: {
      angle: number;
      speed?: number;
    };
  };
  // Motor data from PybricksPilot - keyed by motor name
  motors?: {
    [name: string]: {
      angle: number;
      speed: number;
      load?: number;
      error?: string;
    };
  };
  // Sensor data from PybricksPilot - keyed by sensor name
  sensors?: {
    [name: string]: {
      type: string;
      color?: any;
      reflection?: number;
      ambient?: number;
      distance?: number;
      force?: number;
      pressed?: boolean;
      angle?: number;
      speed?: number;
      value?: any;
      error?: string;
    };
  };
  // Drivebase data from PybricksPilot
  drivebase?: {
    distance: number;
    angle: number;
    state?: {
      distance: number;
      drive_speed: number;
      angle: number;
      turn_rate: number;
    };
    error?: string;
  };
}

// Pybricks Protocol Commands (based on official spec)
export enum PybricksCommand {
  STOP_USER_PROGRAM = 0,
  START_USER_PROGRAM = 1,
  START_REPL = 2,
  WRITE_USER_PROGRAM_METADATA = 3,
  WRITE_USER_RAM = 4,
  REBOOT_TO_UPDATE_MODE = 5,
  WRITE_STDIN = 6,
  // Additional commands for REPL mode
  REPL_EXECUTE = 7,
}

// Pybricks Protocol Events
export enum PybricksEvent {
  STATUS_REPORT = 0,
  WRITE_STDOUT = 1,
  COMMAND_ACKNOWLEDGMENT = 2, // Command acknowledgment responses
}

export interface PybricksStatusReport {
  status: number;
  metadata: {
    length: number;
    checksum: number;
  };
}

export interface DebugEvent {
  timestamp: number;
  type: "connection" | "upload" | "program" | "status" | "error" | "command";
  message: string;
  details?: Record<string, any>;
}

export class PybricksHubService extends EventTarget {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private rxCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private messageBuffer = "";
  private outputLineBuffer = ""; // Buffer for accumulating complete output lines
  private responseCallbacks = new Map<string, (response: any) => void>();
  private currentSelectedSlot: number = 0;
  private currentRunningProgId: number = 0;
  private maxBleWriteSize: number = 20; // Default minimum BLE size, will be updated from hub capabilities
  private maxUserProgramSize: number = 0; // Will be updated from hub capabilities
  // Note: Pybricks uses writeValueWithoutResponse, so we rely on BLE write completion
  // rather than explicit command acknowledgments

  // Instrumentation settings
  private instrumentationEnabled = true;
  private instrumentationOptions: InstrumentationOptions = {
    enableTelemetry: true,
    telemetryInterval: 100,
    enableRemoteControl: true,
    autoDetectHardware: true,
    debugMode: false,
  };

  constructor() {
    super();
  }

  async requestAndConnect(): Promise<HubInfo | null> {
    try {
      this.emitDebugEvent("connection", "Requesting hub connection...");
      this.device = await bluetoothService.requestDevice();
      if (!this.device) {
        this.emitDebugEvent("connection", "No hub selected");
        return null;
      }

      this.emitDebugEvent("connection", "Connecting to hub", {
        deviceName: this.device.name,
      });
      this.server = await bluetoothService.connect(this.device);
      await this.setupCommunication();

      const hubInfo = await bluetoothService.getHubInfo(this.server);
      this.emitDebugEvent("connection", "Hub connected successfully", hubInfo);
      return hubInfo;
    } catch (error) {
      this.emitDebugEvent("error", "Failed to connect to hub", {
        error: error.message,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.emitDebugEvent("connection", "Disconnecting from hub...");

    if (this.server) {
      await bluetoothService.disconnect(this.server);
      this.server = null;
    }
    this.device = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.messageBuffer = "";
    this.outputLineBuffer = "";
    this.responseCallbacks.clear();

    this.emitDebugEvent("connection", "Disconnected from hub");
  }

  isConnected(): boolean {
    return this.device ? bluetoothService.isConnected(this.device) : false;
  }

  setInstrumentationEnabled(enabled: boolean): void {
    this.instrumentationEnabled = enabled;
    this.emitDebugEvent(
      "status",
      `Instrumentation ${enabled ? "enabled" : "disabled"}`
    );
  }

  setInstrumentationOptions(options: Partial<InstrumentationOptions>): void {
    this.instrumentationOptions = {
      ...this.instrumentationOptions,
      ...options,
    };
    this.emitDebugEvent(
      "status",
      "Instrumentation options updated",
      this.instrumentationOptions
    );
  }

  getInstrumentationOptions(): InstrumentationOptions {
    return { ...this.instrumentationOptions };
  }

  async uploadProgram(pythonCode: string): Promise<void> {
    let codeToCompile = pythonCode;

    // Auto-instrument the code if enabled
    if (this.instrumentationEnabled) {
      this.emitDebugEvent(
        "upload",
        "Instrumenting user code with PybricksPilot"
      );
      const instrumentation = instrumentUserCode(
        pythonCode,
        this.instrumentationOptions
      );
      codeToCompile = instrumentation.instrumentedCode;

      this.emitDebugEvent("upload", "Code instrumentation complete", {
        originalSize: pythonCode.length,
        instrumentedSize: codeToCompile.length,
        injectedModuleSize: instrumentation.injectedModuleSize,
        analysis: instrumentation.analysis,
      });
    }

    // Compile Python code to MicroPython multi-file format
    // Use 'test.py' as filename to match Pybricks exactly
    const compilationResult = await mpyCrossCompiler.compileToBytecode(
      "test.py",
      codeToCompile
    );

    if (!compilationResult.success || !compilationResult.file) {
      throw new Error(
        `Compilation failed: ${compilationResult.error || "Unknown error"}`
      );
    }

    // Upload the compiled multi-file blob to the hub using Pybricks flow
    await this.uploadCompiledProgramPybricksFlow(compilationResult.file, false);
  }

  async uploadAndRunProgram(pythonCode: string): Promise<void> {
    this.emitDebugEvent("upload", "Starting program compilation", {
      codeLength: pythonCode.length,
    });

    let codeToCompile = pythonCode;

    // Auto-instrument the code if enabled
    if (this.instrumentationEnabled) {
      this.emitDebugEvent(
        "upload",
        "Instrumenting user code with PybricksPilot"
      );
      const instrumentation = instrumentUserCode(
        pythonCode,
        this.instrumentationOptions
      );
      codeToCompile = instrumentation.instrumentedCode;

      this.emitDebugEvent("upload", "Code instrumentation complete", {
        originalSize: pythonCode.length,
        instrumentedSize: codeToCompile.length,
        injectedModuleSize: instrumentation.injectedModuleSize,
        analysis: instrumentation.analysis,
      });
    }

    // Compile Python code to MicroPython multi-file format
    // Use 'test.py' as filename to match Pybricks exactly
    const compilationResult = await mpyCrossCompiler.compileToBytecode(
      "test.py",
      codeToCompile
    );

    if (!compilationResult.success || !compilationResult.file) {
      this.emitDebugEvent("error", "Compilation failed", {
        error: compilationResult.error,
      });
      throw new Error(
        `Compilation failed: ${compilationResult.error || "Unknown error"}`
      );
    }

    this.emitDebugEvent("upload", "Compilation successful", {
      size: compilationResult.file.size,
    });

    // Upload and immediately run - atomic operation like Pybricks Code
    await this.uploadCompiledProgramPybricksFlow(compilationResult.file, true);
  }

  private async uploadCompiledProgramPybricksFlow(
    programBlob: Blob,
    shouldRun: boolean = false
  ): Promise<void> {
    this.emitDebugEvent(
      "upload",
      `Starting upload (${programBlob.size} bytes)`,
      { shouldRun }
    );

    // Step 0: Stop any running program first
    try {
      await this.stopProgram();
      this.emitDebugEvent("program", "Stopped existing program");
      // Wait for the program to stop and clear any cache
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      // Ignore - program may not be running
    }

    // Step 1: Write metadata with size 0 to invalidate any existing user program
    try {
      // Try multiple invalidation attempts to ensure cache is cleared
      await this.writeUserProgramMetadataWithConfirmation(0);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Second invalidation for good measure
      await this.writeUserProgramMetadataWithConfirmation(0);
      this.emitDebugEvent("upload", "Program invalidated");
    } catch (error) {
      this.emitDebugEvent("error", "Program invalidation failed", {
        error: error.message,
      });
      throw new Error(`Program invalidation failed: ${error.message}`);
    }

    // Step 2: Upload program data in chunks
    // Use the max write size from hub capabilities, minus 5 bytes for command header
    const chunkSize = Math.max(this.maxBleWriteSize - 5, 15); // Minimum 15 bytes per chunk
    const totalChunks = Math.ceil(programBlob.size / chunkSize);
    let totalUploaded = 0;

    this.emitDebugEvent("upload", `Uploading in ${totalChunks} chunks`, {
      chunkSize,
    });

    for (let i = 0; i < programBlob.size; i += chunkSize) {
      const chunk = programBlob.slice(i, i + chunkSize);
      const chunkData = await chunk.arrayBuffer();
      const chunkBytes = new Uint8Array(chunkData);
      const chunkIndex = Math.floor(i / chunkSize) + 1;

      try {
        // Use confirmation method like Pybricks does - wait for each chunk to be confirmed
        await this.writeUserRAMAtOffsetWithConfirmation(chunkBytes, i);
        totalUploaded += chunkData.byteLength;

        if (chunkIndex % 10 === 0 || chunkIndex === totalChunks) {
          this.emitDebugEvent(
            "upload",
            `Progress: chunk ${chunkIndex}/${totalChunks}`,
            { bytesUploaded: totalUploaded }
          );
        }
      } catch (error) {
        this.emitDebugEvent("error", `Chunk ${chunkIndex} upload failed`, {
          offset: i,
          error: error.message,
        });
        throw new Error(`Chunk upload failed at offset ${i}: ${error.message}`);
      }
    }

    // Step 3: Write metadata with actual size to validate the program
    try {
      await this.writeUserProgramMetadataWithConfirmation(programBlob.size);
      this.emitDebugEvent("upload", "Program validated successfully");
    } catch (error) {
      this.emitDebugEvent("error", "Program validation failed", {
        error: error.message,
      });
      throw new Error(`Program validation failed: ${error.message}`);
    }

    // Step 4: If shouldRun, immediately start the program (atomic like Pybricks Code)
    if (shouldRun) {
      // Use the same slot that the button uses
      const programId = this.currentSelectedSlot; // Should be 0 based on status reports

      try {
        this.emitDebugEvent("program", "Starting program", { programId });
        await this.sendStartUserProgramCommandWithConfirmation(programId);

        // Wait a moment for program to start
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.emitDebugEvent("upload", "Upload and run completed successfully");
      } catch (error) {
        this.emitDebugEvent("error", "Failed to start program", {
          error: error.message,
        });
        throw new Error(`Failed to start program: ${error.message}`);
      }
    } else {
      this.emitDebugEvent("upload", "Upload completed successfully");
    }
  }

  private async executeViaREPL(pythonCode: string): Promise<void> {
    // Start REPL mode
    await this.sendBinaryCommand(PybricksCommand.START_REPL);

    // Wait for REPL to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Remove shebang if present
    pythonCode = pythonCode.replace(/^#!.*\n/, "");

    // For REPL execution, we'll send the entire code block as a single paste operation
    // This approach handles indentation correctly and executes the code as a block

    // Method 1: Try direct code execution
    // Send the code as one block, then execute with Ctrl-D
    const codeWithNewline = pythonCode + "\n";
    const encodedCode = new TextEncoder().encode(codeWithNewline);

    await this.writeStdin(encodedCode);

    // Small delay to let the code be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send double Enter to ensure we're at a clean prompt, then Ctrl-D to execute
    const enterEnter = new TextEncoder().encode("\n\n");
    await this.writeStdin(enterEnter);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const ctrlD = new TextEncoder().encode("\x04");
    await this.writeStdin(ctrlD);
  }

  async runProgram(programId: number = 0): Promise<void> {
    this.emitDebugEvent("program", "Starting user program", { programId });
    await this.sendStartUserProgramCommand(programId);
    this.emitDebugEvent("program", "Start program command sent", { programId });
  }

  async stopProgram(): Promise<void> {
    this.emitDebugEvent("program", "Stopping user program");
    await this.sendBinaryCommand(PybricksCommand.STOP_USER_PROGRAM);
    this.emitDebugEvent("program", "Stop program command sent");
  }

  async sendControlCommand(commandData: string): Promise<void> {
    // Send data to stdin for program interaction
    const data = new TextEncoder().encode(commandData + "\n");
    await this.writeStdin(data);
  }

  private calculateChecksum(data: Uint8Array): number {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum = (checksum + data[i]) & 0xffffffff;
    }
    return checksum;
  }

  private async writeUserProgramMetadata(
    size: number,
    _checksum?: number // Keep for compatibility but don't use
  ): Promise<void> {
    // Match Pybricks Code exactly: only send command + size (5 bytes total)
    const payload = new Uint8Array(5);
    const view = new DataView(payload.buffer);

    view.setUint8(0, PybricksCommand.WRITE_USER_PROGRAM_METADATA);
    view.setUint32(1, size, true); // little endian

    await this.sendRawData(payload);
  }

  private async writeUserProgramMetadataWithConfirmation(
    size: number,
    _checksum?: number // Keep for compatibility but don't use
  ): Promise<void> {
    // Match Pybricks Code exactly: only send command + size (5 bytes total)
    const payload = new Uint8Array(5);
    const view = new DataView(payload.buffer);

    view.setUint8(0, PybricksCommand.WRITE_USER_PROGRAM_METADATA);
    view.setUint32(1, size, true); // little endian

    await this.sendCommandWithConfirmation(payload);
  }

  private async writeUserRAMAtOffset(
    data: Uint8Array,
    offset: number
  ): Promise<void> {
    // Write data to user RAM at specific offset - matches Pybricks Code exactly
    const payload = new Uint8Array(5 + data.length);
    const view = new DataView(payload.buffer);

    view.setUint8(0, PybricksCommand.WRITE_USER_RAM);
    view.setUint32(1, offset, true); // little endian
    payload.set(data, 5);

    await this.sendRawData(payload);
  }

  private async writeUserRAMAtOffsetWithConfirmation(
    data: Uint8Array,
    offset: number
  ): Promise<void> {
    // Write data to user RAM at specific offset with confirmation like Pybricks
    const payload = new Uint8Array(5 + data.length);
    const view = new DataView(payload.buffer);

    view.setUint8(0, PybricksCommand.WRITE_USER_RAM);
    view.setUint32(1, offset, true); // little endian
    payload.set(data, 5);

    await this.sendCommandWithConfirmation(payload);
  }

  private async writeStdin(data: Uint8Array): Promise<void> {
    // BLE has a 512-byte limit, leaving room for command byte
    const MAX_CHUNK_SIZE = 511;
    let offset = 0;

    while (offset < data.length) {
      const chunkSize = Math.min(MAX_CHUNK_SIZE, data.length - offset);
      const payload = new Uint8Array(1 + chunkSize);
      payload[0] = PybricksCommand.WRITE_STDIN;
      payload.set(data.slice(offset, offset + chunkSize), 1);

      await this.sendRawData(payload);
      offset += chunkSize;

      // Small delay between chunks if needed
      if (offset < data.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  private async sendBinaryCommand(command: PybricksCommand): Promise<void> {
    const payload = new Uint8Array(1);
    payload[0] = command;
    await this.sendRawData(payload);
  }

  private async sendCommandWithConfirmation(
    payload: Uint8Array,
    timeoutMs: number = 5000
  ): Promise<void> {
    try {
      // Send the command and wait for BLE write to complete
      await this.sendRawData(payload);

      // For critical commands, add a small processing delay
      // This ensures proper command sequencing like Pybricks does
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      throw error;
    }
  }

  // Command acknowledgments are not explicitly used in this implementation
  // since Pybricks uses writeValueWithoutResponse and relies on BLE write completion

  private async sendStartUserProgramCommand(programId: number): Promise<void> {
    // Create START_USER_PROGRAM command with program ID
    // Format: [CommandType, ProgramId]
    const payload = new Uint8Array(2);
    payload[0] = PybricksCommand.START_USER_PROGRAM;
    payload[1] = programId;
    await this.sendRawData(payload);
  }

  private async sendStartUserProgramCommandWithConfirmation(
    programId: number
  ): Promise<void> {
    // Create START_USER_PROGRAM command with program ID
    // Format: [CommandType, ProgramId]
    const payload = new Uint8Array(2);
    payload[0] = PybricksCommand.START_USER_PROGRAM;
    payload[1] = programId;
    await this.sendCommandWithConfirmation(payload);
  }

  // EventTarget-based event listeners - no need for manual methods
  // Use addEventListener('telemetry', callback) instead
  // Use addEventListener('statusChange', callback) instead
  // Use addEventListener('debugEvent', callback) instead

  private emitDebugEvent(
    type: DebugEvent["type"],
    message: string,
    details?: Record<string, any>
  ): void {
    const debugEvent: DebugEvent = {
      timestamp: Date.now(),
      type,
      message,
      details,
    };

    const customEvent = new CustomEvent("debugEvent", {
      detail: debugEvent,
    });
    this.dispatchEvent(customEvent);
  }

  private async setupCommunication(): Promise<void> {
    if (!this.server) throw new Error("Server not connected");

    this.emitDebugEvent(
      "connection",
      "Setting up Pybricks service communication"
    );

    const pybricksService = await this.server.getPrimaryService(
      PYBRICKS_SERVICE_UUID
    );
    this.emitDebugEvent("connection", "Pybricks service found");

    this.txCharacteristic = await bluetoothService.getCharacteristic(
      pybricksService,
      PYBRICKS_COMMAND_EVENT_CHAR_UUID
    );

    this.rxCharacteristic = await bluetoothService.getCharacteristic(
      pybricksService,
      PYBRICKS_COMMAND_EVENT_CHAR_UUID
    );

    // Debug: Log characteristic properties
    const charProps = {
      write: this.txCharacteristic.properties.write,
      writeWithoutResponse:
        this.txCharacteristic.properties.writeWithoutResponse,
      read: this.txCharacteristic.properties.read,
      notify: this.txCharacteristic.properties.notify,
      indicate: this.txCharacteristic.properties.indicate,
    };

    this.emitDebugEvent(
      "connection",
      "Command/Event characteristic configured",
      { properties: charProps }
    );

    // Read hub capabilities to get max write size and max program size
    try {
      const hubCapabilitiesChar = await bluetoothService.getCharacteristic(
        pybricksService,
        PYBRICKS_HUB_CAPABILITIES_CHAR_UUID
      );

      const capabilitiesData =
        await bluetoothService.readData(hubCapabilitiesChar);

      // Parse hub capabilities according to Pybricks Profile v1.2.0+
      this.maxBleWriteSize = capabilitiesData.getUint16(0, true); // little-endian
      const flags = capabilitiesData.getUint32(2, true);
      this.maxUserProgramSize = capabilitiesData.getUint32(6, true);

      console.log("Hub capabilities:", {
        maxBleWriteSize: this.maxBleWriteSize,
        flags: `0x${flags.toString(16)}`,
        maxUserProgramSize: this.maxUserProgramSize,
      });
    } catch (error) {
      console.warn(
        "Failed to read hub capabilities (hub may be running older firmware):",
        error
      );
      // Fall back to safe defaults for older firmware
      this.maxBleWriteSize = 20;
      this.maxUserProgramSize = 32768; // 32KB default
    }

    await bluetoothService.subscribeToNotifications(
      this.rxCharacteristic,
      this.handleIncomingData.bind(this)
    );
  }

  private async sendRawData(data: Uint8Array): Promise<void> {
    if (!this.txCharacteristic) throw new Error("Not connected to hub");

    // Command sent via BLE

    await bluetoothService.writeData(
      this.txCharacteristic,
      data as BufferSource
    );
  }

  private handleIncomingData(data: DataView): void {
    if (data.byteLength === 0) return;

    const eventType = data.getUint8(0);

    switch (eventType) {
      case PybricksEvent.STATUS_REPORT:
        this.handleStatusReport(data);
        break;

      case PybricksEvent.WRITE_STDOUT:
        this.handleStdoutData(data);
        break;

      default:
        console.warn(
          "Unknown Pybricks event type:",
          eventType,
          "data length:",
          data.byteLength
        );

        // Try to decode as stdout in case the event types are different
        if (data.byteLength > 1) {
          this.handleStdoutData(data);
        }
        break;
    }
  }

  private handleStatusReport(data: DataView): void {
    if (data.byteLength < 2) {
      console.warn(
        "Status report too short, need at least 2 bytes (event + status)"
      );
      return;
    }

    const status = data.getUint8(1);
    const fullStatusFlags = data.getUint32(1, true); // Status is actually 4 bytes (flags)
    const runningProgId = data.byteLength > 5 ? data.getUint8(5) : 0;
    const selectedSlot = data.byteLength > 6 ? data.getUint8(6) : 0;
    const timestamp = Date.now();

    // Store current hub state
    this.currentRunningProgId = runningProgId;
    this.currentSelectedSlot = selectedSlot;

    // Interpret status as bit flags (Pybricks uses bit flags for status)
    // Bit 0 (0x01): Battery low voltage warning
    // Bit 1 (0x02): Battery critically low
    // Bit 2 (0x04): Battery high current
    // Bit 3 (0x08): BLE advertising
    // Bit 5 (0x20): Power button pressed
    // Bit 6 (0x40): User program running  <- This is 64!
    // Bit 7 (0x80): Hub will shut down

    const batteryLowWarning = (status & 0x01) !== 0;
    const batteryCritical = (status & 0x02) !== 0;
    const batteryHighCurrent = (status & 0x04) !== 0;
    const bleAdvertising = (status & 0x08) !== 0;
    const powerButtonPressed = (status & 0x20) !== 0;
    const userProgramRunning = (status & 0x40) !== 0; // Status 64 means program is running!
    const shutdownPending = (status & 0x80) !== 0;

    // Status tracking for internal use

    const statusFlags = {
      batteryLowWarning,
      batteryCritical,
      batteryHighCurrent,
      bleAdvertising,
      powerButtonPressed,
      userProgramRunning,
      shutdownPending,
    };

    // Status processed internally

    const statusUpdate: ProgramStatus = {
      running: userProgramRunning,
      statusFlags,
      lastStatusUpdate: timestamp,
      rawStatusCode: status,
    };

    if (batteryCritical) {
      statusUpdate.error = "Battery critically low";
    } else if (shutdownPending) {
      statusUpdate.error = "Hub shutting down";
    }

    const statusEvent = new CustomEvent("statusChange", {
      detail: statusUpdate,
    });
    this.dispatchEvent(statusEvent);
  }

  private handleStdoutData(data: DataView): void {
    if (data.byteLength <= 1) return;

    // Extract stdout data (skip the event type byte)
    const stdoutBytes = new Uint8Array(
      data.buffer,
      data.byteOffset + 1,
      data.byteLength - 1
    );
    const chunkText = new TextDecoder().decode(stdoutBytes);

    // Add chunk to line buffer
    this.outputLineBuffer += chunkText;

    // Process all complete lines in the buffer
    const lines = this.outputLineBuffer.split("\n");

    // Keep the last partial line in the buffer (if any)
    this.outputLineBuffer = lines.pop() || "";

    // Process each complete line
    for (const line of lines) {
      if (line.trim().length > 0) {
        this.processOutputLine(line.trim());
      }
    }
  }

  private processOutputLine(outputLine: string): void {
    // Try to parse as telemetry data if it looks like JSON
    if (outputLine.startsWith("{") && outputLine.endsWith("}")) {
      try {
        const telemetryData = JSON.parse(outputLine);
        // Check if it's telemetry data (has timestamp and type fields)
        if (telemetryData.timestamp && telemetryData.type === "telemetry") {
          if (window.DEBUG) {
            this.emitDebugEvent("telemetry", "Received telemetry data", {
              timestamp: telemetryData.timestamp,
              hasMotors: !!telemetryData.motors,
              hasSensors: !!telemetryData.sensors,
              hasHub: !!telemetryData.hub,
              hasDrivebase: !!telemetryData.drivebase,
            });
          }

          const telemetryEvent = new CustomEvent("telemetry", {
            detail: telemetryData,
          });
          this.dispatchEvent(telemetryEvent);
          return; // Don't treat as regular output
        }
      } catch (e) {
        // Not valid JSON, will be treated as regular output below
      }
    }

    if (window.DEBUG) {
      this.emitDebugEvent("program", "Program output", {
        output: outputLine,
      });
    }

    // Treat as regular program output
    const statusEvent = new CustomEvent("statusChange", {
      detail: { running: true, output: outputLine },
    });
    this.dispatchEvent(statusEvent);
  }
}

export const pybricksHubService = new PybricksHubService();
