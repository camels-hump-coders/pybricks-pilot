import type { TelemetryPoint } from "../../services/telemetryHistory";

export interface TelemetryDrawingUtils {
  mmToCanvas: (x: number, y: number) => { x: number; y: number };
}

export interface PathVisualizationOptions {
  opacity: number;
  strokeWidth: number;
  showMarkers: boolean;
  colorMode: "time" | "speed" | "heading";
}

export interface TelemetryHistoryService {
  getColorForPoint: (point: TelemetryPoint, colorMode: string) => string;
}

/**
 * Draw telemetry path on canvas
 */
export function drawTelemetryPath(
  ctx: CanvasRenderingContext2D,
  selectedPathPoints: TelemetryPoint[],
  pathOptions: PathVisualizationOptions,
  telemetryHistory: TelemetryHistoryService,
  utils: TelemetryDrawingUtils,
  hoveredPointIndex?: number
) {
  // Draw only the selected path points
  if (selectedPathPoints.length > 0) {
    drawPath(ctx, selectedPathPoints, pathOptions, telemetryHistory, utils, hoveredPointIndex);
  }
}

/**
 * Draw a path from telemetry points
 */
export function drawPath(
  ctx: CanvasRenderingContext2D,
  points: TelemetryPoint[],
  pathOptions: PathVisualizationOptions,
  telemetryHistory: TelemetryHistoryService,
  utils: TelemetryDrawingUtils,
  hoveredPointIndex?: number
) {
  if (points.length < 2) return;

  const { mmToCanvas } = utils;

  ctx.save();
  ctx.globalAlpha = pathOptions.opacity;
  ctx.lineWidth = pathOptions.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw path segments
  for (let i = 0; i < points.length - 1; i++) {
    const point1 = points[i];
    const point2 = points[i + 1];

    // SIMPLIFIED MODEL: telemetry points are already in center-of-rotation coordinates
    const pos1 = mmToCanvas(point1.x, point1.y);
    const pos2 = mmToCanvas(point2.x, point2.y);

    // Get color based on visualization mode
    const color = telemetryHistory.getColorForPoint(point1, pathOptions.colorMode);
    ctx.strokeStyle = color;

    ctx.beginPath();
    ctx.moveTo(pos1.x, pos1.y);
    ctx.lineTo(pos2.x, pos2.y);
    ctx.stroke();
  }

  // Draw markers if enabled
  if (pathOptions.showMarkers) {
    drawPathMarkers(ctx, points, pathOptions, telemetryHistory, utils, hoveredPointIndex);
  }

  ctx.restore();
}

/**
 * Draw markers for path points
 */
export function drawPathMarkers(
  ctx: CanvasRenderingContext2D,
  points: TelemetryPoint[],
  pathOptions: PathVisualizationOptions,
  telemetryHistory: TelemetryHistoryService,
  utils: TelemetryDrawingUtils,
  hoveredPointIndex?: number
) {
  const { mmToCanvas } = utils;

  points.forEach((point, index) => {
    // SIMPLIFIED MODEL: telemetry points are already in center-of-rotation coordinates
    const pos = mmToCanvas(point.x, point.y);
    const color = telemetryHistory.getColorForPoint(point, pathOptions.colorMode);

    // Draw marker circle
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1;

    const markerSize = hoveredPointIndex === index ? 6 : 4;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, markerSize, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Highlight hovered point
    if (hoveredPointIndex === index) {
      ctx.strokeStyle = "rgba(255, 255, 0, 1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, markerSize + 2, 0, 2 * Math.PI);
      ctx.stroke();
    }
  });
}