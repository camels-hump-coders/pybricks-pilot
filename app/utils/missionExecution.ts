import type { Mission, MissionPointType, ActionPoint, Waypoint } from "../types/missionPlanner";

/**
 * Robot command types for mission execution
 */
export interface RobotCommand {
  action: "drive" | "turn" | "arc" | "stop" | "motor" | "pause";
  distance?: number;
  angle?: number;
  speed?: number;
  radius?: number;
  motor?: string;
  duration?: number; // for pause commands
  fromPoint?: string;
  toPoint?: string;
}

/**
 * Mission execution status
 */
export interface MissionExecutionStatus {
  status: "idle" | "running" | "paused" | "completed" | "error";
  currentPointIndex: number;
  currentCommandIndex: number;
  totalCommands: number;
  completedCommands: number;
  error?: string;
}

/**
 * Normalize angle to -180 to 180 range
 */
function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized > 180) {
    normalized -= 360;
  } else if (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Calculate the shortest turn angle between two headings
 */
function calculateTurnAngle(fromHeading: number, toHeading: number): number {
  const diff = normalizeAngle(toHeading - fromHeading);
  return diff;
}

/**
 * Calculate distance between two points
 */
function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the required heading to move from one point to another
 */
function calculateHeading(fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  // Convert from mathematical angle to robot heading
  // Math.atan2 gives angle from positive X axis, robot heading: 0° = north (up)
  return normalizeAngle(Math.atan2(dx, dy) * 180 / Math.PI);
}

/**
 * Convert mission points to robot commands
 */
export function convertMissionToCommands(mission: Mission): RobotCommand[] {
  if (!mission || mission.points.length < 2) {
    return [];
  }

  const commands: RobotCommand[] = [];
  let currentHeading = 0; // Start with robot heading forward

  for (let i = 0; i < mission.points.length - 1; i++) {
    const currentPoint = mission.points[i];
    const nextPoint = mission.points[i + 1];

    // If current point is an action point, use its specified heading
    if (currentPoint.type === "action") {
      const actionPoint = currentPoint as ActionPoint;
      
      // Turn to the action point's specified heading if it's different from current
      const turnAngle = calculateTurnAngle(currentHeading, actionPoint.heading);
      if (Math.abs(turnAngle) > 2) { // Only turn if angle is significant (>2 degrees)
        commands.push({
          action: "turn",
          angle: turnAngle,
          speed: 100, // Default turn speed
          fromPoint: currentPoint.id,
          toPoint: currentPoint.id
        });
        currentHeading = actionPoint.heading;
      }

      // Add pause for action execution (default 1 second)
      commands.push({
        action: "pause",
        duration: 1000, // 1 second pause
        fromPoint: currentPoint.id,
        toPoint: currentPoint.id
      });
    }

    // Calculate movement to next point
    const distance = calculateDistance(
      currentPoint.x, currentPoint.y,
      nextPoint.x, nextPoint.y
    );

    if (distance > 5) { // Only move if distance is significant (>5mm)
      const requiredHeading = calculateHeading(
        currentPoint.x, currentPoint.y,
        nextPoint.x, nextPoint.y
      );

      // Decide between arc movement or turn+drive based on mission configuration
      const shouldUseArc = mission.defaultArcRadius > 0 && 
                          Math.abs(calculateTurnAngle(currentHeading, requiredHeading)) > 15;

      if (shouldUseArc) {
        // Use arc command for smooth curved movement
        const turnAngle = calculateTurnAngle(currentHeading, requiredHeading);
        const arcRadius = Math.min(mission.defaultArcRadius, distance / 2);

        commands.push({
          action: "arc",
          radius: arcRadius,
          angle: Math.abs(turnAngle),
          speed: 150, // Slower speed for arcs
          fromPoint: currentPoint.id,
          toPoint: nextPoint.id
        });
      } else {
        // Turn to face the next point if needed
        const turnAngle = calculateTurnAngle(currentHeading, requiredHeading);
        if (Math.abs(turnAngle) > 5) { // Only turn if angle is significant
          commands.push({
            action: "turn",
            angle: turnAngle,
            speed: 120, // Turn speed
            fromPoint: currentPoint.id,
            toPoint: nextPoint.id
          });
        }

        // Drive to the next point
        commands.push({
          action: "drive",
          distance: distance,
          speed: 200, // Drive speed
          fromPoint: currentPoint.id,
          toPoint: nextPoint.id
        });
      }

      currentHeading = requiredHeading;
    }

    // If next point is an action point, prepare for it
    if (nextPoint.type === "action") {
      const actionPoint = nextPoint as ActionPoint;
      
      // Turn to the action point's heading if needed
      const finalTurnAngle = calculateTurnAngle(currentHeading, actionPoint.heading);
      if (Math.abs(finalTurnAngle) > 2) {
        commands.push({
          action: "turn",
          angle: finalTurnAngle,
          speed: 80, // Slower, more precise turn for action positioning
          fromPoint: currentPoint.id,
          toPoint: nextPoint.id
        });
        currentHeading = actionPoint.heading;
      }
    }
  }

  // Handle final action point if the mission ends with one
  const lastPoint = mission.points[mission.points.length - 1];
  if (lastPoint.type === "action") {
    commands.push({
      action: "pause",
      duration: 1000, // Final action pause
      fromPoint: lastPoint.id,
      toPoint: lastPoint.id
    });
  }

  return commands;
}

/**
 * Execute a mission on the robot
 */
export async function executeMission(
  mission: Mission,
  sendCommand: (command: string) => Promise<void>,
  onProgress?: (status: MissionExecutionStatus) => void
): Promise<void> {
  const commands = convertMissionToCommands(mission);
  
  if (commands.length === 0) {
    throw new Error("Mission has no executable commands");
  }

  const status: MissionExecutionStatus = {
    status: "running",
    currentPointIndex: 0,
    currentCommandIndex: 0,
    totalCommands: commands.length,
    completedCommands: 0
  };

  onProgress?.(status);

  try {
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      status.currentCommandIndex = i;
      onProgress?.(status);

      // Convert command to robot format and send
      await executeRobotCommand(command, sendCommand);

      status.completedCommands++;
      onProgress?.(status);

      // Small delay between commands for robot processing
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    status.status = "completed";
    onProgress?.(status);
  } catch (error) {
    status.status = "error";
    status.error = error instanceof Error ? error.message : "Unknown error";
    onProgress?.(status);
    throw error;
  }
}

/**
 * Execute a single robot command
 */
async function executeRobotCommand(
  command: RobotCommand,
  sendCommand: (command: string) => Promise<void>
): Promise<void> {
  switch (command.action) {
    case "drive":
      await sendCommand(JSON.stringify({
        action: "drive",
        distance: command.distance,
        speed: command.speed || 200
      }));
      break;

    case "turn":
      await sendCommand(JSON.stringify({
        action: "turn",
        angle: command.angle,
        speed: command.speed || 100
      }));
      break;

    case "arc":
      // Arc commands need special handling - for now, approximate with turn + drive
      // Future enhancement: add native arc support to robot firmware
      if (command.angle && command.radius) {
        await sendCommand(JSON.stringify({
          action: "turn",
          angle: command.angle,
          speed: command.speed || 100
        }));
        
        const arcLength = (command.angle * Math.PI / 180) * command.radius;
        await sendCommand(JSON.stringify({
          action: "drive",
          distance: arcLength,
          speed: command.speed || 150
        }));
      }
      break;

    case "stop":
      await sendCommand(JSON.stringify({
        action: "stop"
      }));
      break;

    case "motor":
      await sendCommand(JSON.stringify({
        action: "motor",
        motor: command.motor,
        angle: command.angle,
        speed: command.speed || 200
      }));
      break;

    case "pause":
      // Just wait for the specified duration
      await new Promise(resolve => setTimeout(resolve, command.duration || 1000));
      break;

    default:
      throw new Error(`Unknown command action: ${(command as any).action}`);
  }
}

/**
 * Validate mission for execution
 */
export function validateMissionForExecution(mission: Mission): string[] {
  const errors: string[] = [];

  if (!mission) {
    errors.push("Mission is null or undefined");
    return errors;
  }

  if (mission.points.length < 2) {
    errors.push("Mission must have at least 2 points (start and end)");
    return errors;
  }

  // Check that mission has proper start and end points
  const firstPoint = mission.points[0];
  const lastPoint = mission.points[mission.points.length - 1];

  if (firstPoint.type !== "start") {
    errors.push("Mission must start with a start point");
  }

  if (lastPoint.type !== "end") {
    errors.push("Mission must end with an end point");
  }

  // Check for valid coordinates
  for (const point of mission.points) {
    if (isNaN(point.x) || isNaN(point.y)) {
      errors.push(`Point ${point.id} has invalid coordinates`);
    }

    if (point.type === "action") {
      const actionPoint = point as ActionPoint;
      if (isNaN(actionPoint.heading)) {
        errors.push(`Action point ${point.id} has invalid heading`);
      }
    }
  }

  // Check for minimum distances between points
  for (let i = 0; i < mission.points.length - 1; i++) {
    const current = mission.points[i];
    const next = mission.points[i + 1];
    const distance = calculateDistance(current.x, current.y, next.x, next.y);
    
    if (distance < 1) {
      errors.push(`Points ${current.id} and ${next.id} are too close together (${distance.toFixed(1)}mm)`);
    }
  }

  return errors;
}

/**
 * Estimate mission execution time in seconds
 */
export function estimateMissionDuration(mission: Mission): number {
  const commands = convertMissionToCommands(mission);
  let totalTime = 0;

  for (const command of commands) {
    switch (command.action) {
      case "drive":
        if (command.distance && command.speed) {
          totalTime += (command.distance / command.speed) * 1000; // Convert to ms
        }
        break;
        
      case "turn":
        if (command.angle && command.speed) {
          totalTime += (Math.abs(command.angle) / command.speed) * 1000; // Convert to ms
        }
        break;
        
      case "arc":
        if (command.angle && command.speed) {
          totalTime += (Math.abs(command.angle) / command.speed) * 1000; // Convert to ms
        }
        break;
        
      case "pause":
        totalTime += command.duration || 1000;
        break;
        
      default:
        totalTime += 500; // Default 0.5s for other commands
    }
  }

  return Math.ceil(totalTime / 1000); // Return in seconds
}