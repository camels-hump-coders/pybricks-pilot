import type { SplinePath, SplinePathCommand } from "../store/atoms/gameMat";

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
 * Convert a spline path to executable robot commands
 */
export function convertSplinePathToCommands(path: SplinePath): SplinePathCommand[] {
  if (!path || path.points.length < 2) {
    return [];
  }

  const commands: SplinePathCommand[] = [];
  
  for (let i = 0; i < path.points.length - 1; i++) {
    const currentPoint = path.points[i];
    const nextPoint = path.points[i + 1];
    
    // Calculate distance between points
    const dx = nextPoint.position.x - currentPoint.position.x;
    const dy = nextPoint.position.y - currentPoint.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate required heading to reach next point
    // Note: atan2 gives angle from positive X axis, we need to convert to robot heading
    // Robot heading: 0° = north (up), 90° = east (right)
    const requiredHeading = normalizeAngle(Math.atan2(dy, dx) * 180 / Math.PI + 90);
    
    // Calculate turn angle needed
    const turnAngle = calculateTurnAngle(currentPoint.position.heading, requiredHeading);
    
    // Add turn command if needed
    if (Math.abs(turnAngle) > 5) { // Only turn if angle is significant
      commands.push({
        type: "turn",
        angle: turnAngle,
        speed: 100, // degrees per second
        fromPoint: currentPoint.id,
        toPoint: nextPoint.id
      });
    }
    
    // Add drive command
    if (distance > 5) { // Only drive if distance is significant
      commands.push({
        type: "drive",
        distance: distance,
        speed: 200, // mm per second
        fromPoint: currentPoint.id,
        toPoint: nextPoint.id
      });
    }
  }
  
  return commands;
}

/**
 * Convert spline path with smooth arcs to robot commands
 * This is a more advanced version that can generate arc commands for smooth curves
 */
export function convertSplinePathToSmoothCommands(path: SplinePath): SplinePathCommand[] {
  if (!path || path.points.length < 2) {
    return [];
  }

  const commands: SplinePathCommand[] = [];
  
  for (let i = 0; i < path.points.length - 1; i++) {
    const currentPoint = path.points[i];
    const nextPoint = path.points[i + 1];
    const nextNextPoint = path.points[i + 2]; // Look ahead for arc calculation
    
    // Calculate basic movement parameters
    const dx = nextPoint.position.x - currentPoint.position.x;
    const dy = nextPoint.position.y - currentPoint.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // If we have a next-next point, consider using an arc
    if (nextNextPoint && currentPoint.controlPoints?.after && nextPoint.controlPoints?.before) {
      // Calculate arc parameters based on control points
      // This is a simplified arc calculation - could be enhanced with proper bezier curve math
      const arcRadius = distance / 2; // Simplified radius calculation
      const arcAngle = 45; // Simplified arc angle
      
      commands.push({
        type: "arc",
        radius: arcRadius,
        angle: arcAngle,
        speed: 150,
        fromPoint: currentPoint.id,
        toPoint: nextPoint.id
      });
    } else {
      // Fall back to turn + drive for simple segments
      const requiredHeading = normalizeAngle(Math.atan2(dy, dx) * 180 / Math.PI + 90);
      const turnAngle = calculateTurnAngle(currentPoint.position.heading, requiredHeading);
      
      if (Math.abs(turnAngle) > 5) {
        commands.push({
          type: "turn",
          angle: turnAngle,
          speed: 100,
          fromPoint: currentPoint.id,
          toPoint: nextPoint.id
        });
      }
      
      if (distance > 5) {
        commands.push({
          type: "drive",
          distance: distance,
          speed: 200,
          fromPoint: currentPoint.id,
          toPoint: nextPoint.id
        });
      }
    }
  }
  
  return commands;
}

/**
 * Execute a spline path on the robot
 */
export async function executeSplinePath(
  path: SplinePath,
  executeCommandSequence: (commands: any[]) => Promise<void>
): Promise<void> {
  const pathCommands = convertSplinePathToCommands(path);
  
  // Convert to robot command format
  const robotCommands = pathCommands.map(cmd => {
    switch (cmd.type) {
      case "turn":
        return {
          action: "turn",
          angle: cmd.angle,
          speed: cmd.speed
        };
      case "drive":
        return {
          action: "drive",
          distance: cmd.distance,
          speed: cmd.speed
        };
      case "arc":
        // Arc commands would need special handling in the robot firmware
        // For now, we'll approximate with turn + drive
        return [
          {
            action: "turn",
            angle: cmd.angle || 0,
            speed: cmd.speed
          },
          {
            action: "drive",
            distance: cmd.radius ? cmd.radius * 2 : 100,
            speed: cmd.speed
          }
        ];
      default:
        return null;
    }
  }).flat().filter(cmd => cmd !== null);
  
  // Execute the command sequence
  await executeCommandSequence(robotCommands);
}