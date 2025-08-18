import type { Mission, GameMatConfig } from "../../schemas/GameMatConfig";
import type { Mission as MissionPlannerMission, MissionPointType, ActionPoint } from "../../types/missionPlanner";
import type { RobotConfig } from "../../schemas/RobotConfig";
import { LEGO_STUD_SIZE_MM } from "../../schemas/RobotConfig";

export interface MissionDrawingUtils {
  mmToCanvas: (x: number, y: number) => { x: number; y: number };
  scale: number;
}

import { 
  isMissionScored, 
  getTotalPointsForMission, 
  getMaxPointsForMission, 
  type ScoringState 
} from "../../utils/scoringUtils";

/**
 * Draw missions on the canvas
 */
export function drawMissions(
  ctx: CanvasRenderingContext2D,
  customMatConfig: GameMatConfig | null,
  scoringState: ScoringState,
  hoveredObject: string | null,
  utils: MissionDrawingUtils,
  matDimensions: {
    matWidthMm: number;
    matHeightMm: number;
    borderWallThickness: number;
    tableWidth: number;
    tableHeight: number;
  },
  onMissionBoundsUpdate?: (bounds: Map<string, { x: number; y: number; width: number; height: number }>) => void
) {
  if (!customMatConfig) return;

  const { mmToCanvas, scale } = utils;
  const { matWidthMm, matHeightMm, borderWallThickness, tableWidth, tableHeight } = matDimensions;

  const matOffset = borderWallThickness * scale;
  const matX = matOffset + (tableWidth * scale - matWidthMm * scale) / 2;
  const matY = matOffset + (tableHeight * scale - matHeightMm * scale);

  // Store bounding boxes for accurate hit detection
  const newBounds = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  customMatConfig.missions.forEach((mission) => {
    // Convert normalized position (0-1) to world coordinates (mm), then to canvas coordinates
    const worldX = mission.position.x * matWidthMm;
    const worldY = mission.position.y * matHeightMm;
    const pos = mmToCanvas(worldX, worldY);

    const isScored = isMissionScored(mission, scoringState);
    const currentPoints = getTotalPointsForMission(mission, scoringState);
    const maxPoints = getMaxPointsForMission(mission);
    const isHovered = hoveredObject === mission.id;

    // Draw object marker with hover effect - larger for mobile touch targets
    const baseSize = Math.max(12 * scale, 16); // Minimum 16px for mobile
    const radius = isHovered ? baseSize * 1.4 : baseSize;

    // Calculate bounding box for just the circle marker
    // Make hit box larger for better mobile interaction
    const hitBoxPadding = Math.max(8 * scale, 12); // Minimum 12px padding
    const boundingBox = {
      x: pos.x - radius - hitBoxPadding,
      y: pos.y - radius - hitBoxPadding,
      width: radius * 2 + hitBoxPadding * 2,
      height: radius * 2 + hitBoxPadding * 2,
    };
    newBounds.set(mission.id, boundingBox);

    // Draw hover background if needed
    if (isHovered) {
      ctx.fillStyle = "rgba(0, 123, 255, 0.15)";
      ctx.fillRect(
        boundingBox.x - 2,
        boundingBox.y - 2,
        boundingBox.width + 4,
        boundingBox.height + 4
      );
    }

    // Draw outer glow for better visibility
    ctx.shadowColor = isScored
      ? "rgba(0, 255, 0, 0.6)"
      : "rgba(255, 165, 0, 0.6)";
    ctx.shadowBlur = isHovered ? 8 : 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Calculate percentage completion
    const completionPercentage = maxPoints > 0 ? currentPoints / maxPoints : 0;

    // Draw hover ring
    if (isHovered) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 6, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(0, 123, 255, 0.8)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Draw base circle (orange background for unearned points)
    ctx.fillStyle = isHovered
      ? "rgba(255, 165, 0, 1)"
      : "rgba(255, 165, 0, 0.9)";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    ctx.fill();

    // Draw pie chart section for earned points (green)
    if (completionPercentage > 0) {
      ctx.fillStyle = isHovered
        ? "rgba(0, 255, 0, 1)"
        : "rgba(0, 255, 0, 0.9)";
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y); // Start at center
      ctx.arc(
        pos.x,
        pos.y,
        radius,
        -Math.PI / 2, // Start at top (12 o'clock)
        -Math.PI / 2 + completionPercentage * 2 * Math.PI, // End based on percentage
        false // Clockwise
      );
      ctx.closePath(); // Close the pie slice
      ctx.fill();
    }

    // Draw border around entire circle
    ctx.strokeStyle = completionPercentage >= 1 ? "#00aa00" : "#ff8800";
    ctx.lineWidth = isHovered ? 4 : 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;
  });

  // Update the stored bounds if callback provided
  if (onMissionBoundsUpdate) {
    onMissionBoundsUpdate(newBounds);
  }
}

/**
 * Draw mission planner points and connections on the canvas
 */
export function drawMissionPlanner(
  ctx: CanvasRenderingContext2D,
  mission: MissionPlannerMission | null,
  utils: MissionDrawingUtils,
  options: {
    showConnections?: boolean;
    highlightedPointId?: string | null;
    selectedPointId?: string | null;
    showRobotGhosts?: boolean;
    robotConfig?: RobotConfig | null;
  } = {}
) {
  if (!mission || mission.points.length === 0) return;

  const { mmToCanvas, scale } = utils;
  const { showConnections = true, highlightedPointId = null, selectedPointId = null, showRobotGhosts = false, robotConfig = null } = options;

  // Draw connections between points first (so they appear behind points)
  if (showConnections && mission.points.length > 1) {
    ctx.strokeStyle = "#6b7280"; // gray-500
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([5 * scale, 5 * scale]); // Dashed line

    for (let i = 0; i < mission.points.length - 1; i++) {
      const currentPoint = mission.points[i];
      const nextPoint = mission.points[i + 1];

      const fromPos = mmToCanvas(currentPoint.x, currentPoint.y);
      const toPos = mmToCanvas(nextPoint.x, nextPoint.y);

      ctx.beginPath();
      ctx.moveTo(fromPos.x, fromPos.y);
      ctx.lineTo(toPos.x, toPos.y);
      ctx.stroke();
    }

    ctx.setLineDash([]); // Reset line dash
  }

  // Draw each point
  mission.points.forEach((point, index) => {
    drawMissionPoint(ctx, point, index, utils, {
      isHighlighted: point.id === highlightedPointId,
      isSelected: point.id === selectedPointId,
      showRobotGhost: showRobotGhosts,
      robotConfig: robotConfig,
    });
  });
}

/**
 * Draw a single mission point
 */
export function drawMissionPoint(
  ctx: CanvasRenderingContext2D,
  point: MissionPointType,
  index: number,
  utils: MissionDrawingUtils,
  options: {
    isHighlighted?: boolean;
    isSelected?: boolean;
    showRobotGhost?: boolean;
    robotConfig?: RobotConfig | null;
  } = {}
) {
  const { mmToCanvas, scale } = utils;
  const { isHighlighted = false, isSelected = false, showRobotGhost = false, robotConfig = null } = options;
  
  const pos = mmToCanvas(point.x, point.y);

  // Point styling based on type
  let fillColor = "#6b7280"; // gray-500 default
  let strokeColor = "#374151"; // gray-700 default
  let size = 8 * scale;

  switch (point.type) {
    case "start":
      fillColor = "#10b981"; // emerald-500
      strokeColor = "#065f46"; // emerald-800
      size = 10 * scale;
      break;
    case "end":
      fillColor = "#ef4444"; // red-500
      strokeColor = "#991b1b"; // red-800
      size = 10 * scale;
      break;
    case "waypoint":
      fillColor = "#3b82f6"; // blue-500
      strokeColor = "#1e3a8a"; // blue-800
      size = 8 * scale;
      break;
    case "action":
      fillColor = "#8b5cf6"; // violet-500
      strokeColor = "#5b21b6"; // violet-800
      size = 10 * scale;
      break;
  }

  // Draw robot ghost for action points
  if (point.type === "action" && showRobotGhost && robotConfig) {
    drawRobotGhost(ctx, point as ActionPoint, pos, utils, robotConfig);
  }

  // Highlight ring for selected point
  if (isSelected) {
    ctx.strokeStyle = "#fbbf24"; // amber-400
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size + 4 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Highlight ring for hovered point
  if (isHighlighted) {
    ctx.strokeStyle = "#f59e0b"; // amber-500
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size + 2 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw main point circle
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Draw heading indicator for action points
  if (point.type === "action") {
    drawHeadingIndicator(ctx, point as ActionPoint, pos, size, utils);
  }

  // Draw point index number
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.max(10 * scale, 10)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((index + 1).toString(), pos.x, pos.y);
}

/**
 * Draw a heading indicator arrow for action points
 */
function drawHeadingIndicator(
  ctx: CanvasRenderingContext2D,
  point: ActionPoint,
  pos: { x: number; y: number },
  pointSize: number,
  utils: MissionDrawingUtils
) {
  const { scale } = utils;
  const headingRadians = (point.heading * Math.PI) / 180;
  
  // Arrow starts from the edge of the point circle
  const arrowStartDistance = pointSize + 2 * scale;
  const arrowLength = 20 * scale;
  
  const startX = pos.x + Math.sin(headingRadians) * arrowStartDistance;
  const startY = pos.y - Math.cos(headingRadians) * arrowStartDistance;
  
  const endX = pos.x + Math.sin(headingRadians) * (arrowStartDistance + arrowLength);
  const endY = pos.y - Math.cos(headingRadians) * (arrowStartDistance + arrowLength);

  // Draw arrow line
  ctx.strokeStyle = "#ef4444"; // red-500
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Draw arrowhead
  const arrowheadSize = 8 * scale;
  const angle1 = headingRadians + (5 * Math.PI) / 6;
  const angle2 = headingRadians - (5 * Math.PI) / 6;
  
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - Math.sin(angle1) * arrowheadSize, endY + Math.cos(angle1) * arrowheadSize);
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - Math.sin(angle2) * arrowheadSize, endY + Math.cos(angle2) * arrowheadSize);
  ctx.stroke();
}

/**
 * Draw a ghost robot preview for action points
 */
function drawRobotGhost(
  ctx: CanvasRenderingContext2D,
  point: ActionPoint,
  pos: { x: number; y: number },
  utils: MissionDrawingUtils,
  robotConfig: RobotConfig | null = null
) {
  const { scale } = utils;
  const headingRadians = (point.heading * Math.PI) / 180;
  
  // Use robot config dimensions if available, otherwise fallback to approximate FLL robot size
  let robotWidth = 40 * scale;
  let robotLength = 50 * scale;
  
  if (robotConfig) {
    // Convert from studs to mm, then to canvas pixels
    robotWidth = (robotConfig.dimensions.width * LEGO_STUD_SIZE_MM) * scale;
    robotLength = (robotConfig.dimensions.length * LEGO_STUD_SIZE_MM) * scale;
  }
  
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(headingRadians);

  // Draw ghost robot outline (semi-transparent)
  ctx.fillStyle = "rgba(139, 92, 246, 0.2)"; // violet-500 with low opacity (matches action point color)
  ctx.strokeStyle = "rgba(139, 92, 246, 0.6)"; // violet-500 with medium opacity
  ctx.lineWidth = 2 * scale;
  
  const halfWidth = robotWidth / 2;
  const halfLength = robotLength / 2;
  
  ctx.fillRect(-halfWidth, -halfLength, robotWidth, robotLength);
  ctx.strokeRect(-halfWidth, -halfLength, robotWidth, robotLength);
  
  // Draw front indicator (small rectangle at the front)
  ctx.fillStyle = "rgba(139, 92, 246, 0.8)"; // violet-500 with higher opacity
  const frontIndicatorWidth = halfWidth * 0.6;
  const frontIndicatorHeight = Math.min(6 * scale, robotLength * 0.15);
  ctx.fillRect(-frontIndicatorWidth / 2, -halfLength, frontIndicatorWidth, frontIndicatorHeight);

  ctx.restore();
}

/**
 * Draw a preview of the point being placed at the mouse position
 */
export function drawMissionPointPreview(
  ctx: CanvasRenderingContext2D,
  mousePosition: { x: number; y: number },
  pointType: "waypoint" | "action" | "start" | "end",
  actionHeading: number,
  utils: MissionDrawingUtils,
  robotConfig: RobotConfig | null = null
) {
  const { mmToCanvas, scale } = utils;
  
  // mousePosition should already be canvas coordinates from the mouse event
  const canvasX = mousePosition.x;
  const canvasY = mousePosition.y;

  // Point styling based on type (semi-transparent for preview)
  let fillColor = "rgba(107, 114, 128, 0.6)"; // gray-500 with opacity
  let strokeColor = "rgba(55, 65, 81, 0.8)"; // gray-700 with opacity
  let size = 8 * scale;

  switch (pointType) {
    case "start":
      fillColor = "rgba(16, 185, 129, 0.6)"; // emerald-500 with opacity
      strokeColor = "rgba(6, 95, 70, 0.8)"; // emerald-800 with opacity
      size = 10 * scale;
      break;
    case "end":
      fillColor = "rgba(239, 68, 68, 0.6)"; // red-500 with opacity
      strokeColor = "rgba(153, 27, 27, 0.8)"; // red-800 with opacity
      size = 10 * scale;
      break;
    case "waypoint":
      fillColor = "rgba(59, 130, 246, 0.6)"; // blue-500 with opacity
      strokeColor = "rgba(30, 58, 138, 0.8)"; // blue-800 with opacity
      size = 8 * scale;
      break;
    case "action":
      fillColor = "rgba(139, 92, 246, 0.6)"; // violet-500 with opacity
      strokeColor = "rgba(91, 33, 182, 0.8)"; // violet-800 with opacity
      size = 10 * scale;
      break;
  }

  // Draw robot ghost for action points
  if (pointType === "action" && robotConfig) {
    drawRobotGhost(
      ctx,
      { heading: actionHeading } as ActionPoint,
      { x: canvasX, y: canvasY },
      utils,
      robotConfig
    );
  }

  // Draw main preview point circle
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(canvasX, canvasY, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Draw heading indicator for action points
  if (pointType === "action") {
    drawHeadingIndicator(
      ctx,
      { heading: actionHeading } as ActionPoint,
      { x: canvasX, y: canvasY },
      size,
      utils
    );
  }

  // Draw preview label
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.font = `bold ${Math.max(12 * scale, 12)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const label = pointType.charAt(0).toUpperCase() + pointType.slice(1);
  const labelY = canvasY + size + 8 * scale;
  
  // Draw label background
  const labelWidth = ctx.measureText(label).width;
  const labelHeight = 16 * scale;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillRect(
    canvasX - labelWidth / 2 - 4,
    labelY - 2,
    labelWidth + 8,
    labelHeight + 4
  );
  
  // Draw label text
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillText(label, canvasX, labelY);

  // Add heading info for action points
  if (pointType === "action") {
    const headingLabel = `${actionHeading}°`;
    ctx.font = `${Math.max(10 * scale, 10)}px sans-serif`;
    ctx.fillText(headingLabel, canvasX, labelY + labelHeight);
  }
}