import { normalizeHeading } from "../utils/headingUtils";
import type { TelemetryPath, TelemetryPoint } from "./telemetryHistory";

export type MotorAngleMode = "relative" | "absolute";

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
  direction?: "forward" | "backward"; // track movement direction
  motorName?: string;
  motorAngleDelta?: number;
  motorStartAngle?: number;
  motorTargetAngle?: number;
}

export interface GeneratedProgram {
  commands: MovementCommand[];
  totalDistance: number;
  totalTime: number;
  startPosition: { x: number; y: number; heading: number };
  endPosition: { x: number; y: number; heading: number };
}

// New interface for raw telemetry data
interface RawTelemetryPoint {
  timestamp: number;
  isCmdKeyPressed: boolean;
  drivebase?: {
    distance: number; // Raw encoder distance
    angle: number; // Raw encoder angle
  };
  motors?: {
    [name: string]: {
      angle: number;
      speed: number;
      load?: number;
      error?: string;
    };
  };
  hub?: {
    imu?: {
      heading: number; // IMU heading
    };
  };
}

interface MotorMovementSegment {
  startAngle: number;
  startTimestamp: number;
  accumulatedDelta: number;
  duration: number;
  lastAngle: number;
  lastTimestamp: number;
  isCmdKeyPressed: boolean;
}

class PseudoCodeGeneratorService {
  private readonly MIN_DISTANCE_THRESHOLD = 10;
  private readonly MIN_HEADING_THRESHOLD = 5;
  private readonly MOTOR_START_THRESHOLD = 0.5;
  private readonly MOTOR_MIN_ANGLE_THRESHOLD = 5;
  private readonly MOTOR_STOP_SPEED_THRESHOLD = 5;
  private readonly DRIVEBASE_MOTOR_NAMES = new Set([
    "left",
    "right",
    "driveleft",
    "driveright",
    "leftdrive",
    "rightdrive",
    "leftmotor",
    "rightmotor",
    "leftwheel",
    "rightwheel",
    "drivebaseleft",
    "drivebaseright",
    "leftdb",
    "rightdb",
  ]);
  private motorAngleMode: MotorAngleMode = "relative";

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
  setMotorAngleMode(mode: MotorAngleMode): void {
    this.motorAngleMode = mode;
  }

  getMotorAngleMode(): MotorAngleMode {
    return this.motorAngleMode;
  }

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
        motors: point.data.motors,
        isCmdKeyPressed: point.isCmdKeyPressed,
        hub: point.data.hub,
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
      motors: point.data.motors,
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
      motors: point.data.motors,
      hub: point.data.hub,
      isCmdKeyPressed: point.isCmdKeyPressed,
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

      // Skip if we don't have drive base data
      if (!prevPoint.drivebase || !currentPoint.drivebase) {
        continue;
      }

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
              lastCommandType as "drive" | "turn" | undefined,
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
          };
        } else {
          currentCommand = {
            type: movementType,
            timestamp: prevPoint.timestamp,
            isCmdKeyPressed: currentPoint.isCmdKeyPressed,
            direction: initialDirection,
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

    const motorCommands = this.generateMotorCommands(telemetryPoints);
    const allCommandsWithIndex = [...commands, ...motorCommands].map(
      (command, index) => ({ command, index }),
    );

    // Ensure chronological ordering while keeping stable sorting for equal timestamps
    const sortedCommands = allCommandsWithIndex
      .sort((a, b) => {
        if (a.command.timestamp === b.command.timestamp) {
          return a.index - b.index;
        }
        return a.command.timestamp - b.command.timestamp;
      })
      .map((entry) => entry.command);

    // Summarize commands by combining sequential commands of the same type
    // and handling corrections appropriately
    const summarizedCommands = this.summarizeCommands(sortedCommands);

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
          } else if (currentCommand.type === "motor") {
            if (
              previousCommand.type === "motor" &&
              previousCommand.motorName === currentCommand.motorName
            ) {
              const previousDelta = previousCommand.motorAngleDelta || 0;
              const currentDelta = currentCommand.motorAngleDelta || 0;
              const sameSignedValue =
                (previousDelta >= 0 && currentDelta >= 0) ||
                (previousDelta < 0 && currentDelta < 0);
              const cmdKeyHeld = currentCommand.isCmdKeyPressed || false;

              if (sameSignedValue || cmdKeyHeld) {
                const combinedDelta = previousDelta + currentDelta;

                previousCommand.motorAngleDelta = combinedDelta;
                if (previousCommand.motorStartAngle === undefined) {
                  previousCommand.motorStartAngle =
                    currentCommand.motorStartAngle;
                }

                const inferredTarget =
                  currentCommand.motorTargetAngle !== undefined
                    ? currentCommand.motorTargetAngle
                    : previousCommand.motorStartAngle !== undefined
                      ? previousCommand.motorStartAngle + combinedDelta
                      : previousCommand.motorTargetAngle;

                if (inferredTarget !== undefined) {
                  previousCommand.motorTargetAngle = inferredTarget;
                }

                previousCommand.duration =
                  (previousCommand.duration || 0) +
                  (currentCommand.duration || 0);
                continue;
              }
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
   * Generate pseudo code commands for individual motors from telemetry data
   */
  private generateMotorCommands(
    telemetryPoints: RawTelemetryPoint[],
  ): MovementCommand[] {
    if (telemetryPoints.length < 2) {
      return [];
    }

    const motorCommands: MovementCommand[] = [];
    const motorNames = new Set<string>();
    const hasDrivebaseTelemetry = telemetryPoints.some(
      (point) => point.drivebase !== undefined,
    );

    telemetryPoints.forEach((point) => {
      if (point.motors) {
        for (const name of Object.keys(point.motors)) {
          if (hasDrivebaseTelemetry && this.isDrivebaseMotorName(name)) {
            continue;
          }
          motorNames.add(name);
        }
      }
    });

    motorNames.forEach((motorName) => {
      let segment: MotorMovementSegment | null = null;

      for (let i = 1; i < telemetryPoints.length; i++) {
        const prevPoint = telemetryPoints[i - 1];
        const currentPoint = telemetryPoints[i];
        const prevMotor = prevPoint.motors?.[motorName];
        const currentMotor = currentPoint.motors?.[motorName];

        if (!prevMotor || !currentMotor) {
          if (segment) {
            this.finalizeMotorSegment(motorCommands, motorName, segment);
            segment = null;
          }
          continue;
        }

        const timeDelta = currentPoint.timestamp - prevPoint.timestamp;
        const delta = currentMotor.angle - prevMotor.angle;

        if (!segment) {
          if (Math.abs(delta) >= this.MOTOR_START_THRESHOLD) {
            segment = {
              startAngle: prevMotor.angle,
              startTimestamp: prevPoint.timestamp,
              accumulatedDelta: delta,
              duration: timeDelta,
              lastAngle: currentMotor.angle,
              lastTimestamp: currentPoint.timestamp,
              isCmdKeyPressed:
                prevPoint.isCmdKeyPressed || currentPoint.isCmdKeyPressed,
            };
          }
          continue;
        }

        const prevAccumulated = segment.accumulatedDelta;
        const prevSign = Math.sign(prevAccumulated);
        const deltaSign = Math.sign(delta);
        const directionChanged =
          prevSign !== 0 && deltaSign !== 0 && prevSign !== deltaSign;

        if (directionChanged) {
          if (Math.abs(prevAccumulated) >= this.MOTOR_MIN_ANGLE_THRESHOLD) {
            this.finalizeMotorSegment(motorCommands, motorName, segment);
          }

          segment =
            Math.abs(delta) >= this.MOTOR_START_THRESHOLD
              ? {
                  startAngle: prevMotor.angle,
                  startTimestamp: prevPoint.timestamp,
                  accumulatedDelta: delta,
                  duration: timeDelta,
                  lastAngle: currentMotor.angle,
                  lastTimestamp: currentPoint.timestamp,
                  isCmdKeyPressed:
                    prevPoint.isCmdKeyPressed || currentPoint.isCmdKeyPressed,
                }
              : null;
          continue;
        }

        segment.accumulatedDelta = prevAccumulated + delta;
        segment.duration += timeDelta;
        segment.lastAngle = currentMotor.angle;
        segment.lastTimestamp = currentPoint.timestamp;
        if (prevPoint.isCmdKeyPressed || currentPoint.isCmdKeyPressed) {
          segment.isCmdKeyPressed = true;
        }

        const approxSpeed =
          currentMotor.speed !== undefined
            ? Math.abs(currentMotor.speed)
            : timeDelta > 0
              ? Math.abs(delta) / Math.max(timeDelta / 1000, 1e-6)
              : 0;
        const smallDelta = Math.abs(delta) < this.MOTOR_START_THRESHOLD;
        const shouldFinalize =
          Math.abs(segment.accumulatedDelta) >=
            this.MOTOR_MIN_ANGLE_THRESHOLD &&
          approxSpeed <= this.MOTOR_STOP_SPEED_THRESHOLD &&
          smallDelta;

        if (shouldFinalize) {
          this.finalizeMotorSegment(motorCommands, motorName, segment);
          segment = null;
        }
      }

      if (segment) {
        this.finalizeMotorSegment(motorCommands, motorName, segment);
      }
    });

    return motorCommands;
  }

  private finalizeMotorSegment(
    commandList: MovementCommand[],
    motorName: string,
    segment: MotorMovementSegment,
  ): void {
    const angleDelta = segment.accumulatedDelta;
    if (Math.abs(angleDelta) < this.MOTOR_MIN_ANGLE_THRESHOLD) {
      return;
    }

    const startAngle = segment.startAngle;
    const targetAngle = startAngle + angleDelta;

    commandList.push({
      type: "motor",
      timestamp: segment.startTimestamp,
      isCmdKeyPressed: segment.isCmdKeyPressed,
      duration: segment.duration,
      motorName,
      motorAngleDelta: angleDelta,
      motorStartAngle: startAngle,
      motorTargetAngle: targetAngle,
    });
  }

  private isDrivebaseMotorName(name: string): boolean {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");

    return this.DRIVEBASE_MOTOR_NAMES.has(normalized);
  }

  /**
   * Convert generated program to readable pseudo code
   */
  generateReadableCode(program: GeneratedProgram): string {
    if (program.commands.length === 0) {
      return "# No movement detected";
    }

    let code = `# Generated pseudo code from robot movements\n`;
    code += `# Total distance: ${program.totalDistance.toFixed(1)}mm\n`;
    code += `# Total time: ${(program.totalTime / 1000).toFixed(1)}s\n`;
    code += `# Start position: (${program.startPosition.x.toFixed(1)}, ${program.startPosition.y.toFixed(1)}) @ ${normalizeHeading(program.startPosition.heading).toFixed(1)}°\n`;
    code += `# End position: (${program.startPosition.x.toFixed(1)}, ${program.startPosition.y.toFixed(1)}) @ ${normalizeHeading(program.endPosition.heading).toFixed(1)}°\n\n`;

    code += `async def run():\n`;
    code += `  """Generated pseudo code from robot movements"""\n`;

    for (let i = 0; i < program.commands.length; i++) {
      const command = program.commands[i];
      const directionComment =
        command.direction === "backward" ? " # Backward" : "";

      if (command.type === "motor") {
        const motorName = command.motorName ?? "motor";
        const fallbackTarget =
          command.motorTargetAngle !== undefined
            ? command.motorTargetAngle
            : command.motorStartAngle !== undefined &&
                command.motorAngleDelta !== undefined
              ? command.motorStartAngle + command.motorAngleDelta
              : undefined;

        if (this.motorAngleMode === "absolute") {
          const targetAngle = fallbackTarget ?? 0;
          const originComment =
            command.motorStartAngle !== undefined
              ? `  # from ${command.motorStartAngle.toFixed(1)}°`
              : "";
          code += `  await motor_move_to("${motorName}", ${targetAngle.toFixed(1)})${originComment}\n`;
        } else {
          const delta = command.motorAngleDelta || 0;
          const targetComment =
            fallbackTarget !== undefined
              ? `  # target ${fallbackTarget.toFixed(1)}°`
              : "";
          code += `  await motor_rotate("${motorName}", ${delta.toFixed(1)})${targetComment}\n`;
        }
        continue;
      }

      if (
        command.type === "arc" &&
        typeof command.radius === "number" &&
        typeof command.angle === "number"
      ) {
        const radiusOut = Math.max(1, command.radius || 0);
        // Flip back: use the arc angle as-is for API
        const apiAngle = command.angle || 0;
        const dirArrow = apiAngle >= 0 ? "↶" : "↷";
        code += `  # arc ${dirArrow} for ${Math.abs(command.distance || 0).toFixed(1)}mm at r=${radiusOut.toFixed(1)}mm\n`;
        code += `  await drive_arc(${radiusOut.toFixed(1)}, ${apiAngle.toFixed(1)})${directionComment}\n`;
        continue;
      }

      if (command.type === "drive") {
        const distance = command.distance || 0;
        code += `  await drive_straight(${distance.toFixed(1)})${directionComment}\n`;
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
    lastCommandType?: "drive" | "turn",
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
    return lastCommandType || "drive";
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
    currentType: "drive" | "turn" | "arc",
    lastCommandType?: "drive" | "turn" | "arc",
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
