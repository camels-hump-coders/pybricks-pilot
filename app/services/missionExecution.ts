import type { RobotConfig } from "../schemas/RobotConfig";
import type { NamedPosition } from "../store/atoms/positionManagement";
import type { Mission } from "../types/missionPlanner";
import type { ArcPathSegment } from "../utils/arcPathComputation";
import { computeArcPath, normalizeAngle } from "../utils/arcPathComputation";

/**
 * Convert canvas heading to robot heading
 * Canvas: 0° = East (right), 90° = South (down)
 * Robot: 0° = North (up), 90° = East (right)
 */
function canvasToRobotHeading(canvasHeading: number): number {
  // Canvas 0°=East needs to become Robot 90°=East
  // Canvas 90°=South needs to become Robot 180°=South
  // Canvas -90°=North needs to become Robot 0°=North
  return normalizeAngle(canvasHeading + 90);
}

/**
 * Robot command interface - matches both virtual and real robot command formats
 */
export interface RobotCommand {
  action:
    | "drive"
    | "turn"
    | "stop"
    | "motor"
    | "pause"
    | "drive_continuous"
    | "turn_and_drive"
    | "arc";
  distance?: number; // mm
  angle?: number; // degrees (relative)
  speed?: number; // mm/s for drive, degrees/s for turn
  turn_rate?: number; // degrees/s for continuous drive
  motor?: string;
  duration?: number; // ms for pause
  // Arc-specific parameters
  radius?: number; // Arc radius (mm)
  description?: string; // Human readable description
}

/**
 * Mission execution options
 */
export interface MissionExecutionOptions {
  defaultSpeed: number; // mm/s
  defaultTurnSpeed: number; // degrees/s
  arcApproximationSegments: number; // Number of straight segments to approximate arcs
  actionPauseDuration: number; // ms to pause at action points
}

/**
 * Convert arc path segments to robot commands
 */
class MissionExecutionService {
  private defaultOptions: MissionExecutionOptions = {
    defaultSpeed: 200, // mm/s
    defaultTurnSpeed: 90, // degrees/s
    arcApproximationSegments: 8, // Break arcs into 8 straight segments
    actionPauseDuration: 2000, // 2 seconds pause at actions
  };

  /**
   * Convert a mission to a sequence of robot commands
   */
  generateMissionCommands(
    mission: Mission,
    positions: NamedPosition[],
    _robotConfig?: RobotConfig,
    options: Partial<MissionExecutionOptions> = {},
  ): RobotCommand[] {
    const opts = { ...this.defaultOptions, ...options };
    const commands: RobotCommand[] = [];

    // Generate optimized arc path segments with resolved coordinates
    const segments = computeArcPath(mission, positions);

    // Debug: Log all generated segments
    console.log(
      `[Command Generation] Generated ${segments.length} path segments for mission "${mission.name}":`,
    );
    segments.forEach((segment, i) => {
      console.log(
        `  Segment ${i + 1}: ${segment.pathType} from (${segment.startX.toFixed(1)}, ${segment.startY.toFixed(1)}) to (${segment.endX.toFixed(1)}, ${segment.endY.toFixed(1)}) - From ${segment.fromPoint.type} to ${segment.toPoint.type}`,
        segment,
      );
    });

    if (segments.length === 0) {
      return commands;
    }

    // Track robot heading to compute relative turns (robot starts at 0° = North)
    let currentRobotHeading = 0;

    // Convert each segment to robot commands
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentCommands = this.convertSegmentToCommands(
        segment,
        opts,
        i,
        currentRobotHeading,
      );
      commands.push(...segmentCommands);

      // Update current heading based on commands in this segment
      for (const cmd of segmentCommands) {
        if (cmd.action === "turn" || cmd.action === "turn_and_drive") {
          if (cmd.angle !== undefined) {
            currentRobotHeading = normalizeAngle(
              currentRobotHeading + cmd.angle,
            );
          }
        } else if (cmd.action === "arc") {
          // Arc changes heading by the sweep angle
          if (cmd.angle !== undefined) {
            // For Pybricks arcs: positive angle = left turn, negative angle = right turn
            // This matches our robot heading convention where turns are relative
            currentRobotHeading = normalizeAngle(
              currentRobotHeading + cmd.angle,
            );

            console.log(
              `[Heading Update] Arc completed, robot now facing: ${currentRobotHeading.toFixed(1)}°`,
            );
          }
        }
      }

      // When arriving at an action point, immediately turn to the action's heading
      if (segment.toPoint.type === "action") {
        const actionPoint = segment.toPoint as any;

        // ALWAYS add heading alignment as the next command after arriving at action point
        if (actionPoint.heading !== undefined) {
          console.log(
            `[Action Point] Arrived at action, turning to heading: ${actionPoint.heading}°`,
          );
          const requiredRobotHeading = actionPoint.heading;
          console.log(
            `[Action Point] Current robot heading: ${currentRobotHeading}°, Required: ${requiredRobotHeading}°`,
          );

          const relativeTurn = normalizeAngle(
            requiredRobotHeading - currentRobotHeading,
          );
          console.log(
            `[Action Point] Executing turn of ${relativeTurn}° to face action heading`,
          );

          // Always add the turn command, even for small angles, to ensure precise action heading
          commands.push({
            action: "turn",
            angle: relativeTurn,
            speed: opts.defaultTurnSpeed,
            description: `Turn to action heading ${requiredRobotHeading.toFixed(1)}°`,
          });
          currentRobotHeading = requiredRobotHeading;
        }
      }
    }

    // Add final stop command
    commands.push({
      action: "stop",
      description: "Mission completed",
    });

    // Debug: Log the generated command sequence
    console.log(
      `[Command Generation] Generated ${commands.length} commands for mission "${mission.name}":`,
    );
    commands.forEach((cmd, i) => {
      console.log(`  ${i + 1}. ${cmd.action}:`, cmd);
    });

    return commands;
  }

  /**
   * Convert a single path segment to robot commands
   */
  private convertSegmentToCommands(
    segment: ArcPathSegment,
    options: MissionExecutionOptions,
    segmentIndex: number,
    currentRobotHeading: number = 0,
  ): RobotCommand[] {
    const commands: RobotCommand[] = [];

    if (segment.pathType === "straight") {
      // Simple straight line movement
      const distance = Math.sqrt(
        (segment.endX - segment.startX) ** 2 +
          (segment.endY - segment.startY) ** 2,
      );

      if (distance > 1) {
        // Only move if distance is significant
        // Calculate direction from start to end point in canvas coordinates
        const dx = segment.endX - segment.startX;
        const dy = segment.endY - segment.startY;

        // Canvas atan2 gives us angle where 0°=East, 90°=South
        const canvasHeading = (Math.atan2(dy, dx) * 180) / Math.PI;

        // Convert canvas heading to robot heading
        const robotHeading = canvasToRobotHeading(canvasHeading);

        // Calculate relative turn needed from current heading to target direction
        const relativeTurn = normalizeAngle(robotHeading - currentRobotHeading);

        console.log(
          `[Segment ${segmentIndex + 1}] Target heading: ${robotHeading.toFixed(1)}°`,
        );
        console.log(
          `[Segment ${segmentIndex + 1}] Current heading: ${currentRobotHeading.toFixed(1)}°`,
        );
        console.log(
          `[Segment ${segmentIndex + 1}] Relative turn: ${relativeTurn.toFixed(1)}°`,
        );

        // Use turnAndDrive with relative turn angle
        commands.push({
          action: "turn_and_drive",
          angle: relativeTurn,
          distance: distance,
          speed: options.defaultSpeed,
          description: `Turn ${relativeTurn.toFixed(1)}° and drive ${distance.toFixed(1)}mm`,
        });
      }
    } else if (
      segment.pathType === "arc" &&
      segment.arcCenter &&
      segment.arcRadius
    ) {
      // Arc movement - first turn to arc starting direction, then execute arc

      // Calculate the tangent direction at the start of the arc
      const arcStartAngle = segment.arcStartAngle!;
      const arcEndAngle = segment.arcEndAngle!;

      // Determine arc direction (clockwise or counterclockwise)
      let arcDirection = arcEndAngle - arcStartAngle;
      // Normalize to [-180, 180] range for shortest path
      while (arcDirection > 180) arcDirection -= 360;
      while (arcDirection < -180) arcDirection += 360;

      // Calculate tangent direction at start of arc
      // The arc angles are in canvas coordinates where 0°=East, 90°=South
      // For a circle, tangent is perpendicular to radius
      // In canvas coordinates: If arc goes counterclockwise, tangent is +90° from radius
      // If arc goes clockwise, tangent is -90° from radius
      const canvasTangentAtStart =
        arcStartAngle + (arcDirection > 0 ? 90 : -90);

      // Convert canvas tangent to robot heading
      const requiredHeading = canvasToRobotHeading(canvasTangentAtStart);

      // Calculate turn needed to face the arc starting direction
      const relativeTurn = normalizeAngle(
        requiredHeading - currentRobotHeading,
      );

      console.log(
        `[Arc Segment ${segmentIndex + 1}] Arc start angle (canvas): ${arcStartAngle.toFixed(1)}°`,
      );
      console.log(
        `[Arc Segment ${segmentIndex + 1}] Arc direction: ${arcDirection > 0 ? "CCW" : "CW"} (${arcDirection.toFixed(1)}°)`,
      );
      console.log(
        `[Arc Segment ${segmentIndex + 1}] Canvas tangent at start: ${canvasTangentAtStart.toFixed(1)}°`,
      );
      console.log(
        `[Arc Segment ${segmentIndex + 1}] Required robot heading: ${requiredHeading.toFixed(1)}°`,
      );
      console.log(
        `[Arc Segment ${segmentIndex + 1}] Current robot heading: ${currentRobotHeading.toFixed(1)}°`,
      );
      console.log(
        `[Arc Segment ${segmentIndex + 1}] Turn needed before arc: ${relativeTurn.toFixed(1)}°`,
      );

      // Always add turn command for precise arc alignment, even for small angles
      // Small heading errors accumulate over the arc path and cause significant drift
      commands.push({
        action: "turn",
        angle: relativeTurn,
        speed: options.defaultTurnSpeed,
        description: `Turn ${relativeTurn.toFixed(1)}° to face arc start direction`,
      });

      // Calculate sweep angle for the arc command
      // Pybricks expects: arc(radius, angle) where angle is the total sweep
      const sweepAngle = arcDirection; // This is already normalized to [-180, 180]

      // Add the arc command
      commands.push({
        action: "arc",
        radius: segment.arcRadius,
        angle: sweepAngle,
        speed: options.defaultSpeed,
        description: `Arc segment (radius: ${segment.arcRadius.toFixed(1)}mm, sweep: ${sweepAngle.toFixed(1)}°)`,
      });
    }

    return commands;
  }

  /**
   * Execute mission commands on a robot interface
   */
  async executeMissionCommands(
    commands: RobotCommand[],
    robotInterface: {
      executeCommandSequence?: (commands: any[]) => Promise<void>;
      sendDriveCommand?: (distance: number, speed: number) => Promise<void>;
      sendTurnCommand?: (angle: number, speed: number) => Promise<void>;
      sendStopCommand?: () => Promise<void>;
      sendMotorCommand?: (
        motor: string,
        angle: number,
        speed: number,
      ) => Promise<void>;
      turnAndDrive?: (
        heading: number,
        distance: number,
        speed: number,
      ) => Promise<void>;
      arc?: (radius: number, angle: number, speed: number) => Promise<void>;
    },
  ): Promise<void> {
    // Check if robot supports command sequences (more efficient)
    if (robotInterface.executeCommandSequence) {
      // Convert to robot interface format
      const robotCommands = commands
        .filter((cmd) => cmd.action !== "pause") // Remove pause commands for now
        .map((cmd) => ({
          action: cmd.action,
          distance: cmd.distance,
          angle: cmd.angle,
          speed: cmd.speed,
          turn_rate: cmd.turn_rate,
          motor: cmd.motor,
          radius: cmd.radius,
        }));

      await robotInterface.executeCommandSequence(robotCommands);
    } else {
      // Execute commands one by one

      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];

        switch (command.action) {
          case "drive":
            if (
              command.distance !== undefined &&
              command.speed !== undefined &&
              robotInterface.sendDriveCommand
            ) {
              await robotInterface.sendDriveCommand(
                command.distance,
                command.speed,
              );
            }
            break;

          case "turn":
            if (
              command.angle !== undefined &&
              command.speed !== undefined &&
              robotInterface.sendTurnCommand
            ) {
              await robotInterface.sendTurnCommand(
                command.angle,
                command.speed,
              );
            }
            break;

          case "turn_and_drive":
            if (
              command.angle !== undefined &&
              command.distance !== undefined &&
              command.speed !== undefined
            ) {
              if (robotInterface.turnAndDrive) {
                await robotInterface.turnAndDrive(
                  command.angle,
                  command.distance,
                  command.speed,
                );
              } else {
                // Fallback: separate turn and drive commands
                if (robotInterface.sendTurnCommand) {
                  await robotInterface.sendTurnCommand(
                    command.angle,
                    command.speed,
                  );
                }
                if (robotInterface.sendDriveCommand) {
                  await robotInterface.sendDriveCommand(
                    command.distance,
                    command.speed,
                  );
                }
              }
            }
            break;

          case "arc":
            if (
              command.radius !== undefined &&
              command.angle !== undefined &&
              command.speed !== undefined
            ) {
              if (robotInterface.arc) {
                await robotInterface.arc(
                  command.radius,
                  command.angle,
                  command.speed,
                );
              } else {
                console.warn("Robot does not support arc commands");
              }
            }
            break;

          case "stop":
            if (robotInterface.sendStopCommand) {
              await robotInterface.sendStopCommand();
            }
            break;

          case "motor":
            if (
              command.motor &&
              command.angle !== undefined &&
              command.speed !== undefined &&
              robotInterface.sendMotorCommand
            ) {
              await robotInterface.sendMotorCommand(
                command.motor,
                command.angle,
                command.speed,
              );
            }
            break;

          case "pause":
            if (command.duration) {
              await new Promise((resolve) =>
                setTimeout(resolve, command.duration),
              );
            }
            break;

          default:
            break;
        }

        // Small delay between commands to prevent overwhelming the BLE connection
        if (i < commands.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    }
  }
}

// Export singleton instance
export const missionExecutionService = new MissionExecutionService();
