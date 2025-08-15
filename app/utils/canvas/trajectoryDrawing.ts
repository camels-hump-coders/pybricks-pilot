import type { RobotConfig } from "../../schemas/RobotConfig";

export interface RobotPosition {
  x: number;
  y: number;
  heading: number;
}

export type MovementDirection = "forward" | "backward" | "left" | "right";

export interface TrajectoryDrawingUtils {
  mmToCanvas: (x: number, y: number) => { x: number; y: number };
  scale: number;
}

/**
 * Draw trajectory projection path
 */
export function drawTrajectoryProjection(
  ctx: CanvasRenderingContext2D,
  trajectoryPath: RobotPosition[],
  direction: MovementDirection,
  utils: TrajectoryDrawingUtils
) {
  if (trajectoryPath.length < 2) return;

  const { mmToCanvas } = utils;
  
  ctx.save();

  // Set line style based on direction
  let lineColor, lineWidth;
  if (direction === "forward") {
    lineColor = "rgba(0, 255, 0, 0.6)"; // More visible green
    lineWidth = 4; // Thicker line
  } else if (direction === "backward") {
    lineColor = "rgba(255, 165, 0, 0.6)"; // More visible orange
    lineWidth = 4; // Thicker line
  } else if (direction === "left") {
    lineColor = "rgba(128, 0, 128, 0.6)"; // More visible purple
    lineWidth = 4; // Thicker line
  } else if (direction === "right") {
    lineColor = "rgba(6, 182, 212, 0.6)"; // More visible cyan
    lineWidth = 4; // Thicker line
  } else {
    lineColor = "rgba(0, 255, 255, 0.6)"; // Default more visible cyan
    lineWidth = 4; // Thicker line
  }

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw the trajectory path
  ctx.beginPath();
  const startPos = mmToCanvas(trajectoryPath[0].x, trajectoryPath[0].y);
  ctx.moveTo(startPos.x, startPos.y);

  for (let i = 1; i < trajectoryPath.length; i++) {
    const pos = mmToCanvas(trajectoryPath[i].x, trajectoryPath[i].y);
    ctx.lineTo(pos.x, pos.y);
  }

  ctx.stroke();

  // Draw more visible dots at key points (next move end and board edge)
  if (trajectoryPath.length >= 2) {
    // Next move end point
    const nextMovePos = mmToCanvas(trajectoryPath[1].x, trajectoryPath[1].y);
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(nextMovePos.x, nextMovePos.y, 4, 0, 2 * Math.PI); // Larger dot
    ctx.fill();

    // Board edge projection point (if different from next move)
    if (trajectoryPath.length >= 3) {
      const boardEdgePos = mmToCanvas(trajectoryPath[2].x, trajectoryPath[2].y);
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(boardEdgePos.x, boardEdgePos.y, 3, 0, 2 * Math.PI); // Medium dot
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Draw perpendicular trajectory projection (more subtle than primary trajectories)
 */
export function drawPerpendicularTrajectoryProjection(
  ctx: CanvasRenderingContext2D,
  trajectoryPath: RobotPosition[],
  direction: MovementDirection,
  utils: TrajectoryDrawingUtils
) {
  if (trajectoryPath.length < 2) return;

  const { mmToCanvas } = utils;
  
  ctx.save();

  // Subtle but visible line style for perpendicular previews
  let lineColor, lineWidth;
  if (direction === "forward") {
    lineColor = "rgba(0, 255, 0, 0.4)"; // More visible green
    lineWidth = 3; // Thicker line for better visibility
  } else if (direction === "backward") {
    lineColor = "rgba(255, 165, 0, 0.4)"; // More visible orange
    lineWidth = 3; // Thicker line for better visibility
  } else if (direction === "left") {
    lineColor = "rgba(128, 0, 128, 0.4)"; // More visible purple
    lineWidth = 3; // Thicker line for better visibility
  } else if (direction === "right") {
    lineColor = "rgba(6, 182, 212, 0.4)"; // More visible cyan
    lineWidth = 3; // Thicker line for better visibility
  } else {
    lineColor = "rgba(0, 255, 255, 0.4)"; // Default more visible cyan
    lineWidth = 3; // Thicker line for better visibility
  }

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([3, 3]); // Dashed line to differentiate from primary trajectories

  // Draw the trajectory path
  ctx.beginPath();
  const startPos = mmToCanvas(trajectoryPath[0].x, trajectoryPath[0].y);
  ctx.moveTo(startPos.x, startPos.y);

  for (let i = 1; i < trajectoryPath.length; i++) {
    const pos = mmToCanvas(trajectoryPath[i].x, trajectoryPath[i].y);
    ctx.lineTo(pos.x, pos.y);
  }

  ctx.stroke();

  // Skip the dots for perpendicular previews to keep them even more subtle

  ctx.restore();
}

/**
 * Draw next move end indicator
 */
export function drawNextMoveEndIndicator(
  ctx: CanvasRenderingContext2D,
  nextMoveEnd: RobotPosition,
  direction: MovementDirection,
  robotConfig: RobotConfig,
  utils: TrajectoryDrawingUtils
) {
  const { mmToCanvas, scale } = utils;
  const pos = mmToCanvas(nextMoveEnd.x, nextMoveEnd.y);

  ctx.save();

  // Set more visible styling based on direction
  let indicatorColor;
  if (direction === "forward") {
    indicatorColor = "rgba(0, 255, 0, 0.3)"; // More visible green
  } else if (direction === "backward") {
    indicatorColor = "rgba(255, 165, 0, 0.3)"; // More visible orange
  } else if (direction === "left") {
    indicatorColor = "rgba(128, 0, 128, 0.3)"; // More visible purple
  } else if (direction === "right") {
    indicatorColor = "rgba(6, 182, 212, 0.3)"; // More visible cyan
  } else {
    indicatorColor = "rgba(0, 255, 255, 0.3)"; // Default more visible cyan
  }

  // Draw a more visible outline of where the robot will be
  const robotWidth = robotConfig.dimensions.width * 8 * scale; // Convert studs to mm
  const robotLength = robotConfig.dimensions.length * 8 * scale; // Convert studs to mm

  ctx.strokeStyle = indicatorColor;
  ctx.lineWidth = 2; // Thicker line for better visibility
  ctx.setLineDash([8, 4]); // Slightly longer dashes for better visibility

  ctx.strokeRect(
    pos.x - robotWidth / 2,
    pos.y - robotLength / 2,
    robotWidth,
    robotLength
  );

  ctx.setLineDash([]); // Reset line dash

  // Draw a more visible center point
  ctx.fillStyle = indicatorColor;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 3, 0, 2 * Math.PI); // Larger center point
  ctx.fill();

  ctx.restore();
}