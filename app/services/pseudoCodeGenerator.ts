import type { TelemetryPath, TelemetryPoint } from "./telemetryHistory";

export interface MovementCommand {
  type: "drive" | "turn";
  distance?: number; // mm - raw encoder distance delta
  angle?: number; // degrees - raw encoder angle delta
  targetHeading?: number; // degrees - final heading
  startHeading?: number; // degrees - starting heading for turn commands
  duration?: number; // ms
  timestamp: number;
  isCmdKeyPressed: boolean; // true if this was a manual correction (CMD key held)
  direction?: "forward" | "backward"; // track movement direction
}

export interface GeneratedProgram {
  commands: MovementCommand[];
  totalDistance: number;
  totalTime: number;
  startPosition: { x: number; y: number; heading: number };
  endPosition: { x: number; y: number; heading: number };
}

// New interface for raw telemetry data
export interface RawTelemetryPoint {
  timestamp: number;
  isCmdKeyPressed: boolean;
  drivebase?: {
    distance: number; // Raw encoder distance
    angle: number; // Raw encoder angle
  };
  hub?: {
    imu?: {
      heading: number; // IMU heading
    };
  };
}

class PseudoCodeGeneratorService {
  private readonly MIN_DISTANCE_THRESHOLD = 10;
  private readonly MIN_HEADING_THRESHOLD = 5;

  /**
   * Generate pseudo code from telemetry path
   */
  generateFromPath(
    path: TelemetryPath,
    isCmdKeyPressed: boolean = false
  ): GeneratedProgram {
    if (!path.points || path.points.length < 2) {
      return {
        commands: [],
        totalDistance: 0,
        totalTime: 0,
        startPosition: { x: 0, y: 0, heading: 0 },
        endPosition: { x: 0, y: 0, heading: 0 },
      };
    }

    // Convert TelemetryPoint to RawTelemetryPoint format
    const rawTelemetryPoints: RawTelemetryPoint[] = path.points.map(
      (point) => ({
        timestamp: point.timestamp,
        drivebase: point.data.drivebase,
        isCmdKeyPressed: point.isCmdKeyPressed,
        hub: point.data.hub,
      })
    );

    return this.generateFromRawTelemetry(rawTelemetryPoints);
  }

  /**
   * Generate pseudo code from current telemetry data
   */
  generateFromCurrentTelemetry(points: TelemetryPoint[]): GeneratedProgram {
    if (points.length < 2) {
      return {
        commands: [],
        totalDistance: 0,
        totalTime: 0,
        startPosition: { x: 0, y: 0, heading: 0 },
        endPosition: { x: 0, y: 0, heading: 0 },
      };
    }

    // Convert TelemetryPoint to RawTelemetryPoint format
    const rawTelemetryPoints: RawTelemetryPoint[] = points.map((point) => ({
      timestamp: point.timestamp,
      drivebase: point.data.drivebase,
      isCmdKeyPressed: point.isCmdKeyPressed,
      hub: point.data.hub,
    }));

    return this.generateFromRawTelemetry(rawTelemetryPoints);
  }

  /**
   * Generate pseudo code with live updates for current movement
   * This method is designed to show what the movement would look like if it ended now
   */
  generateLivePreview(points: TelemetryPoint[]): GeneratedProgram {
    if (points.length < 2) {
      return {
        commands: [],
        totalDistance: 0,
        totalTime: 0,
        startPosition: { x: 0, y: 0, heading: 0 },
        endPosition: { x: 0, y: 0, heading: 0 },
      };
    }

    // Convert TelemetryPoint to RawTelemetryPoint format
    const rawTelemetryPoints: RawTelemetryPoint[] = points.map((point) => ({
      timestamp: point.timestamp,
      drivebase: point.data.drivebase,
      hub: point.data.hub,
      isCmdKeyPressed: point.isCmdKeyPressed,
    }));

    return this.generateFromRawTelemetry(rawTelemetryPoints);
  }

  /**
   * Generate pseudo code from raw telemetry data
   */
  generateFromRawTelemetry(
    telemetryPoints: RawTelemetryPoint[]
  ): GeneratedProgram {
    if (!telemetryPoints || telemetryPoints.length < 2) {
      return {
        commands: [],
        totalDistance: 0,
        totalTime: 0,
        startPosition: { x: 0, y: 0, heading: 0 },
        endPosition: { x: 0, y: 0, heading: 0 },
      };
    }

    const commands: MovementCommand[] = [];
    let currentCommand: MovementCommand | null = null;
    let totalDistance = 0;
    let startPosition = telemetryPoints[0];
    let endPosition = telemetryPoints[telemetryPoints.length - 1];

    // Process points in pairs to detect movements
    for (let i = 1; i < telemetryPoints.length; i++) {
      const prevPoint = telemetryPoints[i - 1];
      const currentPoint = telemetryPoints[i];

      // Skip if we don't have drive base data
      if (!prevPoint.drivebase || !currentPoint.drivebase) {
        continue;
      }

      // Calculate deltas from raw encoder data
      const deltaDistance =
        currentPoint.drivebase.distance - prevPoint.drivebase.distance;
      const deltaAngle =
        currentPoint.drivebase.angle - prevPoint.drivebase.angle;
      const timeDelta = currentPoint.timestamp - prevPoint.timestamp;

      // Determine if this is a significant movement
      const isSignificantMovement =
        Math.abs(deltaDistance) >= this.MIN_DISTANCE_THRESHOLD ||
        Math.abs(deltaAngle) >= this.MIN_HEADING_THRESHOLD;

      if (isSignificantMovement) {
        // First, finalize any current command that's being built
        if (currentCommand) {
          commands.push(currentCommand);
          currentCommand = null;
        }

        // Start new command
        const movementType = this.determineMovementType(
          deltaDistance,
          deltaAngle
        );
        const initialDirection = this.determineDirectionFromRaw(
          deltaDistance,
          deltaAngle
        );

        currentCommand = {
          type: movementType,
          timestamp: prevPoint.timestamp,
          isCmdKeyPressed: currentPoint.isCmdKeyPressed,
          direction: initialDirection,
          // For turn commands, we'll set startHeading in updateCurrentCommandFromRaw
        };

        // Update current command based on raw telemetry
        this.updateCurrentCommandFromRaw(
          currentCommand,
          deltaDistance,
          deltaAngle,
          timeDelta,
          currentPoint
        );

        totalDistance += Math.abs(deltaDistance);
      }
    }

    // Add final command if exists
    if (currentCommand) {
      commands.push(currentCommand);
    }

    // Summarize commands by combining sequential commands of the same type
    // and handling corrections appropriately
    const summarizedCommands = this.summarizeCommands(commands);

    return {
      commands: summarizedCommands,
      totalDistance,
      totalTime: endPosition.timestamp - startPosition.timestamp,
      startPosition: {
        x: 0, // We don't have x,y from raw telemetry
        y: 0,
        heading: this.normalizeHeading(startPosition.hub?.imu?.heading || 0),
      },
      endPosition: {
        x: 0, // We don't have x,y from raw telemetry
        y: 0,
        heading: this.normalizeHeading(endPosition.hub?.imu?.heading || 0),
      },
    };
  }

  /**
   * Summarize commands by combining commands with same signed value OR if CMD key was held
   * Create new commands only when signed value changes and CMD key was not held
   */
  private summarizeCommands(commands: MovementCommand[]): MovementCommand[] {
    if (commands.length === 0) return commands;

    const summarized: MovementCommand[] = [];

    for (let i = 0; i < commands.length; i++) {
      const currentCommand = commands[i];

      if (summarized.length > 0) {
        const previousCommand = summarized[summarized.length - 1];

        // Check if we should combine commands
        let shouldCombine = false;

        if (previousCommand.type === currentCommand.type) {
          if (currentCommand.type === "drive") {
            const previousDistance = previousCommand.distance || 0;
            const currentDistance = currentCommand.distance || 0;

            // Combine if: same signed value OR CMD key was held
            const sameSignedValue =
              (previousDistance >= 0 && currentDistance >= 0) ||
              (previousDistance < 0 && currentDistance < 0);
            const cmdKeyHeld = currentCommand.isCmdKeyPressed;

            shouldCombine = sameSignedValue || cmdKeyHeld;

            if (shouldCombine) {
              const newTotalDistance = previousDistance + currentDistance;

              // Update the previous command
              previousCommand.distance = newTotalDistance;
              previousCommand.direction =
                newTotalDistance >= 0 ? "forward" : "backward";
              previousCommand.duration =
                (previousCommand.duration || 0) +
                (currentCommand.duration || 0);

              // Don't add the current command to the summarized list
              continue;
            }
          } else if (currentCommand.type === "turn") {
            const previousAngle = previousCommand.angle || 0;
            const currentAngle = currentCommand.angle || 0;

            // Combine if: same signed value OR CMD key was held
            const sameSignedValue =
              (previousAngle >= 0 && currentAngle >= 0) ||
              (previousAngle < 0 && currentAngle < 0);
            const cmdKeyHeld = currentCommand.isCmdKeyPressed || false;

            shouldCombine = sameSignedValue || cmdKeyHeld;

            if (shouldCombine) {
              const newTotalAngle = previousAngle + currentAngle;

              // Update the previous command
              previousCommand.angle = newTotalAngle;
              if (previousCommand.startHeading !== undefined) {
                previousCommand.targetHeading = this.normalizeHeading(
                  previousCommand.startHeading + newTotalAngle
                );
              }
              previousCommand.duration =
                (previousCommand.duration || 0) +
                (currentCommand.duration || 0);

              // Don't add the current command to the summarized list
              continue;
            }
          }
        }
      }

      // Add the command to the summarized list (either couldn't be combined or first command)
      summarized.push(currentCommand);
    }

    return summarized;
  }

  /**
   * Normalize heading to -180 to 180 degrees range
   */
  private normalizeHeading(heading: number): number {
    // Normalize to 0-360 range first
    let normalized = ((heading % 360) + 360) % 360;

    // Convert to -180 to 180 range
    if (normalized > 180) {
      normalized -= 360;
    }

    return normalized;
  }

  /**
   * Convert generated program to readable pseudo code
   */
  generateReadableCode(program: GeneratedProgram): string {
    if (program.commands.length === 0) {
      return "// No movement detected";
    }

    let code = `// Generated pseudo code from robot movements\n`;
    code += `// Total distance: ${program.totalDistance.toFixed(1)}mm\n`;
    code += `// Total time: ${(program.totalTime / 1000).toFixed(1)}s\n`;
    code += `// Start position: (${program.startPosition.x.toFixed(1)}, ${program.startPosition.y.toFixed(1)}) @ ${this.normalizeHeading(program.startPosition.heading).toFixed(1)}°\n`;
    code += `// End position: (${program.startPosition.x.toFixed(1)}, ${program.startPosition.y.toFixed(1)}) @ ${this.normalizeHeading(program.endPosition.heading).toFixed(1)}°\n\n`;

    program.commands.forEach((command, index) => {
      const directionComment =
        command.direction === "backward" ? " // Backward" : "";

      if (command.type === "drive") {
        const distance = command.distance || 0;
        // Since we're now using signed displacements, just display the distance directly
        // Positive = forward, negative = backward
        code += `straight(${distance.toFixed(1)})${directionComment}\n`;
      } else {
        // For turn commands, show the target heading
        const targetHeading = command.targetHeading || 0;
        code += `turn_to_heading(${this.normalizeHeading(targetHeading).toFixed(1)})\n`;
      }
    });

    return code;
  }

  /**
   * Determine the type of movement based on raw telemetry deltas
   */
  private determineMovementType(
    deltaDistance: number,
    deltaAngle: number
  ): "drive" | "turn" {
    // If angle change is significant, it's a turn
    if (Math.abs(deltaAngle) >= this.MIN_HEADING_THRESHOLD) {
      return "turn";
    }
    // Otherwise, it's a drive
    return "drive";
  }

  /**
   * Determine the direction of movement from raw telemetry data
   */
  private determineDirectionFromRaw(
    deltaDistance: number,
    deltaAngle: number
  ): "forward" | "backward" {
    // For turns, direction is based on heading change
    if (Math.abs(deltaAngle) >= this.MIN_HEADING_THRESHOLD) {
      return deltaAngle > 0 ? "forward" : "backward";
    }

    // For drive movements, use the signed distance directly
    return deltaDistance >= 0 ? "forward" : "backward";
  }

  /**
   * Update the current command based on raw telemetry data
   */
  private updateCurrentCommandFromRaw(
    command: MovementCommand,
    deltaDistance: number,
    deltaAngle: number,
    timeDelta: number,
    currentPoint: RawTelemetryPoint
  ): void {
    if (command.type === "drive") {
      // For drive commands, set the distance to the current delta
      // CMD key corrections will be handled by combining with previous command
      command.distance = deltaDistance;

      // Update direction based on current movement
      command.direction = deltaDistance >= 0 ? "forward" : "backward";
    } else {
      // For turn commands, set the angle to the current delta
      command.angle = deltaAngle;

      // Calculate the target heading based on current angle change
      if (currentPoint.hub?.imu?.heading !== undefined) {
        if (command.startHeading === undefined) {
          // For a new turn command, the starting heading is the current IMU heading
          command.startHeading = currentPoint.hub.imu.heading;
        }

        // Calculate the target heading based on the starting heading and current angle
        command.targetHeading = this.normalizeHeading(
          command.startHeading + (command.angle || 0)
        );
      }
    }

    command.duration = (command.duration || 0) + timeDelta;
  }
}

export const pseudoCodeGenerator = new PseudoCodeGeneratorService();
