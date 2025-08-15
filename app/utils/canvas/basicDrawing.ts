/**
 * Basic canvas drawing utilities for the competition mat
 */

export interface CanvasDrawingUtils {
  scale: number;
}

/**
 * Draw border walls around the mat
 */
export function drawBorderWalls(
  ctx: CanvasRenderingContext2D,
  utils: CanvasDrawingUtils,
  borderWallHeight: number,
  borderWallThickness: number,
  tableWidth: number,
  tableHeight: number
) {
  const { scale } = utils;
  
  ctx.fillStyle = "#888"; // Gray color for walls
  
  // Top wall
  ctx.fillRect(0, 0, tableWidth * scale, borderWallThickness * scale);
  
  // Bottom wall
  ctx.fillRect(
    0,
    (tableHeight - borderWallThickness) * scale,
    tableWidth * scale,
    borderWallThickness * scale
  );
  
  // Left wall
  ctx.fillRect(0, 0, borderWallThickness * scale, tableHeight * scale);
  
  // Right wall
  ctx.fillRect(
    (tableWidth - borderWallThickness) * scale,
    0,
    borderWallThickness * scale,
    tableHeight * scale
  );
}

/**
 * Draw grid overlay on the mat
 */
export function drawGridOverlay(
  ctx: CanvasRenderingContext2D,
  utils: CanvasDrawingUtils,
  matX: number,
  matY: number,
  matWidth: number,
  matHeight: number,
  gridSize = 50 // mm
) {
  const { scale } = utils;
  
  ctx.save();
  
  // Set grid style
  ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
  ctx.lineWidth = 1;
  
  // Draw vertical grid lines
  for (let x = 0; x <= matWidth; x += gridSize) {
    const canvasX = matX + (x * scale);
    ctx.beginPath();
    ctx.moveTo(canvasX, matY);
    ctx.lineTo(canvasX, matY + (matHeight * scale));
    ctx.stroke();
  }
  
  // Draw horizontal grid lines
  for (let y = 0; y <= matHeight; y += gridSize) {
    const canvasY = matY + (y * scale);
    ctx.beginPath();
    ctx.moveTo(matX, canvasY);
    ctx.lineTo(matX + (matWidth * scale), canvasY);
    ctx.stroke();
  }
  
  ctx.restore();
}

/**
 * Draw a grid with spacing in pixels
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  gridSize = 20
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

/**
 * Clear canvas with background color
 */
export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundColor = "#e5e5e5"
) {
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
}