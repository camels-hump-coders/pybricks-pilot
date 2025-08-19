import type { RobotConfig } from "../../schemas/RobotConfig";
import { LEGO_STUD_SIZE_MM } from "../../schemas/RobotConfig";
import type { RobotPosition } from "../robotPosition";
import type { RobotDrawingUtils } from "./robotDrawing";

interface RobotBounds {
  centerOfRotation: { x: number; y: number };
  robotBodyCenter: { x: number; y: number };
  robotBodyOffsetX: number;
  robotBodyOffsetY: number;
  robotWidth: number; // in canvas pixels
  robotLength: number; // in canvas pixels
  heading: number; // in radians
}

/**
 * Calculate robot bounds and positioning data using the exact same logic as robot drawing
 * This ensures consistency between drawing, hit detection, and ghost positioning
 */
export function calculateRobotBounds(
  position: RobotPosition,
  robotConfig: RobotConfig,
  utils: RobotDrawingUtils,
): RobotBounds {
  const { mmToCanvas, scale } = utils;

  // EXACT SAME LOGIC as drawRobot function - position IS the center of rotation
  const centerOfRotationPos = mmToCanvas(position.x, position.y);
  const heading = (position.heading * Math.PI) / 180;

  // Calculate robot body offset from center of rotation (EXACT SAME as drawRobot)
  const robotCenterX = robotConfig.dimensions.width / 2; // Center of robot width in studs
  const robotCenterY = robotConfig.dimensions.length / 2; // Center of robot length in studs
  const centerOfRotationX = robotConfig.centerOfRotation.distanceFromLeftEdge; // In studs from left edge
  const centerOfRotationY = robotConfig.centerOfRotation.distanceFromTop; // In studs from top edge

  // Calculate offset from center of rotation to robot center (in mm, scaled)
  // This is the INVERSE of the previous calculation (EXACT SAME as drawRobot)
  const robotBodyOffsetX =
    (robotCenterX - centerOfRotationX) * LEGO_STUD_SIZE_MM * scale;
  const robotBodyOffsetY =
    (robotCenterY - centerOfRotationY) * LEGO_STUD_SIZE_MM * scale;

  // Calculate robot dimensions in canvas pixels (EXACT SAME as drawRobot)
  const robotWidth = robotConfig.dimensions.width * LEGO_STUD_SIZE_MM * scale; // Convert studs to mm to pixels
  const robotLength = robotConfig.dimensions.length * LEGO_STUD_SIZE_MM * scale; // Convert studs to mm to pixels

  // Calculate actual robot body center position after applying rotation (matches drawRobot logic)
  // This follows the same transformation as drawRobot:
  // 1. Translate to center of rotation position
  // 2. Rotate around center of rotation
  // 3. Translate to robot body center for drawing
  const robotBodyCenterX =
    centerOfRotationPos.x +
    Math.cos(heading) * robotBodyOffsetX -
    Math.sin(heading) * robotBodyOffsetY;
  const robotBodyCenterY =
    centerOfRotationPos.y +
    Math.sin(heading) * robotBodyOffsetX +
    Math.cos(heading) * robotBodyOffsetY;

  return {
    centerOfRotation: centerOfRotationPos,
    robotBodyCenter: { x: robotBodyCenterX, y: robotBodyCenterY },
    robotBodyOffsetX,
    robotBodyOffsetY,
    robotWidth,
    robotLength,
    heading,
  };
}

/**
 * Check if a canvas point is within the robot's bounds
 */
function isPointInRobotBounds(
  canvasX: number,
  canvasY: number,
  bounds: RobotBounds,
): boolean {
  // Transform mouse coordinates to robot's local coordinate system
  const relativeX = canvasX - bounds.robotBodyCenter.x;
  const relativeY = canvasY - bounds.robotBodyCenter.y;

  // Rotate the relative coordinates by the negative robot heading to align with robot's axes
  const localX =
    Math.cos(-bounds.heading) * relativeX -
    Math.sin(-bounds.heading) * relativeY;
  const localY =
    Math.sin(-bounds.heading) * relativeX +
    Math.cos(-bounds.heading) * relativeY;

  // Check if the point is within the robot's rectangular bounds
  return (
    Math.abs(localX) <= bounds.robotWidth / 2 &&
    Math.abs(localY) <= bounds.robotLength / 2
  );
}

/**
 * Calculate the heading from current robot position to a target point
 */
function calculateHeadingToTarget(
  robotPosition: RobotPosition,
  targetX: number,
  targetY: number,
): number {
  const dx = targetX - robotPosition.x;
  const dy = targetY - robotPosition.y;
  // Use same formula as CompactRobotController: Math.atan2(dy, dx) + 90
  let heading = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  // Normalize to -180 to 180 range to match our heading system
  if (heading > 180) heading -= 360;
  return heading;
}
