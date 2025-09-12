import type { RobotPosition } from "../utils/robotPosition";

interface RobotConfig {
  dimensions: { width: number; length: number };
  centerOfRotation: { distanceFromLeftEdge: number; distanceFromTop: number };
}

// Export the calculation function for use in other components
// SIMPLIFIED MODEL: currentPosition IS the center of rotation
export function calculatePreviewPosition(
  currentPosition: RobotPosition,
  distance: number,
  angle: number,
  previewType: "drive" | "turn" | "arc",
  direction: "forward" | "backward" | "left" | "right",
  _robotConfig?: RobotConfig,
  options?: { radius?: number; isArcBackward?: boolean },
): RobotPosition {
  let newX = currentPosition.x;
  let newY = currentPosition.y;
  let newHeading = currentPosition.heading;

  if (previewType === "drive") {
    // Move the center of rotation directly
    const driveDistance = direction === "backward" ? -distance : distance;
    const headingRad = (currentPosition.heading * Math.PI) / 180;

    newX = currentPosition.x + driveDistance * Math.sin(headingRad);
    // SIMPLIFIED MODEL: Move center of rotation in heading direction
    // heading=0° = move UP (decrease Y), heading=180° = move DOWN (increase Y)
    newY = currentPosition.y - driveDistance * Math.cos(headingRad);
  } else if (previewType === "turn") {
    // SIMPLIFIED MODEL: Only change heading, center of rotation stays in place
    const turnAngle = direction === "left" ? -angle : angle;
    newHeading = (currentPosition.heading + turnAngle + 360) % 360;

    // Position stays the same - tank turning rotates around center of rotation
    newX = currentPosition.x;
    newY = currentPosition.y;
  } else if (previewType === "arc") {
    // Arc movement around a circle with given radius and sweep angle
    const radius = Math.max(1, options?.radius ?? 100);
    const isLeft = direction === "left";
    // Base sweep sign: left = negative (counter-clockwise in screen), right = positive
    let sweep = angle * (isLeft ? -1 : 1);
    if (options?.isArcBackward) sweep = -sweep;
    const headingRad = (currentPosition.heading * Math.PI) / 180;

    // Compute circle center offset from current position using left/right normal
    // Left normal = (-cos(theta), -sin(theta)), Right normal = (cos(theta), sin(theta))
    const nx = (isLeft ? -1 : 1) * Math.cos(headingRad);
    const ny = (isLeft ? -1 : 1) * Math.sin(headingRad);
    const cx = currentPosition.x + radius * nx;
    const cy = currentPosition.y + radius * ny;

    // Start angle of the point relative to center (canvas coordinates)
    const startAngleRad = Math.atan2(currentPosition.y - cy, currentPosition.x - cx);

    // End angle
    const endAngleRad = startAngleRad + (sweep * Math.PI) / 180;

    // End position on the circle
    newX = cx + radius * Math.cos(endAngleRad);
    newY = cy + radius * Math.sin(endAngleRad);

    // Robot heading at end depends on arc traversal direction and forward/back
    const aDeg = (endAngleRad * 180) / Math.PI;
    const isIncreasing = sweep > 0; // increasing 'a' parameter
    if (isIncreasing) {
      newHeading = ((options?.isArcBackward ? aDeg : aDeg + 180) + 360) % 360;
    } else {
      newHeading = ((options?.isArcBackward ? aDeg + 180 : aDeg) + 360) % 360;
    }
  }

  return { x: newX, y: newY, heading: newHeading };
}

// New: Calculate the trajectory projection for alignment visualization
export function calculateTrajectoryProjection(
  currentPosition: RobotPosition,
  distance: number,
  angle: number,
  previewType: "drive" | "turn" | "arc",
  direction: "forward" | "backward" | "left" | "right",
  boardWidth: number = 2356, // Default FLL mat width in mm
  boardHeight: number = 1137, // Default FLL mat height in mm
  robotConfig?: RobotConfig,
  options?: { radius?: number; isArcBackward?: boolean },
): {
  nextMoveEnd: RobotPosition;
  boardEndProjection: RobotPosition;
  trajectoryPath: RobotPosition[];
} {
  // First, calculate where the robot will be after the current move
  const nextMoveEnd = calculatePreviewPosition(
    currentPosition,
    distance,
    angle,
    previewType,
    direction,
    robotConfig,
    options,
  );

  // Then, project the trajectory to the board edge based on the robot's heading
  const trajectoryPath: RobotPosition[] = [currentPosition];
  let boardEndProjection: RobotPosition | null = null;

  // For arc previews, create intermediate points along the arc
  if (previewType === "arc" && options?.radius) {
    const radius = Math.max(1, options.radius);
    const isLeft = direction === "left";
    // Angle here is sweep magnitude; base sign from left/right, invert if backward
    let sweepRad = ((isLeft ? -1 : 1) * angle * Math.PI) / 180;
    if (options?.isArcBackward) sweepRad = -sweepRad;
    const headingRad = (currentPosition.heading * Math.PI) / 180;
    const nx = (isLeft ? -1 : 1) * Math.cos(headingRad);
    const ny = (isLeft ? -1 : 1) * Math.sin(headingRad);
    const cx = currentPosition.x + radius * nx;
    const cy = currentPosition.y + radius * ny;
    const startAngleRad = Math.atan2(currentPosition.y - cy, currentPosition.x - cx);

    const steps = Math.max(
      6,
      Math.min(36, Math.round(Math.abs(sweepRad) / (Math.PI / 36))),
    );
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = startAngleRad + sweepRad * t;
      const px = cx + radius * Math.cos(a);
      const py = cy + radius * Math.sin(a);
      // Heading along the arc: depends on sweep direction and forward/back
      const aDeg = (a * 180) / Math.PI;
      const isIncreasing = sweepRad > 0;
      const headingDeg = isIncreasing
        ? options?.isArcBackward
          ? aDeg
          : aDeg + 180
        : options?.isArcBackward
          ? aDeg + 180
          : aDeg;
      trajectoryPath.push({
        x: px,
        y: py,
        heading: (headingDeg + 360) % 360,
      });
    }
    // Add a short straight extension from the end of the arc in the final heading direction
    const endPos = trajectoryPath[trajectoryPath.length - 1];
    const extLen = Math.min(200, Math.max(50, distance * 0.25)); // 50-200mm short line
    const extRad = (endPos.heading * Math.PI) / 180;
    const ex = endPos.x + extLen * Math.sin(extRad);
    const ey = endPos.y - extLen * Math.cos(extRad);
    trajectoryPath.push({ x: ex, y: ey, heading: endPos.heading });
  } else {
    // Default straight-line two-point path
    trajectoryPath.push(nextMoveEnd);
  }

  // Calculate the board edge projection, considering if this is backwards movement
  const isBackwards =
    previewType === "arc"
      ? options?.isArcBackward === true
      : direction === "backward";

  if (previewType !== "arc") {
    const lastPoint = trajectoryPath[trajectoryPath.length - 1];
    boardEndProjection = calculateBoardEdgeProjection(
      lastPoint,
      boardWidth,
      boardHeight,
      isBackwards,
    );
    if (boardEndProjection) {
      trajectoryPath.push(boardEndProjection);
    }
  }

  return {
    nextMoveEnd,
    boardEndProjection: boardEndProjection || nextMoveEnd,
    trajectoryPath,
  };
}

// Helper function to calculate where the robot's trajectory intersects the board edge
function calculateBoardEdgeProjection(
  position: RobotPosition,
  boardWidth: number,
  boardHeight: number,
  isBackwards: boolean = false,
): RobotPosition | null {
  const headingRad = (position.heading * Math.PI) / 180;

  // Calculate the direction vector
  let dx = Math.sin(headingRad);
  // SIMPLIFIED MODEL: Use same coordinate system as center of rotation movement
  // heading=0° = move UP (decrease Y), heading=180° = move DOWN (increase Y)
  let dy = -Math.cos(headingRad);

  // If moving backwards, reverse the direction vector
  if (isBackwards) {
    dx = -dx;
    dy = -dy;
  }

  // Calculate intersection with board boundaries
  let intersectionX = position.x;
  let intersectionY = position.y;
  let foundIntersection = false;

  // Check intersection with left edge (x = 0)
  if (dx < 0) {
    const t = -position.x / dx;
    const y = position.y + dy * t;
    if (y >= 0 && y <= boardHeight) {
      intersectionX = 0;
      intersectionY = y;
      foundIntersection = true;
    }
  }

  // Check intersection with right edge (x = boardWidth)
  if (dx > 0) {
    const t = (boardWidth - position.x) / dx;
    const y = position.y + dy * t;
    if (y >= 0 && y <= boardHeight) {
      intersectionX = boardWidth;
      intersectionY = y;
      foundIntersection = true;
    }
  }

  // Check intersection with bottom edge (y = 0)
  if (dy < 0) {
    const t = -position.y / dy;
    const x = position.x + dx * t;
    if (x >= 0 && x <= boardWidth) {
      intersectionX = x;
      intersectionY = 0;
      foundIntersection = true;
    }
  }

  // Check intersection with top edge (y = boardHeight)
  if (dy > 0) {
    const t = (boardHeight - position.y) / dy;
    const x = position.x + dx * t;
    if (x >= 0 && x <= boardWidth) {
      intersectionX = x;
      intersectionY = boardHeight;
      foundIntersection = true;
    }
  }

  if (foundIntersection) {
    return {
      x: intersectionX,
      y: intersectionY,
      heading: position.heading,
    };
  }

  // If no intersection found, return the original position
  return position;
}
