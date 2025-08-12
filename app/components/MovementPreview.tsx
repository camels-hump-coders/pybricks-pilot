interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from bottom edge of mat
  heading: number; // degrees, 0 = north/forward
}

// Export the calculation function for use in other components
export function calculatePreviewPosition(
  currentPosition: RobotPosition,
  distance: number,
  angle: number,
  previewType: "drive" | "turn",
  direction: "forward" | "backward" | "left" | "right"
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
    
    // For turns, we assume the robot rotates in place (no position change)
    newX = currentPosition.x;
    newY = currentPosition.y;
  }

  return { x: newX, y: newY, heading: newHeading };
}