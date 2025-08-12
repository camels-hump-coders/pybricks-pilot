import { EventTarget } from "../utils/eventTarget.js";

interface VirtualRobotConfig {
  name: string;
  batteryVoltage: number;
  batteryCurrent: number;
  imuHeading: number;
  motorCount: number;
  motorNames: string[];
  sensorCount: number;
  sensorNames: string[];
  drivebaseEnabled: boolean;
  telemetryInterval: number;
}

interface VirtualRobotState {
  // Simple accumulated values like real robot encoders
  driveDistance: number; // Total distance traveled (mm)
  driveAngle: number; // Total angle turned (degrees)
  heading: number; // Current heading (degrees)

  // Motor states
  motors: {
    [name: string]: {
      angle: number;
      speed: number;
      load: number;
    };
  };

  // Sensor states
  sensors: {
    [name: string]: {
      type: string;
      value: any;
    };
  };
}

class VirtualRobotService extends EventTarget {
  private config: VirtualRobotConfig;
  private state: VirtualRobotState;
  private telemetryInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private _isConnected = false;
  private programRunning = false;
  private lastTelemetryTime = 0;
  private abortController: AbortController = new AbortController();

  constructor(config: Partial<VirtualRobotConfig> = {}) {
    super();

    this.config = {
      name: "Virtual Robot",
      batteryVoltage: 8.4,
      batteryCurrent: 0.1,
      imuHeading: 0,
      motorCount: 4,
      motorNames: ["left", "right", "A", "B"],
      sensorCount: 2,
      sensorNames: ["color", "ultrasonic"],
      drivebaseEnabled: true,
      telemetryInterval: 100,
      ...config,
    };

    this.state = this.initializeState();
  }
  addEventListener(type: string, listener: EventListener): void {
    super.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    super.removeEventListener(type, listener);
  }

  private initializeState(): VirtualRobotState {
    const motors: { [name: string]: any } = {};
    const sensors: { [name: string]: any } = {};

    // Initialize motors
    for (let i = 0; i < this.config.motorCount; i++) {
      const motorName = this.config.motorNames[i] || `Motor${i}`;
      motors[motorName] = {
        angle: 0,
        speed: 0,
        load: 0,
      };
    }

    // Initialize sensors
    for (let i = 0; i < this.config.sensorCount; i++) {
      const sensorName = this.config.sensorNames[i] || `Sensor${i}`;
      if (sensorName === "color") {
        sensors[sensorName] = {
          type: "color",
          value: "white",
        };
      } else if (sensorName === "ultrasonic") {
        sensors[sensorName] = {
          type: "ultrasonic",
          value: 100,
        };
      } else {
        sensors[sensorName] = {
          type: "generic",
          value: 0,
        };
      }
    }

    return {
      driveDistance: 0, // Start at 0 distance
      driveAngle: 0, // Start at 0 angle
      heading: 0, // Start facing north
      motors,
      sensors,
    };
  }

  async connect(): Promise<{
    name: string;
    manufacturer: string;
    firmwareRevision: string;
    batteryLevel: number;
  }> {
    this._isConnected = true;
    this.isRunning = true; // Start telemetry immediately
    this.startTelemetry();

    // Send initial telemetry immediately to establish connection
    this.sendTelemetry();

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      name: this.config.name,
      manufacturer: "Virtual Robot Inc.",
      firmwareRevision: "1.0.0",
      batteryLevel: Math.round((this.config.batteryVoltage / 8.4) * 100),
    };
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.stopTelemetry();

    // Simulate disconnection delay
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  private startTelemetry(): void {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
    }

    this.telemetryInterval = setInterval(() => {
      if (this._isConnected && this.isRunning) {
        this.sendTelemetry();
      }
    }, this.config.telemetryInterval);
  }

  private stopTelemetry(): void {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }

  sendTelemetry(): void {
    const now = Date.now();
    if (now - this.lastTelemetryTime < this.config.telemetryInterval) {
      return;
    }
    this.lastTelemetryTime = now;

    const telemetry = {
      timestamp: now,
      type: "telemetry",
      hub: {
        battery: {
          voltage: this.config.batteryVoltage + (Math.random() - 0.5) * 0.1,
          current: this.config.batteryCurrent + (Math.random() - 0.5) * 0.05,
        },
        imu: {
          acceleration: [
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
          ],
          angular_velocity: [
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
          ],
          heading: this.state.heading,
        },
      },
      motors: this.state.motors,
      sensors: this.state.sensors,
      drivebase: {
        // Send accumulated values like real robot encoders
        distance: this.state.driveDistance,
        angle: this.state.driveAngle,
        state: {
          distance: this.state.driveDistance,
          drive_speed: this.state.driveDistance > 0 ? 100 : 0, // Indicate movement
          angle: this.state.driveAngle,
          turn_rate: this.state.driveAngle > 0 ? 50 : 0, // Indicate turning
        },
      },
    };

    // Dispatch telemetry event
    this.dispatchEvent(new CustomEvent("telemetry", { detail: telemetry }));
  }

  // Robot control methods
  async drive(distance: number, speed: number): Promise<void> {
    if (!this._isConnected) return;

    console.log(`[VirtualRobot] Drive command: ${distance}mm at ${speed}mm/s`);
    console.log(`[VirtualRobot] Starting position:`, this.getCurrentPosition());

    // Create a new abort controller for this command
    const signal = this.abortController.signal;

    const duration = (Math.abs(distance) / speed) * 1000; // Convert to milliseconds
    const startTime = Date.now();
    const initialDistance = this.state.driveDistance;

    try {
      // Simulate movement
      while (Date.now() - startTime < duration) {
        // Check if command was aborted
        if (signal.aborted) {
          console.log(`[VirtualRobot] Drive command aborted`);
          return;
        }

        const progress = (Date.now() - startTime) / duration;
        const currentDistance = distance * progress;

        // Update accumulated drive distance
        this.state.driveDistance = initialDistance + currentDistance;

        // Send telemetry more frequently during movement for smooth path tracking
        this.sendTelemetry();

        await new Promise((resolve) => setTimeout(resolve, 50)); // Update every 50ms
      }

      // Final update - complete the movement
      this.state.driveDistance = initialDistance + distance;

      // Send final telemetry
      this.sendTelemetry();

      console.log(
        `[VirtualRobot] Drive completed. Final position:`,
        this.getCurrentPosition()
      );
    } catch (error) {
      if (signal.aborted) {
        console.log(`[VirtualRobot] Drive command aborted`);
      } else {
        console.error(`[VirtualRobot] Drive command error:`, error);
      }
    }
  }

  async turn(angle: number, speed: number): Promise<void> {
    if (!this._isConnected) return;

    console.log(`[VirtualRobot] Turn command: ${angle}° at ${speed}°/s`);
    console.log(`[VirtualRobot] Starting position:`, this.getCurrentPosition());

    // Create a new abort controller for this command
    const signal = this.abortController.signal;

    const duration = (Math.abs(angle) / speed) * 1000; // Convert to milliseconds
    const startTime = Date.now();
    const initialAngle = this.state.driveAngle;
    const initialHeading = this.state.heading;

    try {
      // Simulate turning
      while (Date.now() - startTime < duration) {
        // Check if command was aborted
        if (signal.aborted) {
          console.log(`[VirtualRobot] Turn command aborted`);
          return;
        }

        const progress = (Date.now() - startTime) / duration;
        const currentAngle = angle * progress;

        // Update accumulated drive angle and heading
        this.state.driveAngle = initialAngle + currentAngle;
        this.state.heading = (initialHeading + currentAngle) % 360;
        this.config.imuHeading = this.state.heading;

        // Send telemetry more frequently during movement for smooth path tracking
        this.sendTelemetry();

        await new Promise((resolve) => setTimeout(resolve, 50)); // Update every 50ms
      }

      // Final update - complete the turn
      this.state.driveAngle = initialAngle + angle;
      this.state.heading = (initialHeading + angle) % 360;
      this.config.imuHeading = this.state.heading;

      // Send final telemetry
      this.sendTelemetry();

      console.log(
        `[VirtualRobot] Turn completed. Final position:`,
        this.getCurrentPosition()
      );
    } catch (error) {
      if (signal.aborted) {
        console.log(`[VirtualRobot] Turn command aborted`);
      } else {
        console.error(`[VirtualRobot] Turn command error:`, error);
      }
    }
  }

  async stop(): Promise<void> {
    if (!this._isConnected) return;

    console.log(`[VirtualRobot] Stop command received`);

    // Abort any running commands
    this.abortController.abort();

    // Create a fresh abort controller for future commands
    this.abortController = new AbortController();

    // Stop all motors
    Object.values(this.state.motors).forEach((motor) => {
      motor.speed = 0;
    });

    console.log(`[VirtualRobot] All movement stopped`);
  }

  async driveContinuous(speed: number, turnRate: number): Promise<void> {
    if (!this._isConnected) return;

    // Calculate movement based on speed and turn rate
    const deltaTime = 50; // 50ms intervals
    const deltaDistance = (speed * deltaTime) / 1000; // Convert to mm
    const deltaAngle = (turnRate * deltaTime) / 1000; // Convert to degrees

    console.log(
      `[VirtualRobot] Drive continuous: speed=${speed}mm/s, turnRate=${turnRate}°/s`
    );
    console.log(`[VirtualRobot] Starting position:`, this.getCurrentPosition());

    await new Promise((resolve) => setTimeout(resolve, deltaTime));

    const signal = this.abortController.signal;
    // Simulate continuous movement
    if (speed === 0 && turnRate === 0) {
      return;
    }

    (async () => {
      while (true) {
        if (signal.aborted) {
          console.log(`[VirtualRobot] Drive continuous command aborted`);
          return;
        }

        // Update accumulated drive values
        this.state.driveDistance += deltaDistance;
        this.state.driveAngle += deltaAngle;
        this.state.heading = (this.state.heading + deltaAngle) % 360;
        this.config.imuHeading = this.state.heading;

        // Send telemetry more frequently during continuous movement for smooth path tracking
        this.sendTelemetry();

        await new Promise((resolve) => setTimeout(resolve, deltaTime));
      }
    })();
  }

  async setMotorSpeed(motorName: string, speed: number): Promise<void> {
    if (!this._isConnected || !this.state.motors[motorName]) return;

    this.state.motors[motorName].speed = speed;

    // Simulate motor movement
    if (speed !== 0) {
      const duration = 1000; // 1 second
      const startTime = Date.now();

      while (
        Date.now() - startTime < duration &&
        this.state.motors[motorName].speed === speed
      ) {
        const progress = (Date.now() - startTime) / duration;
        this.state.motors[motorName].angle += speed * progress * 0.1; // Simulate angle change

        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  async setMotorAngle(
    motorName: string,
    angle: number,
    speed: number
  ): Promise<void> {
    if (!this._isConnected || !this.state.motors[motorName]) return;

    const currentAngle = this.state.motors[motorName].angle;
    const angleDiff = angle - currentAngle;
    const duration = (Math.abs(angleDiff) / speed) * 1000;
    const startTime = Date.now();

    // Simulate motor movement to target angle
    while (Date.now() - startTime < duration) {
      const progress = (Date.now() - startTime) / duration;
      // Only update the visual progress, don't change the actual angle until final
      this.state.motors[motorName].speed = speed;

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Final position - only update once at the end
    this.state.motors[motorName].angle = angle;
    this.state.motors[motorName].speed = 0;
  }

  // Get current position for debugging
  getCurrentPosition() {
    return {
      driveDistance: this.state.driveDistance,
      driveAngle: this.state.driveAngle,
      heading: this.state.heading,
    };
  }

  // Reset position to relative origin
  resetPosition(): void {
    this.state.driveDistance = 0; // Reset accumulated distance
    this.state.driveAngle = 0; // Reset accumulated angle
    this.state.heading = 0; // Reset heading to north
    this.config.imuHeading = 0;
    console.log(
      "[VirtualRobot] Position reset to relative origin:",
      this.getCurrentPosition()
    );
  }

  // Set position to specific coordinates (this is called by UI to sync with mat position)
  setPosition(x: number, y: number, heading: number): void {
    // The UI provides absolute mat coordinates, but the virtual robot works with relative coordinates
    // We'll reset to relative origin and let the UI handle the transformation
    this.state.driveDistance = 0; // Reset accumulated distance
    this.state.driveAngle = 0; // Reset accumulated angle
    this.state.heading = heading; // Set new heading
    this.config.imuHeading = heading;
    console.log(
      "[VirtualRobot] Position synced with UI, working from relative origin:",
      this.getCurrentPosition()
    );
  }

  // Get full robot state
  getState(): VirtualRobotState {
    return this.state;
  }

  // Program management
  async uploadProgram(code: string): Promise<void> {
    if (!this._isConnected) return;

    // Simulate upload delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Dispatch status change event
    this.dispatchEvent(
      new CustomEvent("statusChange", {
        detail: { running: false, output: "Program uploaded successfully" },
      })
    );
  }

  async runProgram(): Promise<void> {
    if (!this._isConnected) return;

    this.programRunning = true;
    this.isRunning = true;

    // Dispatch status change event
    this.dispatchEvent(
      new CustomEvent("statusChange", {
        detail: { running: true, output: "Program started" },
      })
    );
  }

  async stopProgram(): Promise<void> {
    if (!this._isConnected) return;

    this.programRunning = false;
    this.isRunning = false;

    // Stop all movement
    await this.stop();

    // Dispatch status change event
    this.dispatchEvent(
      new CustomEvent("statusChange", {
        detail: { running: false, output: "Program stopped" },
      })
    );
  }

  getCapabilities(): any {
    return {
      maxMotorCount: this.config.motorCount,
      maxSensorCount: this.config.sensorCount,
      drivebaseSupported: this.config.drivebaseEnabled,
      imuSupported: true,
      batteryMonitoring: true,
      programStorage: true,
    };
  }

  getRobotType(): "real" | "virtual" {
    return "virtual";
  }
}

// Export singleton instance
export const virtualRobotService = new VirtualRobotService();
