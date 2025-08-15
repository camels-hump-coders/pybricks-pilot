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

  // Draw smooth curves between points using curvature handles, control points, or straight lines
  if (splinePath.points.length > 1) {
    ctx.beginPath();
    const firstPoint = mmToCanvas(splinePath.points[0].position.x, splinePath.points[0].position.y);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < splinePath.points.length; i++) {
      const prevPoint = splinePath.points[i - 1];
      const currentPoint = splinePath.points[i];
      const canvasCurrentPoint = mmToCanvas(currentPoint.position.x, currentPoint.position.y);
      const canvasPrevPoint = mmToCanvas(prevPoint.position.x, prevPoint.position.y);

      // Priority 1: Use curvature handles for smooth curves
      if (prevPoint.curvatureHandle || currentPoint.curvatureHandle) {
        // Calculate control points based on curvature handles
        let cp1 = canvasPrevPoint;
        let cp2 = canvasCurrentPoint;
        
        if (prevPoint.curvatureHandle) {
          const strength = prevPoint.curvatureHandle.strength || 0.5;
          const handlePos = mmToCanvas(
            prevPoint.position.x + prevPoint.curvatureHandle.x,
            prevPoint.position.y + prevPoint.curvatureHandle.y
          );
          // Use handle direction and strength to create outgoing control point
          const dx = handlePos.x - canvasPrevPoint.x;
          const dy = handlePos.y - canvasPrevPoint.y;
          cp1 = {
            x: canvasPrevPoint.x + dx * strength,
            y: canvasPrevPoint.y + dy * strength
          };
        }
        
        if (currentPoint.curvatureHandle) {
          const strength = currentPoint.curvatureHandle.strength || 0.5;
          const handlePos = mmToCanvas(
            currentPoint.position.x + currentPoint.curvatureHandle.x,
            currentPoint.position.y + currentPoint.curvatureHandle.y
          );
          // Use handle direction and strength to create incoming control point
          const dx = handlePos.x - canvasCurrentPoint.x;
          const dy = handlePos.y - canvasCurrentPoint.y;
          cp2 = {
            x: canvasCurrentPoint.x - dx * strength,
            y: canvasCurrentPoint.y - dy * strength
          };
        }

        // Draw bezier curve with curvature-based control points
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, canvasCurrentPoint.x, canvasCurrentPoint.y);
      }
      // Priority 2: Use manual control points if available
      else if (prevPoint.controlPoints?.after || currentPoint.controlPoints?.before) {
        // Calculate control points
        let cp1 = canvasPrevPoint;
        let cp2 = canvasCurrentPoint;
        
        if (prevPoint.controlPoints?.after) {
          cp1 = mmToCanvas(
            prevPoint.position.x + prevPoint.controlPoints.after.x,
            prevPoint.position.y + prevPoint.controlPoints.after.y
          );
        }
        
        if (currentPoint.controlPoints?.before) {
          cp2 = mmToCanvas(
            currentPoint.position.x + currentPoint.controlPoints.before.x,
            currentPoint.position.y + currentPoint.controlPoints.before.y
          );
        }

        // Draw bezier curve
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, canvasCurrentPoint.x, canvasCurrentPoint.y);
      } 
      // Priority 3: Draw straight line
      else {
        ctx.lineTo(canvasCurrentPoint.x, canvasCurrentPoint.y);
      }
    }
    ctx.stroke();
  }

  // Draw individual points
  splinePath.points.forEach((point, index) => {
    const canvasPos = mmToCanvas(point.position.x, point.position.y);
    const isSelected = selectedPointId === point.id;
    const isFirst = index === 0;
    const isLast = index === splinePath.points.length - 1;

    // Draw curvature handle for intermediate points
    if (point.curvatureHandle) {
      const handlePos = mmToCanvas(
        point.position.x + point.curvatureHandle.x,
        point.position.y + point.curvatureHandle.y
      );
      
      // Draw handle line
      ctx.beginPath();
      ctx.moveTo(canvasPos.x, canvasPos.y);
      ctx.lineTo(handlePos.x, handlePos.y);
      ctx.strokeStyle = "#f97316"; // Orange for curvature handles
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw handle circle
      ctx.beginPath();
      ctx.arc(handlePos.x, handlePos.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = "#f97316"; // Orange fill
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add visual indicator for strength (inner circle)
      const strengthRadius = 2 + (point.curvatureHandle.strength * 3);
      ctx.beginPath();
      ctx.arc(handlePos.x, handlePos.y, strengthRadius, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    // Draw control points if they exist and point is selected
    if (isSelected && point.controlPoints) {
      if (point.controlPoints.before) {
        const controlPos = mmToCanvas(
          point.position.x + point.controlPoints.before.x,
          point.position.y + point.controlPoints.before.y
        );
        
        // Draw control line
        ctx.beginPath();
        ctx.moveTo(canvasPos.x, canvasPos.y);
        ctx.lineTo(controlPos.x, controlPos.y);
        ctx.strokeStyle = "#8b5cf6"; // Purple for control lines
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw control point handle
        ctx.beginPath();
        ctx.arc(controlPos.x, controlPos.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#8b5cf6";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      if (point.controlPoints.after) {
        const controlPos = mmToCanvas(
          point.position.x + point.controlPoints.after.x,
          point.position.y + point.controlPoints.after.y
        );
        
        // Draw control line
        ctx.beginPath();
        ctx.moveTo(canvasPos.x, canvasPos.y);
        ctx.lineTo(controlPos.x, controlPos.y);
        ctx.strokeStyle = "#ec4899"; // Pink for control lines
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw control point handle
        ctx.beginPath();
        ctx.arc(controlPos.x, controlPos.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#ec4899";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

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

    // Draw point number or robot icon
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    if (isFirst) {
      // Show "R" for robot starting position instead of number
      ctx.fillText("R", canvasPos.x, canvasPos.y);
    } else {
      ctx.fillText((index + 1).toString(), canvasPos.x, canvasPos.y);
    }

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

/**
 * Find clicked control point given mouse coordinates
 */
export function findClickedControlPoint(
  mouseCanvasX: number,
  mouseCanvasY: number,
  splinePath: SplinePath,
  utils: RobotDrawingUtils,
  clickRadius: number = 8
): { pointId: string; controlType: "before" | "after" } | null {
  if (!splinePath.points) return null;

  const { mmToCanvas } = utils;

  for (const point of splinePath.points) {
    if (!point.controlPoints) continue;

    // Check "before" control point
    if (point.controlPoints.before) {
      const controlPos = mmToCanvas(
        point.position.x + point.controlPoints.before.x,
        point.position.y + point.controlPoints.before.y
      );
      
      const distance = Math.sqrt(
        Math.pow(mouseCanvasX - controlPos.x, 2) + Math.pow(mouseCanvasY - controlPos.y, 2)
      );
      
      if (distance <= clickRadius) {
        return { pointId: point.id, controlType: "before" };
      }
    }

    // Check "after" control point
    if (point.controlPoints.after) {
      const controlPos = mmToCanvas(
        point.position.x + point.controlPoints.after.x,
        point.position.y + point.controlPoints.after.y
      );
      
      const distance = Math.sqrt(
        Math.pow(mouseCanvasX - controlPos.x, 2) + Math.pow(mouseCanvasY - controlPos.y, 2)
      );
      
      if (distance <= clickRadius) {
        return { pointId: point.id, controlType: "after" };
      }
    }
  }

  return null;
}

/**
 * Find clicked curvature handle given mouse coordinates
 */
export function findClickedCurvatureHandle(
  mouseCanvasX: number,
  mouseCanvasY: number,
  splinePath: SplinePath,
  utils: RobotDrawingUtils,
  clickRadius: number = 10
): { pointId: string } | null {
  if (!splinePath.points) return null;

  const { mmToCanvas } = utils;

  for (const point of splinePath.points) {
    if (!point.curvatureHandle) continue;

    const handlePos = mmToCanvas(
      point.position.x + point.curvatureHandle.x,
      point.position.y + point.curvatureHandle.y
    );
    
    const distance = Math.sqrt(
      Math.pow(mouseCanvasX - handlePos.x, 2) + Math.pow(mouseCanvasY - handlePos.y, 2)
    );
    
    if (distance <= clickRadius) {
      return { pointId: point.id };
    }
  }

  return null;
}