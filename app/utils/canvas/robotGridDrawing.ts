import type { RobotPosition } from "../robotPosition";

interface RobotGridDrawingUtils {
  mmToCanvas: (x: number, y: number) => { x: number; y: number };
  scale: number;
}

/**
 * Draw a robot-oriented grid overlay that rotates and moves with the robot
 * The grid is always aligned with the robot's heading and positioned relative to the robot
 */
export function drawRobotOrientedGrid(
  ctx: CanvasRenderingContext2D,
  robotPosition: RobotPosition,
  utils: RobotGridDrawingUtils,
) {
  const { mmToCanvas, scale } = utils;
  const gridSizeMm = 100; // 100mm grid squares
  const gridRange = 15; // Draw 15 grid squares in each direction

  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 255, 0.3)"; // Semi-transparent blue
  ctx.lineWidth = 2;

  // Get robot position on canvas
  const robotCanvasPos = mmToCanvas(robotPosition.x, robotPosition.y);
  const robotHeadingRad = (robotPosition.heading * Math.PI) / 180;

  // Translate to robot position and rotate to robot heading
  ctx.translate(robotCanvasPos.x, robotCanvasPos.y);
  ctx.rotate(robotHeadingRad);

  // Draw grid lines centered on robot's center of rotation
  // Vertical lines (parallel to robot's sides)
  for (let i = -gridRange; i <= gridRange; i++) {
    const x = i * gridSizeMm * scale;
    ctx.beginPath();
    ctx.moveTo(x, -gridRange * gridSizeMm * scale);
    ctx.lineTo(x, gridRange * gridSizeMm * scale);
    ctx.stroke();
  }

  // Horizontal lines (perpendicular to robot's front/back)
  for (let i = -gridRange; i <= gridRange; i++) {
    const y = i * gridSizeMm * scale;
    ctx.beginPath();
    ctx.moveTo(-gridRange * gridSizeMm * scale, y);
    ctx.lineTo(gridRange * gridSizeMm * scale, y);
    ctx.stroke();
  }

  // Draw thicker center lines that cross at robot's center of rotation
  ctx.strokeStyle = "rgba(0, 0, 255, 0.5)";
  ctx.lineWidth = 3;

  // Center vertical line (along robot's centerline) - passes through center of rotation
  ctx.beginPath();
  ctx.moveTo(0, -gridRange * gridSizeMm * scale);
  ctx.lineTo(0, gridRange * gridSizeMm * scale);
  ctx.stroke();

  // Center horizontal line (perpendicular to robot's heading) - passes through center of rotation
  ctx.beginPath();
  ctx.moveTo(-gridRange * gridSizeMm * scale, 0);
  ctx.lineTo(gridRange * gridSizeMm * scale, 0);
  ctx.stroke();

  ctx.restore();
}
