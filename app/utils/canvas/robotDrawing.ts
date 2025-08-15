import type { RobotConfig } from "../../schemas/RobotConfig";
import { LEGO_STUD_SIZE_MM } from "../../schemas/RobotConfig";

export interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top edge, positive = downward)  
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
}

export type RobotPreviewType = "primary" | "secondary" | "perpendicular" | "playback" | "planning";
export type MovementDirection = "forward" | "backward" | "left" | "right";

export interface RobotDrawingUtils {
  mmToCanvas: (x: number, y: number) => { x: number; y: number };
  scale: number;
}

/**
 * Draws a robot on the canvas at the specified position
 */
export function drawRobot(
  ctx: CanvasRenderingContext2D,
  position: RobotPosition,
  robotConfig: RobotConfig,
  utils: RobotDrawingUtils,
  isGhost = false,
  previewType?: RobotPreviewType,
  direction?: MovementDirection
) {
  const { mmToCanvas, scale } = utils;
  
  // SIMPLIFIED MODEL: position IS the center of rotation
  const centerOfRotationPos = mmToCanvas(position.x, position.y);
  const heading = (position.heading * Math.PI) / 180;

  // Calculate robot body offset from center of rotation
  const robotCenterX = robotConfig.dimensions.width / 2; // Center of robot width in studs
  const robotCenterY = robotConfig.dimensions.length / 2; // Center of robot length in studs
  const centerOfRotationX = robotConfig.centerOfRotation.distanceFromLeftEdge; // In studs from left edge
  const centerOfRotationY = robotConfig.centerOfRotation.distanceFromTop; // In studs from top edge

  // Calculate offset from center of rotation to robot center (in mm, scaled)
  // This is the INVERSE of the previous calculation
  const robotBodyOffsetX =
    (robotCenterX - centerOfRotationX) * LEGO_STUD_SIZE_MM * scale;
  const robotBodyOffsetY =
    (robotCenterY - centerOfRotationY) * LEGO_STUD_SIZE_MM * scale;

  ctx.save();

  // Translate to center of rotation position
  ctx.translate(centerOfRotationPos.x, centerOfRotationPos.y);
  // Rotate around center of rotation
  ctx.rotate(heading);
  // Translate to robot body center for drawing
  ctx.translate(robotBodyOffsetX, robotBodyOffsetY);

  // NOTE: Now drawing robot body at (0,0) which is the robot's geometric center

  const robotWidth = robotConfig.dimensions.width * 8 * scale; // Convert studs to mm
  const robotLength = robotConfig.dimensions.length * 8 * scale; // Convert studs to mm

  if (isGhost) {
    drawGhostRobot(ctx, robotConfig, scale, robotWidth, robotLength, robotBodyOffsetX, robotBodyOffsetY, previewType, direction);
  } else {
    drawRegularRobot(ctx, robotConfig, scale, robotWidth, robotLength, robotBodyOffsetX, robotBodyOffsetY);
  }

  ctx.restore();
}

function drawGhostRobot(
  ctx: CanvasRenderingContext2D,
  robotConfig: RobotConfig,
  scale: number,
  robotWidth: number,
  robotLength: number,
  robotBodyOffsetX: number,
  robotBodyOffsetY: number,
  previewType?: RobotPreviewType,
  direction?: MovementDirection
) {
  // Different opacity and styling based on preview type
  if (previewType === "perpendicular") {
    // Perpendicular previews should be much more subtle
    ctx.globalAlpha = 0.3;
  } else if (previewType === "playback") {
    // Playback ghost robot - distinct purple color
    ctx.globalAlpha = 0.7;
  } else if (previewType === "planning") {
    // Planning ghost robot - orange color for mouse movement
    ctx.globalAlpha = 0.8;
  } else {
    // Primary/secondary previews - make them highly visible
    ctx.globalAlpha = 0.9;
  }

  // Different colors for different movement directions
  let bodyColor, borderColor;
  if (previewType === "playback") {
    // Playback ghost - purple/magenta theme
    bodyColor = "rgba(147, 51, 234, 0.2)";
    borderColor = "#9333ea";
  } else if (previewType === "planning") {
    // Planning ghost - orange theme for mouse movement
    bodyColor = "rgba(255, 140, 0, 0.2)";
    borderColor = "#ff8c00";
  } else if (direction === "forward") {
    // Forward - subtle green (matching forward button)
    bodyColor =
      previewType === "perpendicular"
        ? "rgba(0, 255, 0, 0.05)"
        : "rgba(0, 255, 0, 0.15)";
    borderColor = "#00ff00";
  } else if (direction === "backward") {
    // Backward - subtle orange (matching backward button)
    bodyColor =
      previewType === "perpendicular"
        ? "rgba(255, 165, 0, 0.05)"
        : "rgba(255, 165, 0, 0.15)";
    borderColor = "#ffa500";
  } else if (direction === "left") {
    // Left - subtle purple (matching left turn button)
    bodyColor =
      previewType === "perpendicular"
        ? "rgba(128, 0, 128, 0.05)"
        : "rgba(128, 0, 128, 0.15)";
    borderColor = "#800080";
  } else if (direction === "right") {
    // Right - subtle cyan (matching right turn button)
    bodyColor =
      previewType === "perpendicular"
        ? "rgba(6, 182, 212, 0.05)"
        : "rgba(6, 182, 212, 0.15)";
    borderColor = "#06b6d4";
  } else {
    // Default preview - subtle cyan
    bodyColor =
      previewType === "perpendicular"
        ? "rgba(0, 255, 255, 0.05)"
        : "rgba(0, 255, 255, 0.15)";
    borderColor = "#00ffff";
  }

  // Robot body with preview-specific colors
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = previewType === "perpendicular" ? 2 : 4; // Thinner border for perpendicular previews

  ctx.fillRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
  ctx.strokeRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);

  // Draw wheels
  drawWheels(ctx, robotConfig, scale, robotWidth, robotLength, "rgba(255, 255, 255, 0.9)");

  // Direction indicator for preview - different colors for different directions
  let indicatorColor;
  if (direction === "forward") {
    indicatorColor = "#00ff00"; // Bright green (matching forward button)
  } else if (direction === "backward") {
    indicatorColor = "#ffa500"; // Bright orange (matching backward button)
  } else if (direction === "left") {
    indicatorColor = "#800080"; // Bright purple (matching left turn button)
  } else if (direction === "right") {
    indicatorColor = "#06b6d4"; // Bright cyan (matching right turn button)
  } else {
    indicatorColor = "#ffff00"; // Default yellow
  }

  // Draw direction indicator
  ctx.strokeStyle = indicatorColor;
  ctx.lineWidth = 6; // Much thicker for visibility
  ctx.beginPath();
  ctx.moveTo(0, -robotLength / 3);
  ctx.lineTo(-robotWidth / 6, -robotLength / 6);
  ctx.moveTo(0, -robotLength / 3);
  ctx.lineTo(robotWidth / 6, -robotLength / 6);
  ctx.stroke();

  // Add a bright center point for preview at the center of rotation
  // SIMPLIFIED MODEL: Center of rotation is at (0,0) after transformation
  ctx.fillStyle = indicatorColor;
  ctx.beginPath();
  // Go back to center of rotation position (undo the robot body offset)
  ctx.arc(-robotBodyOffsetX, -robotBodyOffsetY, 5, 0, 2 * Math.PI); // Larger center point at center of rotation
  ctx.fill();

  // Add a subtle glow effect around the preview robot
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 10;
  ctx.strokeRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
  ctx.shadowBlur = 0; // Reset shadow
}

function drawRegularRobot(
  ctx: CanvasRenderingContext2D,
  robotConfig: RobotConfig,
  scale: number,
  robotWidth: number,
  robotLength: number,
  robotBodyOffsetX: number,
  robotBodyOffsetY: number
) {
  // Regular robot - use robot configuration colors
  ctx.globalAlpha = 0.75;

  // Robot body - use configured colors
  ctx.fillStyle = robotConfig.appearance.primaryColor;
  ctx.strokeStyle = robotConfig.appearance.secondaryColor;
  ctx.lineWidth = 2;

  ctx.fillRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
  ctx.strokeRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);

  // Draw wheels
  drawWheels(ctx, robotConfig, scale, robotWidth, robotLength, robotConfig.appearance.wheelColor);

  // Direction indicator for regular robot
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -robotLength / 3);
  ctx.lineTo(-robotWidth / 6, -robotLength / 6);
  ctx.moveTo(0, -robotLength / 3);
  ctx.lineTo(robotWidth / 6, -robotLength / 6);
  ctx.stroke();

  // Center of rotation indicator - now at the origin since we translated to COR
  // SIMPLIFIED MODEL: Center of rotation is at (0,0) after transformation
  ctx.fillStyle = "#ff0000";
  ctx.beginPath();
  // Go back to center of rotation position (undo the robot body offset)
  ctx.arc(-robotBodyOffsetX, -robotBodyOffsetY, 3, 0, 2 * Math.PI);
  ctx.fill();
}

function drawWheels(
  ctx: CanvasRenderingContext2D,
  robotConfig: RobotConfig,
  scale: number,
  robotWidth: number,
  robotLength: number,
  wheelColor: string
) {
  // Wheels - match Robot Builder sizing
  const wheelWidth = (robotConfig.wheels.left.width * scale) / 4; // Match Robot Builder scale
  const wheelDiameter = (robotConfig.wheels.left.diameter * scale) / 4; // Match Robot Builder scale

  // Convert edge-based positioning to center-based coordinates
  // Wheels are positioned from edges, so we need to convert to center-based
  const robotWidthMm = robotConfig.dimensions.width * LEGO_STUD_SIZE_MM;
  const robotLengthMm = robotConfig.dimensions.length * LEGO_STUD_SIZE_MM;

  // Left wheel is distanceFromEdge studs from left edge
  const leftWheelX =
    (-robotWidthMm / 2 +
      robotConfig.wheels.left.distanceFromEdge * LEGO_STUD_SIZE_MM) *
    scale;
  // Right wheel is distanceFromEdge studs from right edge
  const rightWheelX =
    (robotWidthMm / 2 -
      robotConfig.wheels.right.distanceFromEdge * LEGO_STUD_SIZE_MM) *
    scale;
  // Both wheels are distanceFromTop studs from top edge (top of robot)
  // In new coordinate system: top is at -length/2, bottom at +length/2
  const wheelY =
    (-robotLengthMm / 2 +
      robotConfig.wheels.left.distanceFromTop * LEGO_STUD_SIZE_MM) *
    scale;

  ctx.fillStyle = wheelColor;
  ctx.fillRect(
    leftWheelX - wheelWidth / 2,
    wheelY - wheelDiameter / 2,
    wheelWidth,
    wheelDiameter
  );
  ctx.fillRect(
    rightWheelX - wheelWidth / 2,
    wheelY - wheelDiameter / 2,
    wheelWidth,
    wheelDiameter
  );
}