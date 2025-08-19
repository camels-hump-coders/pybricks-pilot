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
function convertSplinePathToCommands(path: SplinePath): SplinePathCommand[] {
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
function convertSplinePathToSmoothCommands(path: SplinePath): SplinePathCommand[] {
  if (!path || path.points.length < 2) {
    return [];
  }

  const commands: SplinePathCommand[] = [];
  
  for (let i = 0; i < path.points.length - 1; i++) {
    const currentPoint = path.points[i];
    const nextPoint = path.points[i + 1];
    
    // Calculate basic movement parameters
    const dx = nextPoint.position.x - currentPoint.position.x;
    const dy = nextPoint.position.y - currentPoint.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Priority 1: Use tangency handles for smooth arc commands
    if (currentPoint.tangencyHandle || nextPoint.tangencyHandle) {
      let arcRadius = distance / 2; // Default radius
      let arcAngle = 30; // Default arc angle
      let turnSpeed = 100; // Speed for turning
      
      // Calculate arc parameters based on tangency handles
      if (currentPoint.tangencyHandle) {
        const handleLength = Math.sqrt(
          currentPoint.tangencyHandle.x * currentPoint.tangencyHandle.x + 
          currentPoint.tangencyHandle.y * currentPoint.tangencyHandle.y
        );
        const strength = currentPoint.tangencyHandle.strength;
        
        // Stronger curvature = tighter radius, larger angle
        arcRadius = Math.max(30, handleLength * (1 - strength * 0.5));
        arcAngle = Math.min(90, 20 + (strength * 60)); // 20-80 degree range
        turnSpeed = Math.max(50, 150 - (strength * 100)); // Slower for tighter curves
      }
      
      if (nextPoint.tangencyHandle) {
        const handleLength = Math.sqrt(
          nextPoint.tangencyHandle.x * nextPoint.tangencyHandle.x + 
          nextPoint.tangencyHandle.y * nextPoint.tangencyHandle.y
        );
        const strength = nextPoint.tangencyHandle.strength;
        
        // Average with previous point's calculations if both exist
        if (currentPoint.tangencyHandle) {
          arcRadius = (arcRadius + Math.max(30, handleLength * (1 - strength * 0.5))) / 2;
          arcAngle = (arcAngle + Math.min(90, 20 + (strength * 60))) / 2;
          turnSpeed = (turnSpeed + Math.max(50, 150 - (strength * 100))) / 2;
        } else {
          arcRadius = Math.max(30, handleLength * (1 - strength * 0.5));
          arcAngle = Math.min(90, 20 + (strength * 60));
          turnSpeed = Math.max(50, 150 - (strength * 100));
        }
      }
      
      commands.push({
        type: "arc",
        radius: arcRadius,
        angle: arcAngle,
        speed: turnSpeed,
        fromPoint: currentPoint.id,
        toPoint: nextPoint.id
      });
    }
    // Priority 2: Use manual control points if available
    else if (currentPoint.controlPoints?.after || nextPoint.controlPoints?.before) {
      // Calculate arc parameters based on control points
      const cp1 = currentPoint.controlPoints?.after || { x: 0, y: 0 };
      const cp2 = nextPoint.controlPoints?.before || { x: 0, y: 0 };
      
      // Calculate the curve radius from control points
      const cp1Length = Math.sqrt(cp1.x * cp1.x + cp1.y * cp1.y);
      const cp2Length = Math.sqrt(cp2.x * cp2.x + cp2.y * cp2.y);
      const avgControlLength = (cp1Length + cp2Length) / 2;
      
      // Use control point length to determine arc radius (more control = tighter curve)
      const arcRadius = Math.max(50, Math.min(avgControlLength, distance / 2));
      
      // Calculate the curve angle from the control points
      const startAngle = normalizeAngle(Math.atan2(cp1.y, cp1.x) * 180 / Math.PI);
      const endAngle = normalizeAngle(Math.atan2(-cp2.y, -cp2.x) * 180 / Math.PI);
      const arcAngle = normalizeAngle(endAngle - startAngle);
      
      commands.push({
        type: "arc",
        radius: arcRadius,
        angle: Math.abs(arcAngle),
        speed: 150,
        fromPoint: currentPoint.id,
        toPoint: nextPoint.id
      });
    } 
    // Priority 3: Fall back to turn + drive for simple segments
    else {
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