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
  utils: RobotDrawingUtils,
  hoveredSplinePointId?: string | null,
  hoveredCurvatureHandlePointId?: string | null
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

      // Priority 1: Use tangency handles for smooth curves
      if (prevPoint.tangencyHandle || currentPoint.tangencyHandle) {
        // Calculate control points based on tangency handles
        let cp1 = canvasPrevPoint;
        let cp2 = canvasCurrentPoint;
        
        if (prevPoint.tangencyHandle) {
          const strength = prevPoint.tangencyHandle.strength || 0.5;
          const handlePos = mmToCanvas(
            prevPoint.position.x + prevPoint.tangencyHandle.x,
            prevPoint.position.y + prevPoint.tangencyHandle.y
          );
          // Use handle direction and strength to create outgoing control point
          const dx = handlePos.x - canvasPrevPoint.x;
          const dy = handlePos.y - canvasPrevPoint.y;
          cp1 = {
            x: canvasPrevPoint.x + dx * strength,
            y: canvasPrevPoint.y + dy * strength
          };
        }
        
        if (currentPoint.tangencyHandle) {
          const strength = currentPoint.tangencyHandle.strength || 0.5;
          const handlePos = mmToCanvas(
            currentPoint.position.x + currentPoint.tangencyHandle.x,
            currentPoint.position.y + currentPoint.tangencyHandle.y
          );
          // Use handle direction and strength to create incoming control point
          const dx = handlePos.x - canvasCurrentPoint.x;
          const dy = handlePos.y - canvasCurrentPoint.y;
          cp2 = {
            x: canvasCurrentPoint.x - dx * strength,
            y: canvasCurrentPoint.y - dy * strength
          };
        }

        // Draw bezier curve with tangency-based control points
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

    // Draw SolidWorks-style tangency handles for intermediate points
    if (point.tangencyHandle) {
      const handle = point.tangencyHandle;
      const endPos = mmToCanvas(
        point.position.x + handle.x,
        point.position.y + handle.y
      );
      
      const isHoveredTangencyHandle = hoveredCurvatureHandlePointId === point.id;
      
      // Determine handle color based on edit state (blue = edited, gray = default)
      const handleColor = handle.isEdited ? "#3b82f6" : "#6b7280"; // Blue or gray
      const hoverColor = handle.isEdited ? "#2563eb" : "#4b5563"; // Darker versions
      const currentColor = isHoveredTangencyHandle ? hoverColor : handleColor;
      
      // Draw main handle line (tangent line)
      ctx.beginPath();
      ctx.moveTo(canvasPos.x, canvasPos.y);
      ctx.lineTo(endPos.x, endPos.y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = isHoveredTangencyHandle ? 3 : 2;
      ctx.setLineDash(handle.isTangentDriving ? [] : [5, 3]); // Solid if driving, dashed if not
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Calculate grip positions for SolidWorks-style controls
      const handleLength = Math.sqrt(handle.x * handle.x + handle.y * handle.y);
      const unitX = handle.x / handleLength;
      const unitY = handle.y / handleLength;
      
      // Diamond grip (50% along handle) - Controls angle only
      const diamondPos = mmToCanvas(
        point.position.x + unitX * handleLength * 0.5,
        point.position.y + unitY * handleLength * 0.5
      );
      
      // Arrow grip (80% along handle) - Controls magnitude only  
      const arrowPos = mmToCanvas(
        point.position.x + unitX * handleLength * 0.8,
        point.position.y + unitY * handleLength * 0.8
      );
      
      // Draw diamond grip (angle control)
      ctx.save();
      ctx.translate(diamondPos.x, diamondPos.y);
      ctx.rotate(Math.atan2(handle.y, handle.x));
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(0, -4);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fillStyle = currentColor;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      
      // Draw arrow grip (magnitude control)
      ctx.save();
      ctx.translate(arrowPos.x, arrowPos.y);
      ctx.rotate(Math.atan2(handle.y, handle.x));
      ctx.beginPath();
      ctx.moveTo(-6, -3);
      ctx.lineTo(0, 0);
      ctx.lineTo(-6, 3);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      
      // Draw end-point grip (combined control) - Circle at end
      const endRadius = isHoveredTangencyHandle ? 8 : 6;
      ctx.beginPath();
      ctx.arc(endPos.x, endPos.y, endRadius, 0, 2 * Math.PI);
      ctx.fillStyle = currentColor;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add glow effect when hovered
      if (isHoveredTangencyHandle) {
        ctx.beginPath();
        ctx.arc(endPos.x, endPos.y, endRadius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(234, 88, 12, 0.3)"; // Semi-transparent orange glow
        ctx.lineWidth = 4;
        ctx.stroke();
      }
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

    // Draw point circle with hover effect
    const isHovered = hoveredSplinePointId === point.id;
    const pointRadius = isSelected ? 8 : (isHovered ? 7 : 6); // Larger when hovered
    
    // Add glow effect when hovered
    if (isHovered && !isSelected) {
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, pointRadius + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.3)"; // Semi-transparent blue glow
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    
    ctx.beginPath();
    ctx.arc(canvasPos.x, canvasPos.y, pointRadius, 0, 2 * Math.PI);
    
    // Fill color based on state
    if (isSelected) {
      ctx.fillStyle = "#ef4444"; // Red for selected
    } else if (isHovered) {
      ctx.fillStyle = "#3b82f6"; // Blue for hovered
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
function drawSplineCurve(
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
 * Find clicked tangency handle grip given mouse coordinates
 * Returns grip type: "diamond" (angle), "arrow" (magnitude), "endpoint" (both)
 */
export function findClickedTangencyHandle(
  mouseCanvasX: number,
  mouseCanvasY: number,
  splinePath: SplinePath,
  utils: RobotDrawingUtils,
  clickRadius: number = 10
): { pointId: string; gripType: "diamond" | "arrow" | "endpoint" } | null {
  if (!splinePath.points) return null;

  const { mmToCanvas } = utils;

  for (const point of splinePath.points) {
    if (!point.tangencyHandle) continue;

    const handle = point.tangencyHandle;
    const handleLength = Math.sqrt(handle.x * handle.x + handle.y * handle.y);
    const unitX = handle.x / handleLength;
    const unitY = handle.y / handleLength;

    // Calculate grip positions (same as in drawing code)
    const diamondPos = mmToCanvas(
      point.position.x + unitX * handleLength * 0.5,
      point.position.y + unitY * handleLength * 0.5
    );
    
    const arrowPos = mmToCanvas(
      point.position.x + unitX * handleLength * 0.8,
      point.position.y + unitY * handleLength * 0.8
    );
    
    const endPos = mmToCanvas(
      point.position.x + handle.x,
      point.position.y + handle.y
    );

    // Check diamond grip first (angle control)
    const diamondDistance = Math.sqrt(
      Math.pow(mouseCanvasX - diamondPos.x, 2) + Math.pow(mouseCanvasY - diamondPos.y, 2)
    );
    if (diamondDistance <= clickRadius) {
      return { pointId: point.id, gripType: "diamond" };
    }

    // Check arrow grip (magnitude control)
    const arrowDistance = Math.sqrt(
      Math.pow(mouseCanvasX - arrowPos.x, 2) + Math.pow(mouseCanvasY - arrowPos.y, 2)
    );
    if (arrowDistance <= clickRadius) {
      return { pointId: point.id, gripType: "arrow" };
    }

    // Check endpoint grip (combined control)
    const endDistance = Math.sqrt(
      Math.pow(mouseCanvasX - endPos.x, 2) + Math.pow(mouseCanvasY - endPos.y, 2)
    );
    if (endDistance <= clickRadius) {
      return { pointId: point.id, gripType: "endpoint" };
    }
  }

  return null;
}

