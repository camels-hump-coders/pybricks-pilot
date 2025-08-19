/**
 * Basic canvas drawing utilities for the competition mat
 */

interface CanvasDrawingUtils {
  scale: number;
}

/**
 * Draw border walls around the mat
 */
export function drawBorderWalls(
  ctx: CanvasRenderingContext2D,
  utils: CanvasDrawingUtils,
  borderWallThickness: number,
  tableWidth: number,
  tableHeight: number,
) {
  const { scale } = utils;

  ctx.fillStyle = "#888"; // Gray color for walls

  // Calculate scaled dimensions
  const scaledThickness = borderWallThickness * scale;
  const scaledTableWidth = tableWidth * scale;
  const scaledTableHeight = tableHeight * scale;

  // Top wall
  ctx.fillRect(scaledThickness, 0, scaledTableWidth, scaledThickness);

  // Bottom wall
  ctx.fillRect(
    scaledThickness,
    scaledThickness + scaledTableHeight,
    scaledTableWidth,
    scaledThickness,
  );

  // Left wall
  ctx.fillRect(
    0,
    0,
    scaledThickness,
    scaledThickness + scaledTableHeight + scaledThickness,
  );

  // Right wall
  ctx.fillRect(
    scaledThickness + scaledTableWidth,
    0,
    scaledThickness,
    scaledThickness + scaledTableHeight + scaledThickness,
  );
}

/**
 * Draw a grid with spacing in pixels
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  gridSize = 20,
) {
  ctx.save();

  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;

  // Draw vertical lines
  for (let x = 0; x <= canvasWidth; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }

  // Draw horizontal lines
  for (let y = 0; y <= canvasHeight; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }

  ctx.restore();
}
