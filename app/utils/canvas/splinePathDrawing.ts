import type { SplinePath, SplinePathPoint } from "../../store/atoms/gameMat";
import type { RobotDrawingUtils } from "./robotDrawing";

interface SplinePathDrawingProps {
  splinePath: SplinePath;
  selectedPointId?: string | null;
  utils: RobotDrawingUtils;
}

/**
 * Draw a spline path with its points and connections
 */
export function drawSplinePath(
  ctx: CanvasRenderingContext2D,
  splinePath: SplinePath,
  selectedPointId: string | null,
  utils: RobotDrawingUtils
) {
  if (!splinePath.points || splinePath.points.length === 0) {
    return;
  }

  const { mmToCanvas } = utils;

  // Set line style for path connections
  ctx.strokeStyle = splinePath.isComplete ? "#3b82f6" : "#f59e0b"; // Blue for complete, amber for in-progress
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  // Draw connections between points
  if (splinePath.points.length > 1) {
    ctx.beginPath();
    const firstPoint = mmToCanvas(splinePath.points[0].position.x, splinePath.points[0].position.y);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < splinePath.points.length; i++) {
      const point = mmToCanvas(splinePath.points[i].position.x, splinePath.points[i].position.y);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  // Draw individual points
  splinePath.points.forEach((point, index) => {
    const canvasPos = mmToCanvas(point.position.x, point.position.y);
    const isSelected = selectedPointId === point.id;
    const isFirst = index === 0;
    const isLast = index === splinePath.points.length - 1;

    // Draw point circle
    ctx.beginPath();
    ctx.arc(canvasPos.x, canvasPos.y, isSelected ? 8 : 6, 0, 2 * Math.PI);
    
    // Fill color based on state
    if (isSelected) {
      ctx.fillStyle = "#ef4444"; // Red for selected
    } else if (isFirst) {
      ctx.fillStyle = "#10b981"; // Green for start
    } else if (isLast && splinePath.isComplete) {
      ctx.fillStyle = "#dc2626"; // Dark red for end
    } else {
      ctx.fillStyle = splinePath.isComplete ? "#3b82f6" : "#f59e0b"; // Blue/amber based on completion
    }
    ctx.fill();

    // Draw border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw point number
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((index + 1).toString(), canvasPos.x, canvasPos.y);

    // Draw heading indicator
    if (point.position.heading !== undefined) {
      const headingRad = (point.position.heading * Math.PI) / 180;
      const arrowLength = 20;
      const arrowEndX = canvasPos.x + Math.sin(headingRad) * arrowLength;
      const arrowEndY = canvasPos.y - Math.cos(headingRad) * arrowLength;

      ctx.beginPath();
      ctx.moveTo(canvasPos.x, canvasPos.y);
      ctx.lineTo(arrowEndX, arrowEndY);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw arrowhead
      const arrowheadLength = 6;
      const arrowheadAngle = Math.PI / 6;
      
      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(
        arrowEndX - arrowheadLength * Math.sin(headingRad + arrowheadAngle),
        arrowEndY + arrowheadLength * Math.cos(headingRad + arrowheadAngle)
      );
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(
        arrowEndX - arrowheadLength * Math.sin(headingRad - arrowheadAngle),
        arrowEndY + arrowheadLength * Math.cos(headingRad - arrowheadAngle)
      );
      ctx.stroke();
    }
  });

  // Draw path name if it exists
  if (splinePath.name && splinePath.points.length > 0) {
    const firstPoint = mmToCanvas(splinePath.points[0].position.x, splinePath.points[0].position.y);
    ctx.fillStyle = splinePath.isComplete ? "#3b82f6" : "#f59e0b";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(splinePath.name, firstPoint.x + 15, firstPoint.y - 10);
  }
}

/**
 * Draw a smooth spline curve through the given points (future enhancement)
 */
export function drawSplineCurve(
  ctx: CanvasRenderingContext2D,
  points: SplinePathPoint[],
  utils: RobotDrawingUtils
) {
  if (points.length < 2) return;

  const { mmToCanvas } = utils;

  // For now, draw straight lines - this will be enhanced with actual spline curves
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);

  ctx.beginPath();
  const firstPoint = mmToCanvas(points[0].position.x, points[0].position.y);
  ctx.moveTo(firstPoint.x, firstPoint.y);

  for (let i = 1; i < points.length; i++) {
    const point = mmToCanvas(points[i].position.x, points[i].position.y);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}