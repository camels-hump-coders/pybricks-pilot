interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from bottom edge of mat
  heading: number; // degrees, 0 = north/forward
}

interface RobotConfig {
  dimensions: { width: number; length: number };
  centerOfRotation: { distanceFromLeftEdge: number; distanceFromBack: number };
}

// Export the calculation function for use in other components
export function calculatePreviewPosition(
  currentPosition: RobotPosition,
  distance: number,
  angle: number,
  previewType: "drive" | "turn",
  direction: "forward" | "backward" | "left" | "right",
  robotConfig?: RobotConfig
): RobotPosition {
  const currentHeadingRad = (currentPosition.heading * Math.PI) / 180;
  let newX = currentPosition.x;
  let newY = currentPosition.y;
  let newHeading = currentPosition.heading;

  if (previewType === "drive") {
    // Calculate new position based on drive distance
    const driveDistance = direction === "backward" ? -distance : distance;
    const driveHeadingRad = currentHeadingRad;
    
    newX = currentPosition.x + driveDistance * Math.sin(driveHeadingRad);
    newY = currentPosition.y + driveDistance * Math.cos(driveHeadingRad);
  } else if (previewType === "turn") {
    // Calculate new position based on turn angle
    const turnAngle = direction === "left" ? -angle : angle;
    newHeading = (currentPosition.heading + turnAngle + 360) % 360;
    
    // For differential drive robots, turns happen around the center of rotation (wheel axle)
    // The robot center moves in an arc around the center of rotation
    if (robotConfig && Math.abs(turnAngle) > 0.1) {
      // Calculate center of rotation offset from robot center (in mm)
      const robotCenterX = robotConfig.dimensions.width / 2; // Center of robot width in studs
      const robotCenterY = robotConfig.dimensions.length / 2; // Center of robot length in studs
      const centerOfRotationX = robotConfig.centerOfRotation.distanceFromLeftEdge; // In studs from left edge
      const centerOfRotationY = robotConfig.centerOfRotation.distanceFromBack; // In studs from back edge
      
      const centerOffsetX = (centerOfRotationX - robotCenterX) * 8; // Convert studs to mm
      const centerOffsetY = (centerOfRotationY - robotCenterY) * 8; // Convert studs to mm
      
      // Calculate center of rotation position in world coordinates
      // Note: World coordinates have Y+ pointing up, so we need to flip centerOffsetY
      const currentHeadingRad = (currentPosition.heading * Math.PI) / 180;
      const corWorldX = currentPosition.x + centerOffsetX * Math.cos(currentHeadingRad) - (-centerOffsetY) * Math.sin(currentHeadingRad);
      const corWorldY = currentPosition.y + centerOffsetX * Math.sin(currentHeadingRad) + (-centerOffsetY) * Math.cos(currentHeadingRad);
      
      // Calculate new robot center position after rotation around center of rotation
      const newHeadingRad = (newHeading * Math.PI) / 180;
      newX = corWorldX - centerOffsetX * Math.cos(newHeadingRad) + (-centerOffsetY) * Math.sin(newHeadingRad);
      newY = corWorldY - centerOffsetX * Math.sin(newHeadingRad) - (-centerOffsetY) * Math.cos(newHeadingRad);
    } else {
      // For very small angles or when no robot config, assume rotation in place
      newX = currentPosition.x;
      newY = currentPosition.y;
    }
  }

  return { x: newX, y: newY, heading: newHeading };
}

// New: Calculate the trajectory projection for alignment visualization
export function calculateTrajectoryProjection(
  currentPosition: RobotPosition,
  distance: number,
  angle: number,
  previewType: "drive" | "turn",
  direction: "forward" | "backward" | "left" | "right",
  boardWidth: number = 2356, // Default FLL mat width in mm
  boardHeight: number = 1137,  // Default FLL mat height in mm
  robotConfig?: RobotConfig
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
    robotConfig
  );

  // Then, project the trajectory to the board edge based on the robot's heading
  const trajectoryPath: RobotPosition[] = [currentPosition, nextMoveEnd];
  
  // Calculate the board edge projection, considering if this is backwards movement
  const isBackwards = direction === "backward";
  const boardEndProjection = calculateBoardEdgeProjection(
    nextMoveEnd,
    boardWidth,
    boardHeight,
    isBackwards
  );

  // Add intermediate points for smoother trajectory visualization
  if (boardEndProjection) {
    trajectoryPath.push(boardEndProjection);
  }

  return {
    nextMoveEnd,
    boardEndProjection: boardEndProjection || nextMoveEnd,
    trajectoryPath
  };
}

// Helper function to calculate where the robot's trajectory intersects the board edge
function calculateBoardEdgeProjection(
  position: RobotPosition,
  boardWidth: number,
  boardHeight: number,
  isBackwards: boolean = false
): RobotPosition | null {
  const headingRad = (position.heading * Math.PI) / 180;
  
  // Calculate the direction vector
  let dx = Math.sin(headingRad);
  let dy = Math.cos(headingRad);
  
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
      heading: position.heading
    };
  }
  
  // If no intersection found, return the original position
  return position;
}