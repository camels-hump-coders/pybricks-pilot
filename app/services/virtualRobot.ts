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
  robotConfig?: {
    dimensions: { width: number; length: number };
    centerOfRotation: {
      distanceFromLeftEdge: number;
      distanceFromTop: number;
    };
  };
}

interface VirtualRobotState {
  // Simple accumulated values like real robot encoders
  driveDistance: number; // Total distance traveled (mm)
  driveAngle: number; // Total angle turned (degrees)
  heading: number; // Current heading (degrees)
  x: number; // Current X position (mm)
  y: number; // Current Y position (mm)

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
      x: 0, // Start at (0, 0)
      y: 0,
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

  // Configuration methods
  updateRobotConfig(config: {
    dimensions: { width: number; length: number };
    centerOfRotation: {
      distanceFromLeftEdge: number;
      distanceFromTop: number;
    };
  }): void {
    this.config.robotConfig = config;
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
    const initialX = this.state.x;
    const initialY = this.state.y;

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

        // Update position based on current heading and distance traveled
        const headingRad = (this.state.heading * Math.PI) / 180;
        this.state.x = initialX + currentDistance * Math.sin(headingRad);
        // COORDINATE SYSTEM FIX: Match the telemetry processing expectations
        // The telemetry processing expects the raw robot data to use the opposite convention
        // So positive distance at heading=0° should INCREASE Y in robot coordinates
        this.state.y = initialY + currentDistance * Math.cos(headingRad);

        // Send telemetry more frequently during movement for smooth path tracking
        this.sendTelemetry();

        await new Promise((resolve) => setTimeout(resolve, 100)); // Update every 100ms
      }

      // Final update - complete the movement
      this.state.driveDistance = initialDistance + distance;

      // Final position update
      const headingRad = (this.state.heading * Math.PI) / 180;
      this.state.x = initialX + distance * Math.sin(headingRad);
      // COORDINATE SYSTEM FIX: Match the telemetry processing expectations
      // The telemetry processing expects positive distance at heading=0° to INCREASE Y
      this.state.y = initialY + distance * Math.cos(headingRad);

      // Send final telemetry
      this.sendTelemetry();

      console.log(
        `[VirtualRobot] Drive completed. Final position:`,
        this.getCurrentPosition(),
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
    const initialX = this.state.x;
    const initialY = this.state.y;

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

        // Apply center of rotation kinematics if we have robot config
        if (this.config.robotConfig && Math.abs(currentAngle) > 0.1) {
          // Calculate center of rotation offset from robot center (in mm)
          // STANDARDIZED COORDINATE SYSTEM: Use robot's internal coordinate system consistently
          // Robot internal coordinates: Y=0 at top, Y+ points down
          const robotCenterX = this.config.robotConfig.dimensions.width / 2; // Center of robot width in studs
          const robotCenterY = this.config.robotConfig.dimensions.length / 2; // Center of robot length in studs
          const centerOfRotationX =
            this.config.robotConfig.centerOfRotation.distanceFromLeftEdge; // In studs from left edge
          const centerOfRotationY =
            this.config.robotConfig.centerOfRotation.distanceFromTop; // In studs from top edge

          const centerOffsetX = (centerOfRotationX - robotCenterX) * 8; // Convert studs to mm
          const centerOffsetY = (centerOfRotationY - robotCenterY) * 8; // Convert studs to mm

          // Calculate center of rotation position in world coordinates before turn
          const beforeHeadingRad = (initialHeading * Math.PI) / 180;
          const corWorldX =
            initialX +
            centerOffsetX * Math.cos(beforeHeadingRad) -
            centerOffsetY * Math.sin(beforeHeadingRad);
          const corWorldY =
            initialY +
            centerOffsetX * Math.sin(beforeHeadingRad) +
            centerOffsetY * Math.cos(beforeHeadingRad);

          // Calculate new robot center position after rotation around center of rotation
          const afterHeadingRad = (this.state.heading * Math.PI) / 180;
          this.state.x =
            corWorldX -
            centerOffsetX * Math.cos(afterHeadingRad) +
            centerOffsetY * Math.sin(afterHeadingRad);
          this.state.y =
            corWorldY -
            centerOffsetX * Math.sin(afterHeadingRad) -
            centerOffsetY * Math.cos(afterHeadingRad);
        }

        // Send telemetry more frequently during movement for smooth path tracking
        this.sendTelemetry();

        await new Promise((resolve) => setTimeout(resolve, 50)); // Update every 50ms
      }

      // Final update - complete the turn
      this.state.driveAngle = initialAngle + angle;
      this.state.heading = (initialHeading + angle) % 360;
      this.config.imuHeading = this.state.heading;

      // Apply final center of rotation kinematics
      if (this.config.robotConfig && Math.abs(angle) > 0.1) {
        const robotCenterX = this.config.robotConfig.dimensions.width / 2;
        const robotCenterY = this.config.robotConfig.dimensions.length / 2;
        const centerOfRotationX =
          this.config.robotConfig.centerOfRotation.distanceFromLeftEdge;
        const centerOfRotationY =
          this.config.robotConfig.centerOfRotation.distanceFromTop;

        const centerOffsetX = (centerOfRotationX - robotCenterX) * 8;
        const centerOffsetY = (centerOfRotationY - robotCenterY) * 8;

        const beforeHeadingRad = (initialHeading * Math.PI) / 180;
        const corWorldX =
          initialX +
          centerOffsetX * Math.cos(beforeHeadingRad) -
          centerOffsetY * Math.sin(beforeHeadingRad);
        const corWorldY =
          initialY +
          centerOffsetX * Math.sin(beforeHeadingRad) +
          centerOffsetY * Math.cos(beforeHeadingRad);

        const afterHeadingRad = (this.state.heading * Math.PI) / 180;
        this.state.x =
          corWorldX -
          centerOffsetX * Math.cos(afterHeadingRad) +
          centerOffsetY * Math.sin(afterHeadingRad);
        this.state.y =
          corWorldY -
          centerOffsetX * Math.sin(afterHeadingRad) -
          centerOffsetY * Math.cos(afterHeadingRad);
      }

      // Send final telemetry
      this.sendTelemetry();

      console.log(
        `[VirtualRobot] Turn completed. Final position:`,
        this.getCurrentPosition(),
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
      `[VirtualRobot] Drive continuous: speed=${speed}mm/s, turnRate=${turnRate}°/s`,
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

        // Update position based on movement
        if (Math.abs(deltaDistance) > 0.001) {
          // Forward/backward movement
          const headingRad = (this.state.heading * Math.PI) / 180;
          this.state.x += deltaDistance * Math.sin(headingRad);
          // COORDINATE SYSTEM FIX: Match the telemetry processing expectations
          // The telemetry processing expects positive distance at heading=0° to INCREASE Y
          this.state.y += deltaDistance * Math.cos(headingRad);
        }

        if (Math.abs(deltaAngle) > 0.001 && this.config.robotConfig) {
          // Turning movement with center of rotation kinematics
          const robotCenterX = this.config.robotConfig.dimensions.width / 2;
          const robotCenterY = this.config.robotConfig.dimensions.length / 2;
          const centerOfRotationX =
            this.config.robotConfig.centerOfRotation.distanceFromLeftEdge;
          const centerOfRotationY =
            this.config.robotConfig.centerOfRotation.distanceFromTop;

          const centerOffsetX = (centerOfRotationX - robotCenterX) * 8;
          const centerOffsetY = (centerOfRotationY - robotCenterY) * 8;

          // Calculate center of rotation position in world coordinates
          const beforeHeadingRad =
            ((this.state.heading - deltaAngle) * Math.PI) / 180;
          const corWorldX =
            this.state.x +
            centerOffsetX * Math.cos(beforeHeadingRad) -
            centerOffsetY * Math.sin(beforeHeadingRad);
          const corWorldY =
            this.state.y +
            centerOffsetX * Math.sin(beforeHeadingRad) +
            centerOffsetY * Math.cos(beforeHeadingRad);

          // Calculate new robot center position after rotation around center of rotation
          const afterHeadingRad = (this.state.heading * Math.PI) / 180;
          this.state.x =
            corWorldX -
            centerOffsetX * Math.cos(afterHeadingRad) +
            centerOffsetY * Math.sin(afterHeadingRad);
          this.state.y =
            corWorldY -
            centerOffsetX * Math.sin(afterHeadingRad) -
            centerOffsetY * Math.cos(afterHeadingRad);
        }

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
    speed: number,
  ): Promise<void> {
    if (!this._isConnected || !this.state.motors[motorName]) return;

    const currentAngle = this.state.motors[motorName].angle;
    const angleDiff = angle - currentAngle;
    const duration = (Math.abs(angleDiff) / speed) * 1000;
    const startTime = Date.now();

    // Simulate motor movement to target angle
    while (Date.now() - startTime < duration) {
      const _progress = (Date.now() - startTime) / duration;
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
      x: this.state.x,
      y: this.state.y,
    };
  }

  // Reset position to relative origin
  resetPosition(): void {
    this.state.driveDistance = 0; // Reset accumulated distance
    this.state.driveAngle = 0; // Reset accumulated angle
    this.state.heading = 0; // Reset heading to north
    this.state.x = 0; // Reset X position
    this.state.y = 0; // Reset Y position
    this.config.imuHeading = 0;
    console.log(
      "[VirtualRobot] Position reset to relative origin:",
      this.getCurrentPosition(),
    );
  }

  // Set position to specific coordinates (this is called by UI to sync with mat position)
  setPosition(x: number, y: number, heading: number): void {
    // The UI provides absolute mat coordinates, but the virtual robot works with relative coordinates
    // We'll reset to relative origin and let the UI handle the transformation
    this.state.x = x; // Set absolute X
    this.state.y = y; // Set absolute Y
    this.state.heading = heading; // Set new heading
    this.config.imuHeading = heading;
    console.log(
      "[VirtualRobot] Position synced with UI, working from relative origin:",
      this.getCurrentPosition(),
    );
  }

  // Get full robot state
  getState(): VirtualRobotState {
    return this.state;
  }

  async runProgram(): Promise<void> {
    if (!this._isConnected) return;

    this.programRunning = true;
    this.isRunning = true;

    // Dispatch status change event
    this.dispatchEvent(
      new CustomEvent("statusChange", {
        detail: { running: true, output: "Program started" },
      }),
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
      }),
    );
  }

  // Handle control commands (same interface as real robot)
  async sendControlCommand(commandData: string): Promise<void> {
    if (!this._isConnected) return;

    try {
      const command = JSON.parse(commandData);
      console.log("[VirtualRobot] Control command received:", command);

      switch (command.action) {
        case "reset_drivebase":
          // Reset drivebase telemetry (same as real robot)
          this.state.driveDistance = 0;
          this.state.driveAngle = 0;
          this.state.heading = 0;
          this.config.imuHeading = 0;

          // Abort any ongoing commands
          this.abortController.abort();
          this.abortController = new AbortController();

          console.log(
            "[VirtualRobot] Drivebase reset - telemetry cleared and commands aborted",
          );
          break;

        case "stop":
          // Stop all movement
          await this.stop();
          break;

        default:
          console.log(
            "[VirtualRobot] Unknown control command:",
            command.action,
          );
      }
    } catch (error) {
      console.error("[VirtualRobot] Error processing control command:", error);
    }
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

  async stopMotor(motorName: string): Promise<void> {
    if (this.state.motors[motorName]) {
      this.state.motors[motorName].speed = 0;
      console.log(`[VirtualRobot] Stopped motor: ${motorName}`);
    }
  }

  async executeCommandSequence(
    commands: Array<{
      action: string;
      distance?: number;
      angle?: number;
      speed?: number;
      motor?: string;
      [key: string]: any;
    }>,
  ): Promise<void> {
    console.log(
      `[VirtualRobot] Executing command sequence of ${commands.length} commands`,
    );

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      console.log(
        `[VirtualRobot] Executing command ${i + 1}/${commands.length}:`,
        cmd.action,
        cmd,
      );

      // Execute each command in sequence
      switch (cmd.action) {
        case "turn_and_drive":
          if (
            cmd.angle !== undefined &&
            cmd.distance !== undefined &&
            cmd.speed !== undefined
          ) {
            await this.turnAndDrive(cmd.angle, cmd.distance, cmd.speed);
          }
          break;
        case "drive":
          if (cmd.distance !== undefined && cmd.speed !== undefined) {
            await this.drive(cmd.distance, cmd.speed);
          }
          break;
        case "turn":
          if (cmd.angle !== undefined && cmd.speed !== undefined) {
            await this.turn(cmd.angle, cmd.speed);
          }
          break;
        case "stop":
          if (cmd.motor) {
            await this.stopMotor(cmd.motor);
          } else {
            await this.stop();
          }
          break;
        case "motor":
          if (cmd.motor && cmd.speed !== undefined) {
            if (cmd.angle !== undefined) {
              await this.setMotorAngle(cmd.motor, cmd.angle, cmd.speed);
            } else {
              await this.setMotorSpeed(cmd.motor, cmd.speed);
            }
          }
          break;
        case "drive_continuous":
          if (cmd.speed !== undefined && cmd.turn_rate !== undefined) {
            await this.driveContinuous(cmd.speed, cmd.turn_rate);
          }
          break;
        case "arc":
          if (
            cmd.radius !== undefined &&
            cmd.angle !== undefined &&
            cmd.speed !== undefined
          ) {
            await this.arc(cmd.radius, cmd.angle, cmd.speed);
          }
          break;
      }
    }

    console.log(`[VirtualRobot] Command sequence completed`);
  }

  async turnAndDrive(
    turnAngle: number,
    driveDistance: number,
    speed: number = 100,
  ): Promise<void> {
    console.log(
      `[VirtualRobot] Turn and drive: ${turnAngle}° then ${driveDistance}mm at ${speed}mm/s`,
    );
    await this.executeCommandSequence([
      {
        action: "turn",
        angle: turnAngle,
        speed: speed,
      },
      {
        action: "drive",
        distance: driveDistance,
        speed: speed,
      },
    ]);
  }

  async arc(radius: number, angle: number, speed: number): Promise<void> {
    if (!this._isConnected) return;

    // Calculate arc center and angles from current robot state
    // The robot should arc from its current position and heading
    const currentPos = this.getCurrentPosition();
    const currentHeadingRad = (currentPos.heading * Math.PI) / 180;

    // Calculate arc center perpendicular to current heading
    // For positive angle (left turn): center is to the left of robot
    // For negative angle (right turn): center is to the right of robot
    const centerOffsetAngle =
      currentHeadingRad + (angle > 0 ? Math.PI / 2 : -Math.PI / 2);
    const centerX = currentPos.x + radius * Math.cos(centerOffsetAngle);
    const centerY = currentPos.y + radius * Math.sin(centerOffsetAngle);

    // Calculate start and end angles relative to center
    const startAngle =
      Math.atan2(currentPos.y - centerY, currentPos.x - centerX) *
      (180 / Math.PI);
    const endAngle = startAngle + angle;

    console.log(
      `[VirtualRobot] Arc command: radius=${radius}mm, sweep=${angle}°, speed=${speed}mm/s`,
    );
    console.log(
      `[VirtualRobot] Calculated center(${centerX.toFixed(1)}, ${centerY.toFixed(1)}), ${startAngle.toFixed(1)}° to ${endAngle.toFixed(1)}°`,
    );
    console.log(`[VirtualRobot] Starting position:`, currentPos);

    // Use the provided sweep angle directly
    const arcAngle = angle;

    const arcLength = (Math.abs(arcAngle) * Math.PI * radius) / 180;
    const duration = (arcLength / speed) * 1000; // Convert to milliseconds

    console.log(
      `[VirtualRobot] Arc details: angle=${arcAngle.toFixed(1)}°, length=${arcLength.toFixed(1)}mm, duration=${(duration / 1000).toFixed(1)}s`,
    );

    const signal = this.abortController.signal;
    const startTime = Date.now();
    const initialDistance = this.state.driveDistance;
    const initialAngle = this.state.driveAngle;

    try {
      // Calculate end position on the arc
      const endAngleRad = (endAngle * Math.PI) / 180;
      const endX = centerX + radius * Math.cos(endAngleRad);
      const endY = centerY + radius * Math.sin(endAngleRad);

      // Simulate smooth arc movement
      while (Date.now() - startTime < duration) {
        if (signal.aborted) {
          console.log(`[VirtualRobot] Arc command aborted`);
          return;
        }

        const progress = (Date.now() - startTime) / duration;

        // Interpolate along the arc
        const currentAngle = startAngle + arcAngle * progress;
        const currentAngleRad = (currentAngle * Math.PI) / 180;

        // Calculate current position on arc
        const currentX = centerX + radius * Math.cos(currentAngleRad);
        const currentY = centerY + radius * Math.sin(currentAngleRad);

        // Update robot position
        this.state.x = currentX;
        this.state.y = currentY;

        // Update accumulated distance (arc length traveled)
        const currentArcLength =
          (Math.abs(arcAngle * progress) * Math.PI * radius) / 180;
        this.state.driveDistance = initialDistance + currentArcLength;

        // Calculate tangent direction for heading (perpendicular to radius)
        const tangentAngle = currentAngle + (arcAngle > 0 ? 90 : -90);
        this.state.heading = tangentAngle % 360;
        this.config.imuHeading = this.state.heading;

        // Update drive angle (total rotation)
        const currentTotalRotation = arcAngle * progress;
        this.state.driveAngle = initialAngle + currentTotalRotation;

        // Send telemetry for smooth path tracking
        this.sendTelemetry();

        await new Promise((resolve) => setTimeout(resolve, 50)); // Update every 50ms
      }

      // Final update - complete the arc
      this.state.x = endX;
      this.state.y = endY;
      this.state.driveDistance = initialDistance + arcLength;
      this.state.driveAngle = initialAngle + arcAngle;

      // Final heading - tangent to arc at end point
      const finalTangentAngle = endAngle + (arcAngle > 0 ? 90 : -90);
      this.state.heading = finalTangentAngle % 360;
      this.config.imuHeading = this.state.heading;

      // Send final telemetry
      this.sendTelemetry();

      console.log(
        `[VirtualRobot] Arc completed. Final position:`,
        this.getCurrentPosition(),
      );
    } catch (error) {
      if (signal.aborted) {
        console.log(`[VirtualRobot] Arc command aborted`);
      } else {
        console.error(`[VirtualRobot] Arc command error:`, error);
      }
    }
  }

  getRobotType(): "real" | "virtual" {
    return "virtual";
  }
}

// Export singleton instance
export const virtualRobotService = new VirtualRobotService();
