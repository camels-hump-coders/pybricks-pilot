import type { RobotConfig } from "../schemas/RobotConfig";
import { LEGO_STUD_SIZE_MM } from "../schemas/RobotConfig";

export interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top edge, positive = downward)
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
}

export interface MatConfig {
  dimensions?: {
    widthMm?: number;
    heightMm?: number;
  };
}

/**
 * Calculate robot position from edge-based measurements
 * @param side Which side of the mat the robot is positioned against
 * @param fromBottomMm Distance from bottom edge of mat to bottom edge of robot
 * @param fromSideMm Distance from side edge to robot edge
 * @param heading Robot heading in degrees (0 = north, clockwise)
 * @param robotConfig Robot configuration for dimensions and center of rotation
 * @param matConfig Optional mat configuration (defaults to FLL standard)
 * @returns Robot position with center of rotation coordinates
 */
export function calculateRobotPositionFromEdges(
  side: "left" | "right",
  fromBottomMm: number,
  fromSideMm: number,
  heading: number = 0,
  robotConfig: RobotConfig,
  matConfig?: MatConfig | null
): RobotPosition {
  if (!robotConfig) {
    return { x: 0, y: 0, heading: 0 };
  }

  // Calculate robot dimensions based on config
  const robotWidthMm = robotConfig.dimensions.width * LEGO_STUD_SIZE_MM;
  const robotLengthMm = robotConfig.dimensions.length * LEGO_STUD_SIZE_MM;
  const centerOfRotationFromLeftMm =
    robotConfig.centerOfRotation.distanceFromLeftEdge * LEGO_STUD_SIZE_MM;
  const centerOfRotationFromTopMm =
    robotConfig.centerOfRotation.distanceFromTop * LEGO_STUD_SIZE_MM;

  // Mat dimensions from current mat config (fallback to FLL default)
  const matWidthMm = matConfig?.dimensions?.widthMm || 2356;
  const matHeightMm = matConfig?.dimensions?.heightMm || 1137;

  let x: number;
  let y: number;

  if (side === "left") {
    // fromSideMm is distance from left edge to the left edge of robot
    x = fromSideMm + centerOfRotationFromLeftMm;
  } else {
    // fromSideMm is distance from right edge to the right edge of robot
    x = matWidthMm - fromSideMm - (robotWidthMm - centerOfRotationFromLeftMm);
  }

  // fromBottomMm is distance from bottom edge to the bottom edge of robot
  y = matHeightMm - fromBottomMm - (robotLengthMm - centerOfRotationFromTopMm);

  return {
    x,
    y,
    heading,
  };
}
