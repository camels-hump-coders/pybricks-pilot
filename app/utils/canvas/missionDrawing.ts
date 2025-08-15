import type { Mission, GameMatConfig } from "../../schemas/GameMatConfig";

export interface MissionDrawingUtils {
  mmToCanvas: (x: number, y: number) => { x: number; y: number };
  scale: number;
}

export interface ScoringState {
  [objectId: string]: {
    objectives: {
      [objectiveId: string]: {
        completed: boolean;
        points: number;
        selectedChoiceId?: string;
      };
    };
  };
}

/**
 * Check if a mission is scored (has any objectives completed)
 */
export function isMissionScored(mission: Mission, scoringState: ScoringState): boolean {
  const missionState = scoringState[mission.id];
  if (!missionState?.objectives) return false;
  
  return Object.values(missionState.objectives).some(obj => obj.completed);
}

/**
 * Get total points earned for a mission
 */
export function getTotalPointsForMission(mission: Mission, scoringState: ScoringState): number {
  const missionState = scoringState[mission.id];
  if (!missionState?.objectives) return 0;
  
  return Object.values(missionState.objectives).reduce((sum, obj) => {
    return sum + (obj.completed ? obj.points : 0);
  }, 0);
}

/**
 * Get maximum possible points for a mission
 */
export function getMaxPointsForMission(mission: Mission): number {
  return mission.objectives.reduce((sum, objective) => {
    if (objective.choices && objective.choices.length > 0) {
      // For choice objectives, use the maximum points from all choices
      return sum + Math.max(...objective.choices.map(choice => choice.points));
    } else {
      // For simple objectives, use the objective points
      return sum + (objective.points || 0);
    }
  }, 0);
}

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