import { normalizeHeading } from "../utils/headingUtils";
import type { TelemetryPath, TelemetryPoint } from "./telemetryHistory";

interface MovementCommand {
  type: "drive" | "turn" | "arc" | "motor";
  distance?: number; // mm - raw encoder distance delta
  angle?: number; // degrees - raw encoder angle delta
  radius?: number; // mm - for arc commands
  targetHeading?: number; // degrees - final heading
  startHeading?: number; // degrees - starting heading for turn commands
  duration?: number; // ms
  timestamp: number;
  isCmdKeyPressed: boolean; // true if this was a manual correction (CMD key held)
  direction?: "forward" | "backward" | "cw" | "ccw"; // track movement direction
  motorName?: string;
  motorDirection?: "cw" | "ccw";
  speed?: number; // deg/s estimate for motor commands
  movementId?: number;
}

export interface GeneratedProgram {
  commands: MovementCommand[];
  totalDistance: number;
  totalTime: number;
  startPosition: { x: number; y: number; heading: number };
  endPosition: { x: number; y: number; heading: number };
}

// New interface for raw telemetry data
interface RawMotorTelemetry {
  angle?: number;
  speed?: number;
}

interface RawTelemetryPoint {
  timestamp: number;
  isCmdKeyPressed: boolean;
  drivebase?: {
    distance: number; // Raw encoder distance
    angle: number; // Raw encoder angle
  };
  motors?: Record<string, RawMotorTelemetry>;
  hub?: {
    imu?: {
      heading: number; // IMU heading
    };
  };
  movementId?: number;
}

class PseudoCodeGeneratorService {
  private readonly MIN_DISTANCE_THRESHOLD = 10;
  private readonly MIN_HEADING_THRESHOLD = 5;
  private readonly MOTOR_MIN_ANGLE_THRESHOLD = 5;
  private readonly MOTOR_MIN_SPEED_THRESHOLD = 15;
  private readonly MOTOR_IDLE_TIMEOUT_MS = 250;

  /**
   * This service generates pseudo code from robot telemetry data.
   *
   * Key features:
   * - Accumulates small telemetry changes that don't meet thresholds
   * - When switching between command types (drive/turn), applies accumulated deltas
   *   to the previous command before starting a new one
   * - Ensures small movements are captured even when they occur during transitions
   * - Handles both distance and heading changes intelligently
   */
  /**
   * Generate pseudo code from telemetry path
   */
  generateFromPath(
    path: TelemetryPath,
    _isCmdKeyPressed: boolean = false,
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
        motors: point.data.motors,
        hub: point.data.hub,
        movementId: point.movementId,
      }),
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
      motors: point.data.motors,
      hub: point.data.hub,
      movementId: point.movementId,
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
      motors: point.data.motors,
      isCmdKeyPressed: point.isCmdKeyPressed,
      movementId: point.movementId,
    }));

    return this.generateFromRawTelemetry(rawTelemetryPoints);
  }

  /**
   * Generate pseudo code from raw telemetry data
   */
  generateFromRawTelemetry(
    telemetryPoints: RawTelemetryPoint[],
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
    const ongoingMotorCommands = new Map<string, MovementCommand>();
    const motorIdleTimers = new Map<string, number>();
    const startPosition = telemetryPoints[0];
    const endPosition = telemetryPoints[telemetryPoints.length - 1];

    // Track accumulated deltas that don't meet thresholds
    let accumulatedDistance = 0;
    let accumulatedHeading = 0;

    // Arc stability tracking across samples to avoid false-positive arcs
    // Arc stability heuristics (tuned for real-world arcs)
    const ARC_MIN_SAMPLES = 2; // need at least 2 consecutive samples showing arc-like motion
    const ARC_MIN_DIST_MM = 20; // minimal arc distance window
    const ARC_MIN_HEAD_DEG = 2; // minimal arc heading window
    // Typical mm per deg for large radii: (pi/180)*R; for R≈600mm, ~10.5
    const ARC_MM_PER_DEG = 10.0; // scale heading to approximate distance for ratio
    const ARC_RATIO_MIN = 0.4; // acceptable distance-to-heading ratio bounds
    const ARC_RATIO_MAX = 2.0;
    let arcStreakSamples = 0;
    let arcStreakDistance = 0;
    let arcStreakHeading = 0;
    let prevInstantDistSign = 0;
    let prevInstantHeadSign = 0;

    // Process points in pairs to detect movements
    for (let i = 1; i < telemetryPoints.length; i++) {
      const prevPoint = telemetryPoints[i - 1];
      const currentPoint = telemetryPoints[i];

      const prevMovementId = prevPoint.movementId ?? 0;
      const currentMovementId =
        currentPoint.movementId ?? prevMovementId;
      const movementChanged = currentMovementId !== prevMovementId;

      if (movementChanged) {
        if (currentCommand) {
          commands.push(currentCommand);
          currentCommand = null;
        }

        if (
          Math.abs(accumulatedDistance) > 0 ||
          Math.abs(accumulatedHeading) > 0
        ) {
          const { updatedDistance, updatedHeading } =
            this.applyAccumulatedDeltasToPreviousCommand(
              commands,
              accumulatedDistance,
              accumulatedHeading,
              prevPoint.timestamp,
            );
          const appliedDistance =
            Math.abs(accumulatedDistance) - Math.abs(updatedDistance);
          if (appliedDistance > 0) {
            totalDistance += appliedDistance;
          }
          // Any remaining deltas are discarded to avoid leaking into the next segment
        }

        accumulatedDistance = 0;
        accumulatedHeading = 0;
        arcStreakSamples = 0;
        arcStreakDistance = 0;
        arcStreakHeading = 0;
        prevInstantDistSign = 0;
        prevInstantHeadSign = 0;
        this.flushMotorCommands(
          ongoingMotorCommands,
          motorIdleTimers,
          commands,
        );
      }

      // Skip if we don't have drive base data
      if (!prevPoint.drivebase || !currentPoint.drivebase) {
        continue;
      }

      const segmentId = currentMovementId;

      // Calculate deltas from raw encoder data (instantaneous)
      const deltaDistance =
        currentPoint.drivebase.distance - prevPoint.drivebase.distance;

      // Use IMU heading change instead of motor angle for more accurate orientation tracking
      let deltaHeading = 0;
      if (
        prevPoint.hub?.imu?.heading !== undefined &&
        currentPoint.hub?.imu?.heading !== undefined
      ) {
        const rawDelta =
          currentPoint.hub.imu.heading - prevPoint.hub.imu.heading;
        deltaHeading = rawDelta;

        // Normalize heading difference to handle wraparound (e.g., 359° to 1° = -358° not +2°)
        if (deltaHeading > 180) {
          deltaHeading -= 360;
        } else if (deltaHeading < -180) {
          deltaHeading += 360;
        }
      }

      const timeDelta = currentPoint.timestamp - prevPoint.timestamp;

      this.processMotorTelemetry(
        ongoingMotorCommands,
        motorIdleTimers,
        commands,
        prevPoint,
        currentPoint,
        timeDelta,
        deltaDistance,
        deltaHeading,
        segmentId,
      );

      // Update arc streak stability (sample-level)
      const distSign = Math.sign(deltaDistance);
      const headSign = Math.sign(deltaHeading);
      const bothChanging =
        Math.abs(deltaDistance) > 0 && Math.abs(deltaHeading) > 0;
      const sameSigns =
        distSign !== 0 &&
        headSign !== 0 &&
        (prevInstantDistSign === 0 || prevInstantDistSign === distSign) &&
        (prevInstantHeadSign === 0 || prevInstantHeadSign === headSign);
      if (bothChanging && sameSigns) {
        arcStreakSamples += 1;
        arcStreakDistance += deltaDistance;
        arcStreakHeading += deltaHeading;
      } else {
        arcStreakSamples = bothChanging ? 1 : 0;
        arcStreakDistance = bothChanging ? deltaDistance : 0;
        arcStreakHeading = bothChanging ? deltaHeading : 0;
      }
      prevInstantDistSign = distSign;
      prevInstantHeadSign = headSign;

      // Accumulate deltas that don't meet thresholds
      accumulatedDistance += deltaDistance;
      accumulatedHeading += deltaHeading;

      // Determine if this is a significant movement
      const isSignificantMovement =
        Math.abs(accumulatedDistance) >= this.MIN_DISTANCE_THRESHOLD ||
        Math.abs(accumulatedHeading) >= this.MIN_HEADING_THRESHOLD;

      if (isSignificantMovement) {
        // First, finalize any current command that's being built
        if (currentCommand) {
          commands.push(currentCommand);
          currentCommand = null;
        }

        // Detect arc early only when motion appears to be a stable arc
        const distMag = Math.abs(accumulatedDistance);
        const headMag = Math.abs(accumulatedHeading);
        let isArc = false;
        if (
          distMag >= ARC_MIN_DIST_MM &&
          headMag >= ARC_MIN_HEAD_DEG &&
          arcStreakSamples >= ARC_MIN_SAMPLES
        ) {
          const streakHeadAsDist = Math.abs(arcStreakHeading) * ARC_MM_PER_DEG;
          const ratio =
            streakHeadAsDist > 0
              ? Math.abs(arcStreakDistance) / streakHeadAsDist
              : Infinity;
          isArc = ratio >= ARC_RATIO_MIN && ratio <= ARC_RATIO_MAX;
        }

        // Determine the new movement type
    const lastCommandType =
      commands.length > 0 ? commands[commands.length - 1].type : undefined;
    const movementType: "drive" | "turn" | "arc" = isArc
      ? "arc"
      : this.determineMovementTypeForSwitch(
          accumulatedDistance,
          accumulatedHeading,
          lastCommandType,
        );

        // Check if we're switching command types
        const isSwitching = this.isCommandTypeSwitching(
          movementType,
          lastCommandType,
        );

        // Apply accumulated deltas to the previous command if we're switching command types
        let deltasToUse = {
          distance: accumulatedDistance,
          heading: accumulatedHeading,
        };
        if (isSwitching) {
          const updatedDeltas = this.applyAccumulatedDeltasToPreviousCommand(
            commands,
            accumulatedDistance,
            accumulatedHeading,
            currentPoint.timestamp,
          );
          deltasToUse = {
            distance: updatedDeltas.updatedDistance,
            heading: updatedDeltas.updatedHeading,
          };
        }

        // Start new command with the remaining deltas
        const initialDirection = this.determineDirectionFromRaw(
          deltasToUse.distance,
          deltasToUse.heading,
        );

        if (movementType === "arc") {
          const angleDeg = deltasToUse.heading;
          const angleRad = Math.abs(angleDeg) * (Math.PI / 180);
          const distanceMm = deltasToUse.distance;
          const radiusMm =
            angleRad > 1e-6 ? Math.abs(distanceMm) / angleRad : 0;
          currentCommand = {
            type: "arc",
            timestamp: prevPoint.timestamp,
            isCmdKeyPressed: currentPoint.isCmdKeyPressed,
            direction: initialDirection,
            distance: distanceMm,
            angle: angleDeg,
            radius: radiusMm,
            duration: timeDelta,
            movementId: segmentId,
          };
        } else {
          currentCommand = {
            type: movementType,
            timestamp: prevPoint.timestamp,
            isCmdKeyPressed: currentPoint.isCmdKeyPressed,
            direction: initialDirection,
            movementId: segmentId,
          };
          this.updateCurrentCommandFromRaw(
            currentCommand,
            deltasToUse.distance,
            deltasToUse.heading,
            timeDelta,
            currentPoint,
          );
        }

        totalDistance += Math.abs(deltasToUse.distance);

        // Reset accumulated deltas after using them
        accumulatedDistance = 0;
        accumulatedHeading = 0;
      }
    }

    // Add final command if exists
    if (currentCommand) {
      commands.push(currentCommand);
    }

    // Apply any remaining accumulated deltas to the last command if it exists
    if (
      commands.length > 0 &&
      (Math.abs(accumulatedDistance) > 0 || Math.abs(accumulatedHeading) > 0)
    ) {
      const { updatedDistance, updatedHeading } =
        this.applyAccumulatedDeltasToPreviousCommand(
          commands,
          accumulatedDistance,
          accumulatedHeading,
          endPosition.timestamp,
        );

      // If there are still remaining deltas after applying to the previous command,
      // create a new command (prefer arc when both are significant)
      if (Math.abs(updatedDistance) > 0 || Math.abs(updatedHeading) > 0) {
        const distMag2 = Math.abs(updatedDistance);
        const headMag2 = Math.abs(updatedHeading);
        // Only finalize as arc if the final residuals resemble a stable arc streak too
        const streakHeadAsDist2 = Math.abs(arcStreakHeading) * ARC_MM_PER_DEG;
        const ratio2 =
          streakHeadAsDist2 > 0
            ? Math.abs(arcStreakDistance) / streakHeadAsDist2
            : Infinity;
        const isArc2 =
          distMag2 >= ARC_MIN_DIST_MM &&
          headMag2 >= ARC_MIN_HEAD_DEG &&
          arcStreakSamples >= ARC_MIN_SAMPLES &&
          ratio2 >= ARC_RATIO_MIN &&
          ratio2 <= ARC_RATIO_MAX;

        if (isArc2) {
          const angleDeg = updatedHeading;
          const angleRad = Math.abs(angleDeg) * (Math.PI / 180);
          const radiusMm =
            angleRad > 1e-6 ? Math.abs(updatedDistance) / angleRad : 0;
          const newArc: MovementCommand = {
            type: "arc",
            timestamp: endPosition.timestamp,
            isCmdKeyPressed: false,
            direction: this.determineDirectionFromRaw(
              updatedDistance,
              updatedHeading,
            ),
            distance: updatedDistance,
            angle: updatedHeading,
            radius: radiusMm,
            movementId: endPosition.movementId ?? 0,
          };
          totalDistance += Math.abs(updatedDistance);
          commands.push(newArc);
        } else {
          const accumulatedMovementType = this.determineMovementType(
            updatedDistance,
            updatedHeading,
          );
          const newCommand: MovementCommand = {
            type: accumulatedMovementType,
            timestamp: endPosition.timestamp,
            isCmdKeyPressed: false,
            direction: this.determineDirectionFromRaw(
              updatedDistance,
              updatedHeading,
            ),
            movementId: endPosition.movementId ?? 0,
          };
          if (accumulatedMovementType === "drive") {
            newCommand.distance = updatedDistance;
            totalDistance += Math.abs(updatedDistance);
          } else {
            newCommand.angle = updatedHeading;
            if (endPosition.hub?.imu?.heading !== undefined) {
              newCommand.targetHeading = normalizeHeading(
                endPosition.hub.imu.heading,
              );
              newCommand.startHeading = normalizeHeading(
                endPosition.hub.imu.heading - updatedHeading,
              );
            }
          }
          commands.push(newCommand);
        }
      }
    }

    this.flushMotorCommands(ongoingMotorCommands, motorIdleTimers, commands);

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
        heading: normalizeHeading(startPosition.hub?.imu?.heading || 0),
      },
      endPosition: {
        x: 0, // We don't have x,y from raw telemetry
        y: 0,
        heading: normalizeHeading(endPosition.hub?.imu?.heading || 0),
      },
    };
  }

  private processMotorTelemetry(
    ongoingMotorCommands: Map<string, MovementCommand>,
    motorIdleTimers: Map<string, number>,
    commands: MovementCommand[],
    prevPoint: RawTelemetryPoint,
    currentPoint: RawTelemetryPoint,
    timeDelta: number,
    deltaDistance: number,
    deltaHeading: number,
    segmentId: number,
  ): void {
    const prevMotors = prevPoint.motors;
    const currentMotors = currentPoint.motors;

    if (!prevMotors && !currentMotors) {
      return;
    }

    const drivebaseMoving =
      Math.abs(deltaDistance) >= this.MIN_DISTANCE_THRESHOLD ||
      Math.abs(deltaHeading) >= this.MIN_HEADING_THRESHOLD;

    const motorNames = new Set<string>([
      ...Object.keys(prevMotors || {}),
      ...Object.keys(currentMotors || {}),
    ]);

    for (const motorName of motorNames) {
      const prevMotor = prevMotors?.[motorName];
      const currentMotor = currentMotors?.[motorName];
      const ongoingCommand = ongoingMotorCommands.get(motorName);

      if (
        !prevMotor ||
        prevMotor.angle === undefined ||
        !currentMotor ||
        currentMotor.angle === undefined
      ) {
        if (ongoingCommand) {
          const idle = (motorIdleTimers.get(motorName) || 0) + timeDelta;
          motorIdleTimers.set(motorName, idle);
          if (idle >= this.MOTOR_IDLE_TIMEOUT_MS) {
            this.finalizeMotorCommand(
              motorName,
              ongoingMotorCommands,
              motorIdleTimers,
              commands,
            );
          }
        }
        continue;
      }

      const deltaAngle = currentMotor.angle - prevMotor.angle;
      const speedMagnitude = Math.abs(currentMotor.speed ?? 0);
      const significantAngle =
        Math.abs(deltaAngle) >= this.MOTOR_MIN_ANGLE_THRESHOLD;
      const significantSpeed = speedMagnitude >= this.MOTOR_MIN_SPEED_THRESHOLD;

      if (ongoingCommand) {
        if (!drivebaseMoving && (significantAngle || significantSpeed)) {
          ongoingCommand.angle = (ongoingCommand.angle || 0) + deltaAngle;
          ongoingCommand.duration =
            (ongoingCommand.duration || 0) + Math.max(timeDelta, 0);
          ongoingCommand.speed = this.estimateMotorSpeed(
            ongoingCommand.angle || 0,
            ongoingCommand.duration || 0,
            currentMotor.speed,
            ongoingCommand.speed,
          );
          const direction = (ongoingCommand.angle || 0) >= 0 ? "cw" : "ccw";
          ongoingCommand.direction = direction;
          ongoingCommand.motorDirection = direction;
          ongoingCommand.isCmdKeyPressed =
            ongoingCommand.isCmdKeyPressed ||
            currentPoint.isCmdKeyPressed ||
            prevPoint.isCmdKeyPressed;
          motorIdleTimers.set(motorName, 0);
        } else {
          const idle = (motorIdleTimers.get(motorName) || 0) + timeDelta;
          motorIdleTimers.set(motorName, idle);
          if (idle >= this.MOTOR_IDLE_TIMEOUT_MS) {
            this.finalizeMotorCommand(
              motorName,
              ongoingMotorCommands,
              motorIdleTimers,
              commands,
            );
          }
        }
        continue;
      }

      if (drivebaseMoving) {
        continue;
      }

      if (significantAngle || significantSpeed) {
        const initialDuration = Math.max(timeDelta, 0);
        const direction = deltaAngle >= 0 ? "cw" : "ccw";
        const newCommand: MovementCommand = {
          type: "motor",
          motorName,
          motorDirection: direction,
          direction,
          angle: deltaAngle,
          speed: this.estimateMotorSpeed(
            deltaAngle,
            initialDuration,
            currentMotor.speed,
          ),
          timestamp: prevPoint.timestamp,
          duration: initialDuration,
          isCmdKeyPressed:
            currentPoint.isCmdKeyPressed || prevPoint.isCmdKeyPressed,
          movementId: segmentId,
        };

        ongoingMotorCommands.set(motorName, newCommand);
        motorIdleTimers.set(motorName, 0);
      }
    }
  }

  private finalizeMotorCommand(
    motorName: string,
    ongoingMotorCommands: Map<string, MovementCommand>,
    motorIdleTimers: Map<string, number>,
    commands: MovementCommand[],
  ): void {
    const command = ongoingMotorCommands.get(motorName);
    if (!command) {
      return;
    }

    const totalAngle = command.angle ?? 0;
    if (Math.abs(totalAngle) < this.MOTOR_MIN_ANGLE_THRESHOLD) {
      ongoingMotorCommands.delete(motorName);
      motorIdleTimers.delete(motorName);
      return;
    }

    command.motorDirection = totalAngle >= 0 ? "cw" : "ccw";
    command.direction = command.motorDirection;

    if (!command.speed || command.speed <= 0) {
      command.speed = this.estimateMotorSpeed(
        totalAngle,
        command.duration || 0,
        undefined,
        command.speed,
      );
    }

    commands.push(command);
    ongoingMotorCommands.delete(motorName);
    motorIdleTimers.delete(motorName);
  }

  private flushMotorCommands(
    ongoingMotorCommands: Map<string, MovementCommand>,
    motorIdleTimers: Map<string, number>,
    commands: MovementCommand[],
  ): void {
    for (const motorName of ongoingMotorCommands.keys()) {
      this.finalizeMotorCommand(
        motorName,
        ongoingMotorCommands,
        motorIdleTimers,
        commands,
      );
    }
  }

  private estimateMotorSpeed(
    angleDelta: number,
    durationMs: number,
    currentSpeed?: number,
    previousEstimate?: number,
  ): number {
    const candidates: number[] = [];
    if (currentSpeed !== undefined) {
      candidates.push(Math.abs(currentSpeed));
    }
    if (previousEstimate !== undefined) {
      candidates.push(Math.abs(previousEstimate));
    }
    if (durationMs > 0 && Math.abs(angleDelta) > 0) {
      const computed = Math.abs(angleDelta) / (durationMs / 1000);
      if (!Number.isNaN(computed) && Number.isFinite(computed)) {
        candidates.push(computed);
      }
    }

    if (candidates.length === 0) {
      return 180;
    }

    const average =
      candidates.reduce((sum, value) => sum + value, 0) / candidates.length;
    return Math.max(average, 30);
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
        const sameSegment =
          previousCommand.movementId === currentCommand.movementId;

        // Check if we should combine commands
        let shouldCombine = false;

        if (previousCommand.type === currentCommand.type && sameSegment) {
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

            // For turns, we need to consider that the angle values represent heading changes
            // and could be affected by wraparound. We should compare the actual direction
            // of the heading changes, not just the raw angle signs.
            let sameSignedValue = false;

            if (
              previousCommand.startHeading !== undefined &&
              currentCommand.startHeading !== undefined
            ) {
              // Compare the actual heading changes by looking at start and target headings
              const previousHeadingChange =
                previousCommand.targetHeading! - previousCommand.startHeading;
              const currentHeadingChange =
                currentCommand.targetHeading! - currentCommand.startHeading;

              // Normalize both heading changes to -180 to 180 range for proper comparison
              const normalizedPreviousChange = normalizeHeading(
                previousHeadingChange,
              );
              const normalizedCurrentChange =
                normalizeHeading(currentHeadingChange);

              // Check if both changes are in the same direction (same sign)
              sameSignedValue =
                (normalizedPreviousChange >= 0 &&
                  normalizedCurrentChange >= 0) ||
                (normalizedPreviousChange < 0 && normalizedCurrentChange < 0);
            } else {
              // Fallback to simple angle sign comparison if we don't have start headings
              sameSignedValue =
                (previousAngle >= 0 && currentAngle >= 0) ||
                (previousAngle < 0 && currentAngle < 0);
            }

            const cmdKeyHeld = currentCommand.isCmdKeyPressed || false;

            shouldCombine = sameSignedValue || cmdKeyHeld;

            if (shouldCombine) {
              const newTotalAngle = previousAngle + currentAngle;

              // Update the previous command
              previousCommand.angle = newTotalAngle;
              if (previousCommand.startHeading !== undefined) {
                // Since we're now using IMU headings directly, we need to recalculate
                // the target heading based on the accumulated angle change
                previousCommand.targetHeading = normalizeHeading(
                  previousCommand.startHeading + newTotalAngle,
                );
              }
              previousCommand.duration =
                (previousCommand.duration || 0) +
                (currentCommand.duration || 0);

              // Don't add the current command to the summarized list
              continue;
            }
          } else if (currentCommand.type === "arc") {
            // Merge consecutive arcs with same direction and turning sense
            const prevAngle = previousCommand.angle || 0;
            const currAngle = currentCommand.angle || 0;
            const sameTurnSense =
              (prevAngle >= 0 && currAngle >= 0) ||
              (prevAngle < 0 && currAngle < 0);
            const sameDirection =
              previousCommand.direction === currentCommand.direction;

            if (sameTurnSense && sameDirection) {
              const prevDist = Math.abs(previousCommand.distance || 0);
              const currDist = Math.abs(currentCommand.distance || 0);
              const totalDist = prevDist + currDist;
              const totalAngleDeg = prevAngle + currAngle;
              const totalAngleRad = Math.abs(totalAngleDeg) * (Math.PI / 180);
              const fittedRadius =
                totalAngleRad > 1e-6
                  ? totalDist / totalAngleRad
                  : previousCommand.radius || 0;

              previousCommand.distance = totalDist;
              previousCommand.angle = totalAngleDeg;
              previousCommand.radius = fittedRadius;
              previousCommand.duration =
                (previousCommand.duration || 0) +
                (currentCommand.duration || 0);
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
   * Convert generated program to readable pseudo code
   */
  generateReadableCode(program: GeneratedProgram): string {
    if (program.commands.length === 0) {
      return "# No movement detected";
    }

    let code = `"""Generated pseudo code from robot movements"""\n\n`;
    code += `# Total distance: ${program.totalDistance.toFixed(1)}mm\n`;
    code += `# Total time: ${(program.totalTime / 1000).toFixed(1)}s\n`;
    code += `# Start position: (${program.startPosition.x.toFixed(1)}, ${program.startPosition.y.toFixed(1)}) @ ${normalizeHeading(program.startPosition.heading).toFixed(1)}°\n`;
    code += `# End position: (${program.endPosition.x.toFixed(1)}, ${program.endPosition.y.toFixed(1)}) @ ${normalizeHeading(program.endPosition.heading).toFixed(1)}°\n`;
    code += `# Edit this script to iterate quickly, then run it directly from Pybricks Pilot.\n\n`;

    code += `try:\n`;
    code += `  import robot  # Optional: provides hardware setup from Quick Start\n`;
    code += `except ImportError:\n`;
    code += `  robot = None\n`;
    code += `  print("[PILOT] Warning: robot.py not found – set up hardware manually")\n\n`;

    const helperImports = [
      "drive_arc",
      "drive_straight",
      "reset_heading_reference",
      "turn_to_heading",
    ];
    const hasMotorCommands = program.commands.some(
      (command) => command.type === "motor",
    );

    if (hasMotorCommands) {
      helperImports.push("run_motor_angle", "run_motor_speed", "stop_motor");
    }

    code += "from pybrickspilot import (\n";
    code += helperImports.map((name) => `  ${name},\n`).join("");
    code += ")\n\n";

    code += `async def run():\n`;
    code += `  """Generated pseudo code from robot movements"""\n`;
    code += `  reset_heading_reference()\n`;

    for (let i = 0; i < program.commands.length; i++) {
      const command = program.commands[i];
      if (
        command.type === "arc" &&
        typeof command.radius === "number" &&
        typeof command.angle === "number"
      ) {
        const radiusOut = Math.max(1, command.radius || 0);
        // Flip back: use the arc angle as-is for API
        const apiAngle = command.angle || 0;
        const dirArrow = apiAngle >= 0 ? "↶" : "↷";
        const directionComment =
          command.direction === "backward" ? " # Backward" : "";
        code += `  # arc ${dirArrow} for ${Math.abs(command.distance || 0).toFixed(1)}mm at r=${radiusOut.toFixed(1)}mm\n`;
        code += `  await drive_arc(${radiusOut.toFixed(1)}, ${apiAngle.toFixed(1)})${directionComment}\n`;
        continue;
      }

      if (command.type === "drive") {
        const distance = command.distance || 0;
        const directionComment =
          command.direction === "backward" ? " # Backward" : "";
        code += `  await drive_straight(${distance.toFixed(1)})${directionComment}\n`;
      } else if (command.type === "motor" && command.motorName) {
        const angle = command.angle || 0;
        const speed = Math.abs(command.speed || 0);
        const directionSymbol = command.motorDirection === "ccw" ? "↺" : "↻";
        const durationSeconds = command.duration
          ? ` over ${(command.duration / 1000).toFixed(2)}s`
          : "";
        code += `  # motor ${command.motorName} ${directionSymbol} ${Math.abs(angle).toFixed(1)}°${durationSeconds}\n`;
        const motorLiteral = JSON.stringify(command.motorName);
        const speedArg = speed > 0 ? `, speed=${speed.toFixed(1)}` : "";
        code += `  await run_motor_angle(${motorLiteral}, ${angle.toFixed(1)}${speedArg})\n`;
      } else {
        const targetHeading = command.targetHeading || 0;
        code += `  await turn_to_heading(${normalizeHeading(targetHeading).toFixed(1)})\n`;
      }
    }

    return code;
  }

  /**
   * Determine the type of movement based on raw telemetry deltas
   */
  private determineMovementType(
    _deltaDistance: number,
    deltaHeading: number,
  ): "drive" | "turn" {
    // If heading change is significant, it's a turn
    if (Math.abs(deltaHeading) >= this.MIN_HEADING_THRESHOLD) {
      return "turn";
    }
    // Otherwise, it's a drive
    return "drive";
  }

  /**
   * Determine the type of movement when switching between command types
   * This method prioritizes the more significant movement type
   */
  private determineMovementTypeForSwitch(
    deltaDistance: number,
    deltaHeading: number,
    lastCommandType?: "drive" | "turn" | "arc" | "motor",
  ): "drive" | "turn" {
    const distanceMagnitude = Math.abs(deltaDistance);
    const headingMagnitude = Math.abs(deltaHeading);

    // If both are significant, choose the one with larger magnitude
    if (
      distanceMagnitude >= this.MIN_DISTANCE_THRESHOLD &&
      headingMagnitude >= this.MIN_HEADING_THRESHOLD
    ) {
      // Convert heading to approximate distance for comparison (rough approximation)
      // Assuming a typical robot wheelbase, 1 degree ≈ 2-3mm of arc movement
      const headingAsDistance = headingMagnitude * 2.5; // Approximate conversion

      if (headingAsDistance > distanceMagnitude) {
        return "turn";
      } else {
        return "drive";
      }
    }

    // If only one is significant, use that type
    if (headingMagnitude >= this.MIN_HEADING_THRESHOLD) {
      return "turn";
    }
    if (distanceMagnitude >= this.MIN_DISTANCE_THRESHOLD) {
      return "drive";
    }

    // Fallback to last command type if available, otherwise drive
    if (lastCommandType === "turn") {
      return "turn";
    }

    return "drive";
  }

  /**
   * Determine the direction of movement from raw telemetry data
   */
  private determineDirectionFromRaw(
    deltaDistance: number,
    deltaHeading: number,
  ): "forward" | "backward" {
    // For turns, direction is based on heading change
    if (Math.abs(deltaHeading) >= this.MIN_HEADING_THRESHOLD) {
      return deltaHeading > 0 ? "forward" : "backward";
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
    deltaHeading: number,
    timeDelta: number,
    currentPoint: RawTelemetryPoint,
  ): void {
    if (command.type === "drive") {
      // For drive commands, set the distance to the current delta
      // CMD key corrections will be handled by combining with previous command
      command.distance = deltaDistance;

      // Update direction based on current movement
      command.direction = deltaDistance >= 0 ? "forward" : "backward";
    } else {
      // For turn commands, use the IMU heading change directly
      command.angle = deltaHeading;

      // For turn commands, we can directly use the current IMU heading as the target
      // since we're now tracking actual orientation changes rather than motor encoder data
      if (currentPoint.hub?.imu?.heading !== undefined) {
        command.targetHeading = normalizeHeading(currentPoint.hub.imu.heading);

        // Set start heading for the first turn command in a sequence
        if (command.startHeading === undefined) {
          command.startHeading = normalizeHeading(
            currentPoint.hub.imu.heading - deltaHeading,
          );
        }
      }
    }

    command.duration = (command.duration || 0) + timeDelta;
  }

  /**
   * Detect if we're switching between command types
   */
  private isCommandTypeSwitching(
    currentType: "drive" | "turn" | "arc" | "motor",
    lastCommandType?: "drive" | "turn" | "arc" | "motor",
  ): boolean {
    return lastCommandType !== undefined && lastCommandType !== currentType;
  }

  /**
   * Apply accumulated deltas to the previous command when switching command types
   * This ensures small telemetry changes are captured before starting a new command
   */
  private applyAccumulatedDeltasToPreviousCommand(
    commands: MovementCommand[],
    accumulatedDistance: number,
    accumulatedHeading: number,
    currentTimestamp: number,
  ): { updatedDistance: number; updatedHeading: number } {
    if (commands.length === 0) {
      return {
        updatedDistance: accumulatedDistance,
        updatedHeading: accumulatedHeading,
      };
    }

    const lastCommand = commands[commands.length - 1];
    let updatedDistance = accumulatedDistance;
    let updatedHeading = accumulatedHeading;

    // Apply accumulated deltas to the last command if they're of the same type
    if (lastCommand.type === "drive" && Math.abs(accumulatedDistance) > 0) {
      const currentDistance = lastCommand.distance || 0;
      const newTotalDistance = currentDistance + accumulatedDistance;
      lastCommand.distance = newTotalDistance;
      lastCommand.direction = newTotalDistance >= 0 ? "forward" : "backward";

      // Update duration if we have timestamp information
      if (lastCommand.timestamp && currentTimestamp) {
        lastCommand.duration =
          (lastCommand.duration || 0) +
          (currentTimestamp - lastCommand.timestamp);
      }

      updatedDistance = 0; // Reset since we've applied it
    } else if (
      lastCommand.type === "turn" &&
      Math.abs(accumulatedHeading) > 0
    ) {
      const currentAngle = lastCommand.angle || 0;
      const newTotalAngle = currentAngle + accumulatedHeading;
      lastCommand.angle = newTotalAngle;

      // Recalculate target heading based on accumulated angle change
      if (lastCommand.startHeading !== undefined) {
        lastCommand.targetHeading = normalizeHeading(
          lastCommand.startHeading + newTotalAngle,
        );
      }

      // Update duration if we have timestamp information
      if (lastCommand.timestamp && currentTimestamp) {
        lastCommand.duration =
          (lastCommand.duration || 0) +
          (currentTimestamp - lastCommand.timestamp);
      }

      updatedHeading = 0; // Reset since we've applied it
    }

    return { updatedDistance, updatedHeading };
  }
}

export const pseudoCodeGenerator = new PseudoCodeGeneratorService();
