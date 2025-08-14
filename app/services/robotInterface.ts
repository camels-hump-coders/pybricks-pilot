import type { HubInfo } from "./bluetooth";

interface RobotInterface {
  // Connection management
  connect(): Promise<HubInfo>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Program management
  runProgram(): Promise<void>;
  stopProgram(): Promise<void>;

  // Robot control
  drive(distance: number, speed: number): Promise<void>;
  turn(angle: number, speed: number): Promise<void>;
  stop(): Promise<void>;
  driveContinuous(speed: number, turnRate: number): Promise<void>;
  setMotorSpeed(motorName: string, speed: number): Promise<void>;
  setMotorAngle(motorName: string, angle: number, speed: number): Promise<void>;
  sendControlCommand(command: string): Promise<void>;

  // Event handling
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;

  // Status and capabilities
  getRobotType(): "real" | "virtual" | null;
  getCapabilities(): RobotCapabilities;
}

interface RobotCapabilities {
  maxMotorCount: number;
  maxSensorCount: number;
  drivebaseSupported: boolean;
  imuSupported: boolean;
  batteryMonitoring: boolean;
  programStorage: boolean;
}

export interface RobotConnectionOptions {
  robotType: "real" | "virtual";
}

class RobotConnectionManager {
  private currentRobot: RobotInterface | null = null;
  private robotType: "real" | "virtual" | null = null;
  private eventListeners = new Map<string, Set<EventListener>>();

  constructor() {
    // Set up global event listeners that will be forwarded to the current robot
    this.setupGlobalEventListeners();
  }

  private setupGlobalEventListeners(): void {
    // Only set up event listeners in the browser
    if (typeof document === "undefined") {
      return;
    }

    // Forward events from the current robot to global listeners
    const forwardEvent = (event: Event) => {
      const listeners = this.eventListeners.get(event.type);
      if (listeners) {
        listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error) {
            console.error("Error in robot event listener:", error);
          }
        });
      }
    };

    // Listen for robot events and forward them
    ["telemetry", "statusChange", "debugEvent"].forEach((eventType) => {
      document.addEventListener(eventType, forwardEvent);
    });
  }

  async connect(options: RobotConnectionOptions): Promise<HubInfo> {
    // Disconnect current robot if any
    if (this.currentRobot) {
      await this.disconnect();
    }

    this.robotType = options.robotType;

    if (options.robotType === "virtual") {
      // Import and use virtual robot
      const { virtualRobotService } = await import("./virtualRobot");

      this.currentRobot = virtualRobotService;
    } else {
      // Import and use real PyBricks hub
      const { pybricksHubService } = await import("./pybricksHub");
      this.currentRobot = pybricksHubService;
    }

    // Connect to the selected robot
    if (!this.currentRobot) {
      throw new Error("Failed to initialize robot service");
    }

    const hubInfo = await this.currentRobot.connect();

    // Set up event forwarding from the robot to global listeners
    this.setupRobotEventForwarding();

    return hubInfo;
  }

  async disconnect(): Promise<void> {
    if (this.currentRobot) {
      await this.currentRobot.disconnect();
      this.currentRobot = null;
    }
    // Reset robot type to null when disconnecting
    this.robotType = null;
  }

  isConnected(): boolean {
    return this.currentRobot?.isConnected() || false;
  }

  getCurrentRobot(): RobotInterface | null {
    return this.currentRobot;
  }

  getRobotType(): "real" | "virtual" | null {
    return this.robotType;
  }

  private setupRobotEventForwarding(): void {
    if (!this.currentRobot) return;

    // Only set up event forwarding in the browser
    if (typeof document === "undefined") {
      return;
    }

    // Forward robot events to global listeners
    ["telemetry", "statusChange", "debugEvent"].forEach((eventType) => {
      const listener = (event: Event) => {
        // Create a new event that can be dispatched globally
        const globalEvent = new CustomEvent(eventType, {
          detail: (event as CustomEvent).detail,
        });
        document.dispatchEvent(globalEvent);
      };

      this.currentRobot!.addEventListener(eventType, listener);
    });
  }

  async runProgram(): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.runProgram();
  }

  async stopProgram(): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.stopProgram();
  }

  async drive(distance: number, speed: number): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.drive(distance, speed);
  }

  async turn(angle: number, speed: number): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.turn(angle, speed);
  }

  async stop(): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.stop();
  }

  async driveContinuous(speed: number, turnRate: number): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.driveContinuous(speed, turnRate);
  }

  async setMotorSpeed(motorName: string, speed: number): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.setMotorSpeed(motorName, speed);
  }

  async setMotorAngle(
    motorName: string,
    angle: number,
    speed: number
  ): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.setMotorAngle(motorName, angle, speed);
  }

  async sendControlCommand(command: string): Promise<void> {
    if (!this.currentRobot) throw new Error("No robot connected");
    return this.currentRobot.sendControlCommand(command);
  }

  // Global event listener management
  addEventListener(type: string, listener: EventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  // Get robot capabilities
  getCapabilities(): RobotCapabilities {
    if (!this.currentRobot) {
      return {
        maxMotorCount: 0,
        maxSensorCount: 0,
        drivebaseSupported: false,
        imuSupported: false,
        batteryMonitoring: false,
        programStorage: false,
      };
    }
    return this.currentRobot.getCapabilities();
  }

  // Virtual robot specific methods
  async resetVirtualRobotPosition(): Promise<void> {
    if (this.robotType === "virtual" && this.currentRobot) {
      const virtualRobot = this.currentRobot as any;
      if (typeof virtualRobot.resetPosition === "function") {
        virtualRobot.resetPosition();
      }
    }
  }

  async setVirtualRobotPosition(
    x: number,
    y: number,
    heading: number
  ): Promise<void> {
    if (this.robotType === "virtual" && this.currentRobot) {
      const virtualRobot = this.currentRobot as any;
      if (typeof virtualRobot.setPosition === "function") {
        virtualRobot.setPosition(x, y, heading);
      }
    }
  }

  getVirtualRobotState(): any {
    if (this.robotType === "virtual" && this.currentRobot) {
      const virtualRobot = this.currentRobot as any;
      if (typeof virtualRobot.getState === "function") {
        return virtualRobot.getState();
      }
    }
    return null;
  }
}

// Export singleton instance
export const robotConnectionManager = new RobotConnectionManager();
