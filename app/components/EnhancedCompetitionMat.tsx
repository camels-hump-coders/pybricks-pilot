import { useCallback, useEffect, useRef, useState } from "react";
import type { GameMatConfig, Mission } from "../schemas/GameMatConfig";
import type { TelemetryData } from "../services/pybricksHub";
import {
  telemetryHistory,
  type ColorMode,
  type PathVisualizationOptions,
  type TelemetryPoint,
} from "../services/telemetryHistory";

interface RobotPosition {
  x: number; // mm from left edge of mat (0 = left edge)
  y: number; // mm from bottom edge of mat (0 = bottom edge, positive = upward)
  heading: number; // degrees, 0 = north/forward
}

interface EnhancedCompetitionMatProps {
  telemetryData: TelemetryData | null;
  isConnected: boolean;
  onRobotPositionSet?: (position: RobotPosition) => void;
  onResetTelemetry?: () => void;
  customMatConfig?: GameMatConfig | null;
  showScoring?: boolean;
  onScoreUpdate?: (score: number) => void;
  movementPreview?: {
    type: "drive" | "turn" | null;
    direction: "forward" | "backward" | "left" | "right" | null;
    positions: {
      primary: RobotPosition | null;
      secondary: RobotPosition | null;
    };
  } | null;
  controlMode?: "incremental" | "continuous";
  onRobotPositionChange?: (position: RobotPosition) => void;
}

// FLL Competition Mat and Table dimensions (all in mm)
const MAT_WIDTH_MM = 2356; // Actual mat width
const MAT_HEIGHT_MM = 1137; // Actual mat height
const TABLE_WIDTH_MM = 2786; // Table interior width (82mm wider than mat)
const TABLE_HEIGHT_MM = 1140; // Table interior height (4mm taller than mat)
const BORDER_WALL_HEIGHT_MM = 36; // 36mm tall border walls
const BORDER_WALL_THICKNESS_MM = 36; // Border wall thickness (same as height)

const ROBOT_WIDTH_MM = 180; // Typical FLL robot width
const ROBOT_LENGTH_MM = 200; // Typical FLL robot length
const WHEEL_WIDTH_MM = 20;

interface ObjectiveState {
  completed: boolean;
  points: number;
}

interface ScoringState {
  [objectId: string]: {
    objectives: {
      [objectiveId: string]: ObjectiveState;
    };
  };
}

// Helper functions for scoring
const getTotalPointsForMission = (
  mission: Mission,
  scoringState: ScoringState
): number => {
  const state = scoringState[mission.id];
  if (!state?.objectives) return 0;

  if (mission.scoringMode === "single-select") {
    // For single-select, only one objective can be completed at a time
    const completedObjective = Object.values(state.objectives).find(
      (objState) => objState.completed
    );
    return completedObjective ? completedObjective.points : 0;
  } else {
    // For multi-select (default), sum all completed objectives
    return Object.values(state.objectives).reduce(
      (sum, objState) => sum + (objState.completed ? objState.points : 0),
      0
    );
  }
};

const getMaxPointsForMission = (mission: Mission): number => {
  if (mission.scoringMode === "single-select") {
    // For single-select, max is the highest single objective
    return Math.max(...mission.objectives.map((objective) => objective.points));
  } else {
    // For multi-select (default), max is sum of all objectives
    return mission.objectives.reduce(
      (sum, objective) => sum + objective.points,
      0
    );
  }
};

const isMissionScored = (
  mission: Mission,
  scoringState: ScoringState
): boolean => {
  const state = scoringState[mission.id];
  if (!state?.objectives) return false;

  return Object.values(state.objectives).some((objState) => objState.completed);
};

export function EnhancedCompetitionMat({
  telemetryData,
  isConnected,
  onRobotPositionSet,
  onResetTelemetry,
  customMatConfig,
  showScoring = false,
  onScoreUpdate,
  movementPreview,
  controlMode = "incremental",
  onRobotPositionChange,
}: EnhancedCompetitionMatProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const matImageRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  const [isSettingPosition, setIsSettingPosition] = useState(false);
  const [mousePosition, setMousePosition] = useState<RobotPosition | null>(
    null
  );
  const [currentPosition, setCurrentPosition] = useState<RobotPosition>({
    x: 2140, // Bottom right X position
    y: 108, // Bottom right Y position
    heading: 0,
  });
  const [telemetryReference, setTelemetryReference] =
    useState<RobotPosition>(currentPosition);
  const [accumulatedTelemetry, setAccumulatedTelemetry] = useState({
    distance: 0,
    angle: 0,
  });
  const [manualHeadingAdjustment, setManualHeadingAdjustment] = useState(0);
  const [scoringState, setScoringState] = useState<ScoringState>({});
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const [showObjectivesModal, setShowObjectivesModal] = useState(false);
  const [popoverObject, setPopoverObject] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  const [missionsExpanded, setMissionsExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [missionBounds, setMissionBounds] = useState<
    Map<string, { x: number; y: number; width: number; height: number }>
  >(new Map());

  // Path visualization state
  const [pathOptions, setPathOptions] = useState<PathVisualizationOptions>({
    showPath: true,
    showMarkers: true,
    colorMode: "none",
    opacity: 0.8,
    strokeWidth: 3,
  });
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryPoint | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number>(-1);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Start telemetry recording when robot connects
  useEffect(() => {
    if (isConnected) {
      console.log(
        "[EnhancedCompetitionMat] Robot connected, starting telemetry recording"
      );
      telemetryHistory.onMatReset(); // This will start a new recording session

      // Notify parent of initial robot position
      onRobotPositionChange?.(currentPosition);
    }
  }, [isConnected]); // Only depend on isConnected, not currentPosition

  // Load and process mat image
  useEffect(() => {
    if (customMatConfig) {
      const img = new Image();
      img.onload = () => {
        matImageRef.current = img;
        // Force canvas size update and redraw
        updateCanvasSize();
      };

      // Load image from URL (either from Vite import or custom path)
      if (customMatConfig.imageUrl) {
        // From Vite glob import
        img.src = customMatConfig.imageUrl;
      } else {
        console.warn(
          "No image URL provided for mat config:",
          customMatConfig.name
        );
      }
    }
  }, [customMatConfig]);

  // Calculate canvas size and scale based on container
  const updateCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Include border walls in total dimensions
    const totalWidth = TABLE_WIDTH_MM + 2 * BORDER_WALL_THICKNESS_MM;
    const totalHeight = TABLE_HEIGHT_MM + 2 * BORDER_WALL_THICKNESS_MM;

    // Calculate scale to fit container
    const scaleX = containerWidth / totalWidth;
    const scaleY = containerHeight / totalHeight;
    const newScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1:1

    setScale(newScale);
    setCanvasSize({
      width: totalWidth * newScale,
      height: totalHeight * newScale,
    });
  };

  // Convert mm to canvas pixels (accounts for mat position within table)
  const mmToCanvas = (mmX: number, mmY: number): { x: number; y: number } => {
    // Use exact same calculation as drawMissions function
    const matOffset = BORDER_WALL_THICKNESS_MM * scale;
    const matX =
      matOffset + (TABLE_WIDTH_MM * scale - MAT_WIDTH_MM * scale) / 2;
    const matY = matOffset + (TABLE_HEIGHT_MM * scale - MAT_HEIGHT_MM * scale);

    // Convert mm coordinates to mat canvas coordinates
    const canvasX = matX + mmX * scale;
    const canvasY = matY + (MAT_HEIGHT_MM * scale - mmY * scale); // Flip Y coordinate

    return { x: canvasX, y: canvasY };
  };

  // Convert canvas pixels to mm (accounts for mat position within table)
  const canvasToMm = (
    canvasX: number,
    canvasY: number
  ): { x: number; y: number } => {
    // Use exact same calculation as drawMissions function
    const matOffset = BORDER_WALL_THICKNESS_MM * scale;
    const matX =
      matOffset + (TABLE_WIDTH_MM * scale - MAT_WIDTH_MM * scale) / 2;
    const matY = matOffset + (TABLE_HEIGHT_MM * scale - MAT_HEIGHT_MM * scale);

    // Convert canvas coordinates to mm within the mat
    const mmX = (canvasX - matX) / scale;
    const mmY = (MAT_HEIGHT_MM * scale - (canvasY - matY)) / scale; // Flip Y coordinate

    return { x: mmX, y: mmY };
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    // Clear canvas with a neutral background
    ctx.fillStyle = "#e5e5e5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the glossy black table surface with gradient for depth
    const tableGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    tableGradient.addColorStop(0, "#1a1a1a");
    tableGradient.addColorStop(0.5, "#0d0d0d");
    tableGradient.addColorStop(1, "#000000");
    ctx.fillStyle = tableGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add subtle glossy highlight overlay
    const glossGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    glossGradient.addColorStop(0, "rgba(255, 255, 255, 0.03)");
    glossGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
    glossGradient.addColorStop(1, "rgba(255, 255, 255, 0.03)");
    ctx.fillStyle = glossGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height / 3);

    // Draw border walls (3D effect)
    drawBorderWalls(ctx);

    // Calculate mat position - centered horizontally, flush with bottom edge of table surface
    const borderOffset = BORDER_WALL_THICKNESS_MM * scale;
    const matWidth = MAT_WIDTH_MM * scale;
    const matHeight = MAT_HEIGHT_MM * scale;
    const tableWidth = TABLE_WIDTH_MM * scale;
    const tableHeight = TABLE_HEIGHT_MM * scale;

    // Mat is centered horizontally within the table surface (3mm gap on each side)
    const matX = borderOffset + (tableWidth - matWidth) / 2;
    // Mat is flush with the bottom edge of the table surface (6mm gap at top, 0mm at bottom)
    const matY = borderOffset + (tableHeight - matHeight);

    // Draw a subtle shadow under the mat for depth
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10 * scale;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;

    // Draw mat background or image
    if (matImageRef.current) {
      // Draw the de-skewed mat image
      ctx.drawImage(matImageRef.current, matX, matY, matWidth, matHeight);
    } else {
      // Fallback: plain mat with grid
      ctx.fillStyle = "#f8f9fa";
      ctx.fillRect(matX, matY, matWidth, matHeight);
      drawGrid(ctx, matX, matY, matWidth, matHeight);
    }

    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw missions if custom mat
    if (customMatConfig && showScoring) {
      drawMissions(ctx);
    }

    // Draw telemetry path
    if (pathOptions.showPath) {
      drawTelemetryPath(ctx);
    }

    // Draw robot
    if (isSettingPosition && mousePosition) {
      drawRobot(ctx, mousePosition, true);
    }
    drawRobot(ctx, currentPosition, false);

    // Draw movement preview robots (dual previews)
    if (
      movementPreview?.positions &&
      controlMode === "incremental" &&
      currentPosition.x > 0 &&
      currentPosition.y > 0
    ) {
      // Draw primary preview robot
      if (movementPreview.positions.primary) {
        drawRobot(
          ctx,
          movementPreview.positions.primary,
          true,
          "primary",
          movementPreview.direction
        );
      }

      // Draw secondary preview robot
      if (movementPreview.positions.secondary) {
        // Determine the opposite direction for secondary preview
        let oppositeDirection: "forward" | "backward" | "left" | "right";
        if (movementPreview.type === "drive") {
          oppositeDirection =
            movementPreview.direction === "forward" ? "backward" : "forward";
        } else {
          oppositeDirection =
            movementPreview.direction === "left" ? "right" : "left";
        }
        drawRobot(
          ctx,
          movementPreview.positions.secondary,
          true,
          "secondary",
          oppositeDirection
        );
      }
    }

    // Draw score display if scoring is enabled
    if (showScoring) {
      drawScoreDisplay(ctx);
    }
  };

  const drawBorderWalls = (ctx: CanvasRenderingContext2D) => {
    const thickness = BORDER_WALL_THICKNESS_MM * scale;
    const width = canvasSize.width;
    const height = canvasSize.height;

    // Create more pronounced 3D effect for walls
    // Top wall
    const topGradient = ctx.createLinearGradient(0, 0, 0, thickness);
    topGradient.addColorStop(0, "#808080");
    topGradient.addColorStop(0.3, "#606060");
    topGradient.addColorStop(0.7, "#404040");
    topGradient.addColorStop(1, "#303030");
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, width, thickness);

    // Bottom wall
    const bottomGradient = ctx.createLinearGradient(
      0,
      height - thickness,
      0,
      height
    );
    bottomGradient.addColorStop(0, "#303030");
    bottomGradient.addColorStop(0.3, "#404040");
    bottomGradient.addColorStop(0.7, "#606060");
    bottomGradient.addColorStop(1, "#808080");
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, height - thickness, width, thickness);

    // Left wall
    const leftGradient = ctx.createLinearGradient(0, 0, thickness, 0);
    leftGradient.addColorStop(0, "#707070");
    leftGradient.addColorStop(0.3, "#505050");
    leftGradient.addColorStop(0.7, "#353535");
    leftGradient.addColorStop(1, "#252525");
    ctx.fillStyle = leftGradient;
    ctx.fillRect(0, 0, thickness, height);

    // Right wall
    const rightGradient = ctx.createLinearGradient(
      width - thickness,
      0,
      width,
      0
    );
    rightGradient.addColorStop(0, "#252525");
    rightGradient.addColorStop(0.3, "#353535");
    rightGradient.addColorStop(0.7, "#505050");
    rightGradient.addColorStop(1, "#707070");
    ctx.fillStyle = rightGradient;
    ctx.fillRect(width - thickness, 0, thickness, height);

    // Draw inner edge highlight for depth
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      thickness,
      thickness,
      width - 2 * thickness,
      height - 2 * thickness
    );

    // Draw outer edge shadow
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  };

  const drawGrid = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;

    // Draw grid lines every 200mm
    const gridSize = 200 * scale;

    // Vertical lines
    for (let i = gridSize; i < width; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y + height);
      ctx.stroke();
    }

    // Horizontal lines
    for (let i = gridSize; i < height; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, y + i);
      ctx.lineTo(x + width, y + i);
      ctx.stroke();
    }
  };

  const drawRobot = (
    ctx: CanvasRenderingContext2D,
    position: RobotPosition,
    isGhost = false,
    previewType?: "primary" | "secondary",
    direction?: "forward" | "backward" | "left" | "right"
  ) => {
    const pos = mmToCanvas(position.x, position.y);
    const heading = (position.heading * Math.PI) / 180;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(heading);

    const robotWidth = ROBOT_WIDTH_MM * scale;
    const robotLength = ROBOT_LENGTH_MM * scale;

    if (isGhost) {
      // Preview robot - make it highly visible with bright colors
      ctx.globalAlpha = 0.9; // More opaque than before

      // Different colors for different movement directions
      let bodyColor, borderColor;
      if (direction === "forward") {
        // Forward - subtle green (matching forward button)
        bodyColor = "rgba(0, 255, 0, 0.15)";
        borderColor = "#00ff00";
      } else if (direction === "backward") {
        // Backward - subtle orange (matching backward button)
        bodyColor = "rgba(255, 165, 0, 0.15)";
        borderColor = "#ffa500";
      } else if (direction === "left") {
        // Left - subtle purple (matching left turn button)
        bodyColor = "rgba(128, 0, 128, 0.15)";
        borderColor = "#800080";
      } else if (direction === "right") {
        // Right - subtle blue (matching right turn button)
        bodyColor = "rgba(37, 99, 235, 0.15)"; // Tailwind blue-600
        borderColor = "#2563eb";
      } else {
        // Default preview - subtle cyan
        bodyColor = "rgba(0, 255, 255, 0.15)";
        borderColor = "#00ffff";
      }

      // Robot body with preview-specific colors
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 4; // Thicker border for preview

      ctx.fillRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
      ctx.strokeRect(
        -robotWidth / 2,
        -robotLength / 2,
        robotWidth,
        robotLength
      );

      // Wheels - bright white
      const wheelWidth = WHEEL_WIDTH_MM * scale;
      const wheelLength = 60 * scale;
      const wheelOffset = robotWidth / 2 - wheelWidth / 2;

      ctx.fillStyle = "rgba(255, 255, 255, 0.9)"; // Bright white wheels
      ctx.fillRect(
        -wheelOffset - wheelWidth / 2,
        -wheelLength / 2,
        wheelWidth,
        wheelLength
      );
      ctx.fillRect(
        wheelOffset - wheelWidth / 2,
        -wheelLength / 2,
        wheelWidth,
        wheelLength
      );

      // Direction indicator for preview - different colors for different directions
      let indicatorColor;
      if (direction === "forward") {
        indicatorColor = "#00ff00"; // Bright green (matching forward button)
      } else if (direction === "backward") {
        indicatorColor = "#ffa500"; // Bright orange (matching backward button)
      } else if (direction === "left") {
        indicatorColor = "#800080"; // Bright purple (matching left turn button)
      } else if (direction === "right") {
        indicatorColor = "#2563eb"; // Deep blue (matching right turn button)
      } else {
        indicatorColor = "#ffff00"; // Default yellow
      }

      ctx.strokeStyle = indicatorColor;
      ctx.lineWidth = 6; // Much thicker for visibility
      ctx.beginPath();
      ctx.moveTo(0, -robotLength / 3);
      ctx.lineTo(-robotWidth / 6, -robotLength / 6);
      ctx.moveTo(0, -robotLength / 3);
      ctx.lineTo(robotWidth / 6, -robotLength / 6);
      ctx.stroke();

      // Add a bright center point for preview
      ctx.fillStyle = indicatorColor;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, 2 * Math.PI); // Larger center point
      ctx.fill();

      // Add a subtle glow effect around the preview robot
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 10;
      ctx.strokeRect(
        -robotWidth / 2,
        -robotLength / 2,
        robotWidth,
        robotLength
      );
      ctx.shadowBlur = 0; // Reset shadow
    } else {
      // Regular robot - keep existing styling
      ctx.globalAlpha = 0.75;

      // Robot body
      ctx.fillStyle = "#007bff";
      ctx.strokeStyle = "#0056b3";
      ctx.lineWidth = 2;

      ctx.fillRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
      ctx.strokeRect(
        -robotWidth / 2,
        -robotLength / 2,
        robotWidth,
        robotLength
      );

      // Wheels
      const wheelWidth = WHEEL_WIDTH_MM * scale;
      const wheelLength = 60 * scale;
      const wheelOffset = robotWidth / 2 - wheelWidth / 2;

      ctx.fillStyle = "#333";
      ctx.fillRect(
        -wheelOffset - wheelWidth / 2,
        -wheelLength / 2,
        wheelWidth,
        wheelLength
      );
      ctx.fillRect(
        wheelOffset - wheelWidth / 2,
        -wheelLength / 2,
        wheelWidth,
        wheelLength
      );

      // Direction indicator for regular robot
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -robotLength / 3);
      ctx.lineTo(-robotWidth / 6, -robotLength / 6);
      ctx.moveTo(0, -robotLength / 3);
      ctx.lineTo(robotWidth / 6, -robotLength / 6);
      ctx.stroke();

      // Center point
      ctx.fillStyle = "#ff0000";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.restore();
  };

  const drawMissions = (ctx: CanvasRenderingContext2D) => {
    if (!customMatConfig) return;

    const matOffset = BORDER_WALL_THICKNESS_MM * scale;
    const matX =
      matOffset + (TABLE_WIDTH_MM * scale - MAT_WIDTH_MM * scale) / 2;
    const matY = matOffset + (TABLE_HEIGHT_MM * scale - MAT_HEIGHT_MM * scale);

    // Store bounding boxes for accurate hit detection
    const newBounds = new Map<
      string,
      { x: number; y: number; width: number; height: number }
    >();

    customMatConfig.missions.forEach((obj) => {
      // Convert normalized position (0-1) to canvas coordinates
      // Position is relative to the mat, not the table
      const canvasX = matX + obj.position.x * MAT_WIDTH_MM * scale;
      const canvasY = matY + obj.position.y * MAT_HEIGHT_MM * scale;
      const pos = { x: canvasX, y: canvasY };

      const isScored = isMissionScored(obj, scoringState);
      const currentPoints = getTotalPointsForMission(obj, scoringState);
      const maxPoints = getMaxPointsForMission(obj);
      const isHovered = hoveredObject === obj.id;

      // Draw object marker with hover effect
      const baseSize = 12 * scale;
      const radius = isHovered ? baseSize * 1.3 : baseSize;

      // Measure text to calculate bounding box
      ctx.font = `${12 * scale}px sans-serif`;
      const text = `${obj.name} (${currentPoints}/${maxPoints}pts)`;
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = 12 * scale;

      // Calculate bounding box that includes both circle and text
      // Text is positioned at (pos.x + 15 * scale, pos.y - 5 * scale)
      const boundingBox = {
        x: pos.x - radius,
        y: pos.y - radius - textHeight,
        width: Math.max(radius * 2, 15 * scale + textWidth),
        height: radius * 2 + textHeight,
      };
      newBounds.set(obj.id, boundingBox);

      // Draw hover background if needed
      if (isHovered) {
        ctx.fillStyle = "rgba(0, 123, 255, 0.1)";
        ctx.fillRect(
          boundingBox.x - 5,
          boundingBox.y - 5,
          boundingBox.width + 10,
          boundingBox.height + 10
        );
      }

      ctx.fillStyle = isScored
        ? isHovered
          ? "rgba(0, 255, 0, 1)"
          : "rgba(0, 255, 0, 0.8)"
        : isHovered
          ? "rgba(255, 165, 0, 1)"
          : "rgba(255, 165, 0, 0.8)";
      ctx.strokeStyle = isScored ? "#00aa00" : "#ff8800";
      ctx.lineWidth = isHovered ? 3 : 2;

      // Draw hover ring
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(0, 123, 255, 0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = isScored ? "#00aa00" : "#ff8800";
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.stroke();

      // Draw label
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeText(text, pos.x + 15 * scale, pos.y - 5 * scale);
      ctx.fillText(text, pos.x + 15 * scale, pos.y - 5 * scale);
    });

    // Update the stored bounds
    setMissionBounds(newBounds);
  };

  const drawScoreDisplay = (ctx: CanvasRenderingContext2D) => {
    const totalScore =
      customMatConfig?.missions.reduce(
        (sum, obj) => sum + getTotalPointsForMission(obj, scoringState),
        0
      ) || 0;

    const maxScore =
      customMatConfig?.missions.reduce(
        (sum, obj) => sum + getMaxPointsForMission(obj),
        0
      ) || 0;

    // Draw score box
    const boxWidth = 200 * scale;
    const boxHeight = 60 * scale;
    const margin = 20 * scale;

    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(
      canvasSize.width - boxWidth - margin,
      margin,
      boxWidth,
      boxHeight
    );

    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      canvasSize.width - boxWidth - margin,
      margin,
      boxWidth,
      boxHeight
    );

    // Draw score text
    ctx.fillStyle = "#ffd700";
    ctx.font = `bold ${24 * scale}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      `Score: ${totalScore}/${maxScore}`,
      canvasSize.width - boxWidth / 2 - margin,
      margin + boxHeight / 2 + 8 * scale
    );
    ctx.textAlign = "left";
  };

  const drawTelemetryPath = (ctx: CanvasRenderingContext2D) => {
    const currentPath = telemetryHistory.getCurrentPath();
    const allPaths = telemetryHistory.getAllPaths();

    // Draw all completed paths first
    allPaths.forEach((path) => {
      drawPath(ctx, path.points, pathOptions.opacity * 0.7);
    });

    // Draw current recording path
    if (currentPath && currentPath.points.length > 0) {
      drawPath(ctx, currentPath.points, pathOptions.opacity);
    }
  };

  const drawPath = (
    ctx: CanvasRenderingContext2D,
    points: TelemetryPoint[],
    opacity: number
  ) => {
    if (points.length < 2) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = pathOptions.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw path segments
    for (let i = 0; i < points.length - 1; i++) {
      const point1 = points[i];
      const point2 = points[i + 1];

      const pos1 = mmToCanvas(point1.x, point1.y);
      const pos2 = mmToCanvas(point2.x, point2.y);

      // Get color based on visualization mode
      const color = telemetryHistory.getColorForPoint(
        point1,
        pathOptions.colorMode
      );
      ctx.strokeStyle = color;

      ctx.beginPath();
      ctx.moveTo(pos1.x, pos1.y);
      ctx.lineTo(pos2.x, pos2.y);
      ctx.stroke();
    }

    // Draw markers if enabled
    if (pathOptions.showMarkers) {
      points.forEach((point, index) => {
        const pos = mmToCanvas(point.x, point.y);
        const color = telemetryHistory.getColorForPoint(
          point,
          pathOptions.colorMode
        );

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

    ctx.restore();
  };

  const checkScoringCollisions = useCallback(
    (robotPos: RobotPosition) => {
      if (!customMatConfig) return;

      const robotRadius = Math.max(ROBOT_WIDTH_MM, ROBOT_LENGTH_MM) / 2;
      const collisionRadius = robotRadius + 50; // 50mm collision buffer

      customMatConfig.missions.forEach((obj) => {
        const objX = obj.position.x * MAT_WIDTH_MM;
        const objY = (1 - obj.position.y) * MAT_HEIGHT_MM;

        const distance = Math.sqrt(
          Math.pow(robotPos.x - objX, 2) + Math.pow(robotPos.y - objY, 2)
        );

        // Use callback form to check state
        setScoringState((prev) => {
          const isScored =
            prev[obj.id]?.objectives &&
            Object.values(prev[obj.id].objectives).some((o) => o.completed);

          if (
            distance < collisionRadius &&
            !isScored &&
            obj.objectives.length > 0
          ) {
            // Auto-complete the first objective when robot collides with mission
            const firstObjective = obj.objectives[0];
            const currentObjectives = prev[obj.id]?.objectives || {};
            const newState = {
              ...prev,
              [obj.id]: {
                objectives: {
                  ...currentObjectives,
                  [firstObjective.id]: {
                    completed: true,
                    points: firstObjective.points,
                  },
                },
              },
            };

            const newTotal =
              customMatConfig?.missions.reduce(
                (sum, object) =>
                  sum + getTotalPointsForMission(object, newState),
                0
              ) || 0;
            onScoreUpdate?.(newTotal);

            return newState;
          }

          return prev; // No change
        });
      });
    },
    [customMatConfig, onScoreUpdate]
  );

  // Handle telemetry updates
  useEffect(() => {
    if (!telemetryData?.drivebase || !isConnected) return;

    const { drivebase } = telemetryData;
    const currentDistance = drivebase.distance || 0;
    const currentAngle = drivebase.angle || 0;

    setAccumulatedTelemetry((prev) => {
      const deltaDistance = currentDistance - prev.distance;
      const deltaAngle = currentAngle - prev.angle;

      if (Math.abs(deltaDistance) < 0.01 && Math.abs(deltaAngle) < 0.01) {
        // No significant change, don't update
        return prev;
      }

      return {
        distance: currentDistance,
        angle: currentAngle,
      };
    });

    // Calculate and update position in a separate effect to avoid nested state updates
    const deltaDistance = currentDistance - accumulatedTelemetry.distance;
    const deltaAngle = currentAngle - accumulatedTelemetry.angle;

    if (Math.abs(deltaDistance) >= 0.01 || Math.abs(deltaAngle) >= 0.01) {
      setCurrentPosition((prevPos) => {
        const totalHeadingChange = currentAngle + manualHeadingAdjustment;
        const currentHeading =
          (telemetryReference.heading + totalHeadingChange) % 360;

        // Use the current heading from telemetry, not the previous position heading
        // This ensures movement is calculated based on the robot's current orientation
        const movementHeading = currentHeading;
        const movementHeadingRad = (movementHeading * Math.PI) / 180;

        // Apply scaling factor to correct for the 2x distance issue
        // The telemetry appears to be reporting distances that result in 2x movement on the virtual mat
        const scalingFactor = 1; // We might need to reduce movement by half to correct the 2x issue
        const scaledDeltaDistance = deltaDistance * scalingFactor;

        const deltaX = scaledDeltaDistance * Math.sin(movementHeadingRad);
        const deltaY = scaledDeltaDistance * Math.cos(movementHeadingRad);

        const newPosition: RobotPosition = {
          x: Math.max(0, Math.min(MAT_WIDTH_MM, prevPos.x + deltaX)),
          y: Math.max(0, Math.min(MAT_HEIGHT_MM, prevPos.y + deltaY)),
          heading: currentHeading,
        };

        // Add telemetry point to history if recording
        if (telemetryHistory.isRecordingActive() && telemetryData) {
          telemetryHistory.addTelemetryPoint(
            telemetryData,
            newPosition.x,
            newPosition.y,
            newPosition.heading
          );
        }

        // Check for mission collisions
        if (customMatConfig && showScoring) {
          checkScoringCollisions(newPosition);
        }

        // Notify parent component of position change
        onRobotPositionChange?.(newPosition);

        return newPosition;
      });
    }
  }, [
    telemetryData?.drivebase?.distance,
    telemetryData?.drivebase?.angle,
    isConnected,
    telemetryReference.heading,
    manualHeadingAdjustment,
    accumulatedTelemetry.distance,
    accumulatedTelemetry.angle,
    customMatConfig,
    showScoring,
    checkScoringCollisions,
  ]);

  const checkMissionClick = (
    canvasX: number,
    canvasY: number
  ): string | null => {
    if (!customMatConfig || !showScoring) return null;

    // Check against stored bounding boxes for accurate hit detection
    for (const [objId, bounds] of missionBounds) {
      if (
        canvasX >= bounds.x &&
        canvasX <= bounds.x + bounds.width &&
        canvasY >= bounds.y &&
        canvasY <= bounds.y + bounds.height
      ) {
        return objId;
      }
    }

    return null;
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Account for canvas scaling: convert display coordinates to actual canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    // Check for mission clicks first (if scoring is enabled)
    if (showScoring && !isSettingPosition) {
      const clickedObjectId = checkMissionClick(canvasX, canvasY);
      if (clickedObjectId) {
        setPopoverObject(clickedObjectId);
        setPopoverPosition({ x: event.clientX, y: event.clientY });
        return;
      } else {
        // Close popover if clicking elsewhere
        setPopoverObject(null);
        setPopoverPosition(null);
      }
    }

    // Handle position setting (existing logic)
    if (!isSettingPosition) return;

    const mm = canvasToMm(canvasX, canvasY);

    if (
      mm.x >= 0 &&
      mm.x <= MAT_WIDTH_MM &&
      mm.y >= 0 &&
      mm.y <= MAT_HEIGHT_MM
    ) {
      const newPosition: RobotPosition = {
        x: mm.x,
        y: mm.y,
        heading: currentPosition.heading,
      };

      setCurrentPosition(newPosition);
      setTelemetryReference(newPosition);
      setAccumulatedTelemetry({ distance: 0, angle: 0 });
      setManualHeadingAdjustment(0);
      onRobotPositionSet?.(newPosition);
    }
  };

  const handleCanvasMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Account for canvas scaling: convert display coordinates to actual canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    // Check for telemetry point hover (if path visualization is enabled and not setting position)
    if (pathOptions.showMarkers && !isSettingPosition) {
      checkTelemetryPointHover(canvasX, canvasY, event.pageX, event.pageY);
    } else {
      setHoveredPoint(null);
      setHoveredPointIndex(-1);
      setTooltipPosition(null);
    }

    // Check for mission hover
    if (showScoring && !isSettingPosition) {
      const hoveredObjectId = checkMissionClick(canvasX, canvasY);
      setHoveredObject(hoveredObjectId);
    } else {
      setHoveredObject(null);
    }

    if (!isSettingPosition) return;

    const mm = canvasToMm(canvasX, canvasY);

    if (
      mm.x >= 0 &&
      mm.x <= MAT_WIDTH_MM &&
      mm.y >= 0 &&
      mm.y <= MAT_HEIGHT_MM
    ) {
      setMousePosition({
        x: mm.x,
        y: mm.y,
        heading: currentPosition.heading,
      });
    }
  };

  const checkTelemetryPointHover = (
    canvasX: number,
    canvasY: number,
    pageX: number,
    pageY: number
  ) => {
    const currentPath = telemetryHistory.getCurrentPath();
    const allPaths = telemetryHistory.getAllPaths();
    const allPoints: {
      point: TelemetryPoint;
      pathIndex: number;
      pointIndex: number;
    }[] = [];

    // Collect all points from all paths
    allPaths.forEach((path, pathIndex) => {
      path.points.forEach((point, pointIndex) => {
        allPoints.push({ point, pathIndex: pathIndex + 1, pointIndex });
      });
    });

    // Add current path points
    if (currentPath && currentPath.points.length > 0) {
      currentPath.points.forEach((point, pointIndex) => {
        allPoints.push({ point, pathIndex: 0, pointIndex }); // 0 for current path
      });
    }

    // Find closest point within hover radius
    let closestPoint = null;
    let closestDistance = Infinity;
    let closestIndex = -1;
    const hoverRadius = 10; // pixels

    allPoints.forEach(({ point, pointIndex }) => {
      const pos = mmToCanvas(point.x, point.y);
      const distance = Math.sqrt(
        Math.pow(canvasX - pos.x, 2) + Math.pow(canvasY - pos.y, 2)
      );

      if (distance <= hoverRadius && distance < closestDistance) {
        closestDistance = distance;
        closestPoint = point;
        closestIndex = pointIndex;
      }
    });

    setHoveredPoint(closestPoint);
    setHoveredPointIndex(closestIndex);

    if (closestPoint) {
      setTooltipPosition({ x: pageX, y: pageY });
    } else {
      setTooltipPosition(null);
    }
  };

  const toggleObjective = (
    objectId: string,
    objectiveId: string,
    points: number
  ) => {
    setScoringState((prev) => {
      const currentObjectives = prev[objectId]?.objectives || {};
      const isCompleted = currentObjectives[objectiveId]?.completed || false;
      const mission = customMatConfig?.missions.find((m) => m.id === objectId);

      let newObjectives = { ...currentObjectives };

      if (mission?.scoringMode === "single-select") {
        if (isCompleted) {
          // If clicking on already selected objective in single-select, deselect it
          newObjectives = {
            ...currentObjectives,
            [objectiveId]: {
              completed: false,
              points: points,
            },
          };
        } else {
          // In single-select mode, clear all other objectives and set only this one
          newObjectives = {};
          // Clear all objectives first
          mission.objectives.forEach((objective) => {
            newObjectives[objective.id] = {
              completed: false,
              points: objective.points,
            };
          });
          // Then set the selected one
          newObjectives[objectiveId] = {
            completed: true,
            points: points,
          };
        }
      } else {
        // Multi-select mode (default) - just toggle the objective
        newObjectives = {
          ...currentObjectives,
          [objectiveId]: {
            completed: !isCompleted,
            points: points,
          },
        };
      }

      const newState = {
        ...prev,
        [objectId]: {
          objectives: newObjectives,
        },
      };

      const newTotal =
        customMatConfig?.missions.reduce(
          (sum, object) => sum + getTotalPointsForMission(object, newState),
          0
        ) || 0;
      onScoreUpdate?.(newTotal);

      return newState;
    });
  };

  // Update canvas size on mount and resize
  useEffect(() => {
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, []);

  // Update canvas size when mat config changes
  useEffect(() => {
    // Small delay to ensure container is properly sized
    const timer = setTimeout(() => {
      updateCanvasSize();
    }, 50);
    return () => clearTimeout(timer);
  }, [customMatConfig]);

  // Redraw when dependencies change
  useEffect(() => {
    drawCanvas();
  }, [
    canvasSize,
    scale,
    currentPosition,
    mousePosition,
    isSettingPosition,
    scoringState,
    customMatConfig,
    showScoring,
    matImageRef.current,
    hoveredObject,
    pathOptions,
    hoveredPointIndex,
    telemetryHistory.getCurrentPath(),
    telemetryHistory.getAllPaths(),
    movementPreview,
    controlMode,
  ]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Competition Table & Mat
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {customMatConfig ? customMatConfig.name : "Loading..."} - Mat:{" "}
              {MAT_WIDTH_MM}×{MAT_HEIGHT_MM}mm, Table: {TABLE_WIDTH_MM}×
              {TABLE_HEIGHT_MM}mm with {BORDER_WALL_HEIGHT_MM}mm walls
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Path Visualization Controls */}
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
              <label className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                Path:
              </label>

              {/* Show Path Toggle */}
              <label
                className="flex items-center gap-1 cursor-pointer"
                title="Show/hide path lines"
              >
                <input
                  type="checkbox"
                  checked={pathOptions.showPath}
                  onChange={(e) =>
                    setPathOptions((prev) => ({
                      ...prev,
                      showPath: e.target.checked,
                    }))
                  }
                  className="w-3 h-3"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Lines
                </span>
              </label>

              {/* Show Markers Toggle */}
              <label
                className="flex items-center gap-1 cursor-pointer"
                title="Show/hide interactive markers"
              >
                <input
                  type="checkbox"
                  checked={pathOptions.showMarkers}
                  onChange={(e) =>
                    setPathOptions((prev) => ({
                      ...prev,
                      showMarkers: e.target.checked,
                    }))
                  }
                  className="w-3 h-3"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Dots
                </span>
              </label>

              {/* Color Mode Selector */}
              <select
                value={pathOptions.colorMode}
                onChange={(e) =>
                  setPathOptions((prev) => ({
                    ...prev,
                    colorMode: e.target.value as ColorMode,
                  }))
                }
                className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                title="Choose how to color the robot's path: Solid (blue), Speed (green→red), Motor Load (blue→red), Color Sensor (actual colors), Distance (red=close, green=far), Reflection (black→white), Force (light→dark)"
              >
                <option value="none">Solid</option>
                <option value="speed">Speed</option>
                <option value="motorLoad">Motor Load</option>
                <option value="colorSensor">Color Sensor</option>
                <option value="distanceSensor">Distance</option>
                <option value="reflectionSensor">Reflection</option>
                <option value="forceSensor">Force</option>
              </select>
            </div>

            <button
              onClick={() => setIsSettingPosition(!isSettingPosition)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                isSettingPosition
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              {isSettingPosition ? "✓ Confirm Position" : "📍 Set Position"}
            </button>

            <button
              onClick={() => {
                setCurrentPosition(telemetryReference);
                setAccumulatedTelemetry({ distance: 0, angle: 0 });
                setManualHeadingAdjustment(0);
                setScoringState({});
                onResetTelemetry?.();
                onScoreUpdate?.(0);
                telemetryHistory.clearHistory();
              }}
              className="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-4 rounded-lg"
        style={{ minHeight: "500px" }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => {
            setMousePosition(null);
            setHoveredObject(null);
            setHoveredPoint(null);
            setHoveredPointIndex(-1);
            setTooltipPosition(null);
          }}
          className={`block mx-auto rounded shadow-2xl ${
            isSettingPosition
              ? "cursor-crosshair"
              : hoveredObject
                ? "cursor-pointer"
                : "cursor-default"
          }`}
          style={{ maxWidth: "100%", maxHeight: "600px" }}
        />

        {!isConnected && (
          <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 bg-opacity-75 flex items-center justify-center">
            <div className="text-center text-gray-600 dark:text-gray-300">
              <div className="text-4xl mb-2">🔌</div>
              <p className="font-medium">
                Connect to hub to see robot movement
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Telemetry Tooltip */}
      {hoveredPoint && tooltipPosition && (
        <div
          className="fixed z-50 bg-black bg-opacity-90 text-white text-xs rounded-lg p-3 pointer-events-none max-w-xs"
          style={{
            left: `${tooltipPosition.x + 10}px`,
            top: `${tooltipPosition.y - 10}px`,
            transform: "translateY(-100%)",
          }}
        >
          <div className="space-y-1">
            <div className="font-semibold text-yellow-300 border-b border-gray-600 pb-1 mb-2">
              Telemetry Point
            </div>
            <div>
              <span className="text-gray-300">Time:</span>
              <span className="ml-2">
                {(() => {
                  const currentPath = telemetryHistory.getCurrentPath();
                  const allPaths = telemetryHistory.getAllPaths();

                  // Find the recording start time
                  let recordingStartTime = hoveredPoint.timestamp;

                  // Check if this point is in the current path
                  if (
                    currentPath &&
                    currentPath.points.some(
                      (p) => p.timestamp === hoveredPoint.timestamp
                    )
                  ) {
                    recordingStartTime = currentPath.startTime;
                  } else {
                    // Check completed paths
                    for (const path of allPaths) {
                      if (
                        path.points.some(
                          (p) => p.timestamp === hoveredPoint.timestamp
                        )
                      ) {
                        recordingStartTime = path.startTime;
                        break;
                      }
                    }
                  }

                  const relativeTime =
                    (hoveredPoint.timestamp - recordingStartTime) / 1000;
                  return `${relativeTime.toFixed(1)}s`;
                })()}
              </span>
            </div>
            <div>
              <span className="text-gray-300">Position:</span>
              <span className="ml-2">
                {Math.round(hoveredPoint.x)}, {Math.round(hoveredPoint.y)}mm
              </span>
            </div>
            <div>
              <span className="text-gray-300">Heading:</span>
              <span className="ml-2">{Math.round(hoveredPoint.heading)}°</span>
            </div>
            {hoveredPoint.data.drivebase && (
              <div>
                <span className="text-gray-300">Speed:</span>
                <span className="ml-2">
                  {Math.round(
                    hoveredPoint.data.drivebase.state?.drive_speed || 0
                  )}
                  mm/s
                </span>
              </div>
            )}
            {hoveredPoint.data.motors &&
              Object.keys(hoveredPoint.data.motors).length > 0 && (
                <>
                  <div className="border-t border-gray-600 pt-2 mt-2">
                    <div className="text-gray-300 font-medium mb-1">
                      Motors:
                    </div>
                    {Object.entries(hoveredPoint.data.motors)
                      .filter(
                        ([name]) =>
                          !["left", "right"].includes(name.toLowerCase())
                      )
                      .map(([name, motor]) => (
                        <div key={name} className="ml-2 mb-1">
                          <span className="text-green-300 font-medium">
                            {name}:
                          </span>
                          <div className="ml-2 text-xs">
                            <div className="flex justify-between">
                              <span>Angle:</span>
                              <span>{Math.round(motor.angle)}°</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Speed:</span>
                              <span>{Math.round(motor.speed)}°/s</span>
                            </div>
                            {motor.load !== undefined && (
                              <div className="flex justify-between">
                                <span>Load:</span>
                                <span
                                  className={
                                    motor.load > 80
                                      ? "text-red-300"
                                      : motor.load > 50
                                        ? "text-yellow-300"
                                        : "text-green-300"
                                  }
                                >
                                  {Math.round(motor.load)}%
                                </span>
                              </div>
                            )}
                            {motor.error && (
                              <div className="text-red-300 text-xs">
                                Error: {motor.error}
                              </div>
                            )}
                            {Math.abs(motor.speed) < 1 &&
                              Math.abs(motor.load || 0) > 20 && (
                                <div className="text-orange-300 text-xs">
                                  ⚠ Stalled
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            {hoveredPoint.data.sensors &&
              Object.keys(hoveredPoint.data.sensors).length > 0 && (
                <>
                  <div className="border-t border-gray-600 pt-2 mt-2">
                    <div className="text-gray-300 font-medium mb-1">
                      Sensors:
                    </div>
                    {Object.entries(hoveredPoint.data.sensors).map(
                      ([name, data]) => (
                        <div key={name} className="ml-2">
                          <span className="text-blue-300 font-medium">
                            {name}:
                          </span>
                          {data.color && (
                            <div className="ml-2 flex items-center gap-2">
                              <span>Color:</span>
                              <div
                                className="w-4 h-4 rounded border border-white/30 inline-block"
                                style={{
                                  backgroundColor:
                                    telemetryHistory.getColorForPoint(
                                      hoveredPoint,
                                      "colorSensor"
                                    ),
                                }}
                              ></div>
                              <span>
                                {data.color.toString().replace("Color.", "")}
                              </span>
                            </div>
                          )}
                          {data.distance !== undefined && (
                            <div className="ml-2">
                              Distance: {Math.round(data.distance)}mm
                            </div>
                          )}
                          {data.reflection !== undefined && (
                            <div className="ml-2">
                              Reflection: {Math.round(data.reflection)}%
                            </div>
                          )}
                          {data.force !== undefined && (
                            <div className="ml-2">
                              Force: {data.force.toFixed(1)}N
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {/* Missions List */}
      {customMatConfig && showScoring && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">
              Missions
            </h4>
            <button
              onClick={() => setMissionsExpanded(!missionsExpanded)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <span
                className={`transition-transform ${missionsExpanded ? "rotate-90" : "rotate-0"}`}
              >
                ▶
              </span>
              {missionsExpanded ? "Collapse" : "Expand"} (
              {customMatConfig.missions.length})
            </button>
          </div>
          {missionsExpanded && (
            <div className="space-y-4">
              {customMatConfig.missions.map((obj) => (
                <div
                  key={obj.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-gray-800 dark:text-gray-200">
                      {obj.name}
                    </h5>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {getTotalPointsForMission(obj, scoringState)}/
                      {getMaxPointsForMission(obj)}pts
                    </span>
                  </div>
                  {obj.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {obj.description}
                    </p>
                  )}
                  <div className="space-y-1">
                    {obj.objectives.map((objective) => {
                      const objectiveState =
                        scoringState[obj.id]?.objectives?.[objective.id];
                      const isCompleted = objectiveState?.completed || false;
                      const isSingleSelect =
                        obj.scoringMode === "single-select";

                      return (
                        <button
                          key={objective.id}
                          onClick={() =>
                            toggleObjective(
                              obj.id,
                              objective.id,
                              objective.points
                            )
                          }
                          className={`w-full text-left p-2 rounded text-sm transition-colors ${
                            isCompleted
                              ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                              : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <span className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <span className="flex-shrink-0">
                                {isSingleSelect ? (
                                  <span
                                    className={`w-3 h-3 rounded-full border-2 inline-block ${
                                      isCompleted
                                        ? "bg-green-600 border-green-600"
                                        : "border-gray-400 dark:border-gray-500"
                                    }`}
                                  >
                                    {isCompleted && (
                                      <span className="block w-1 h-1 bg-white rounded-full mx-auto mt-0.5"></span>
                                    )}
                                  </span>
                                ) : (
                                  <span
                                    className={`w-3 h-3 rounded border inline-block ${
                                      isCompleted
                                        ? "bg-green-600 border-green-600"
                                        : "border-gray-400 dark:border-gray-500"
                                    }`}
                                  >
                                    {isCompleted && (
                                      <span className="text-white text-xs leading-none">
                                        ✓
                                      </span>
                                    )}
                                  </span>
                                )}
                              </span>
                              <span>{objective.description}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-xs">
                                {objective.points}pts
                              </span>
                              {objective.type === "bonus" && (
                                <span className="text-orange-500 text-xs">
                                  bonus
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Position Info */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-gray-200 dark:border-gray-700">
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">
            Position
          </div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            X: {Math.round(currentPosition.x)}mm
            <br />
            Y: {Math.round(currentPosition.y)}mm
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">
            Heading
          </div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            {Math.round(currentPosition.heading)}°
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">
            Distance
          </div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            {telemetryData?.drivebase?.distance
              ? Math.round(telemetryData.drivebase.distance)
              : 0}
            mm
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">
            Rotation
          </div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            {telemetryData?.drivebase?.angle
              ? Math.round(telemetryData.drivebase.angle)
              : 0}
            °
          </div>
        </div>
      </div>

      {/* Mission Scoring Popover */}
      {popoverObject && popoverPosition && customMatConfig && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 max-w-sm"
          style={{
            left: `${Math.min(popoverPosition.x, window.innerWidth - 320)}px`,
            top: `${Math.max(10, popoverPosition.y - 100)}px`,
          }}
        >
          {(() => {
            const obj = customMatConfig.missions.find(
              (o) => o.id === popoverObject
            );
            if (!obj) return null;

            const currentPoints = getTotalPointsForMission(obj, scoringState);
            const maxPoints = getMaxPointsForMission(obj);

            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                    {obj.name}
                  </h4>
                  <button
                    onClick={() => {
                      setPopoverObject(null);
                      setPopoverPosition(null);
                    }}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    ✕
                  </button>
                </div>

                {obj.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    {obj.description}
                  </p>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Score: {currentPoints}/{maxPoints} points
                </div>

                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {obj.objectives.map((objective) => {
                    const objectiveState =
                      scoringState[obj.id]?.objectives?.[objective.id];
                    const isCompleted = objectiveState?.completed || false;
                    const isSingleSelect = obj.scoringMode === "single-select";

                    return (
                      <button
                        key={objective.id}
                        onClick={() =>
                          toggleObjective(
                            obj.id,
                            objective.id,
                            objective.points
                          )
                        }
                        className={`w-full text-left p-2 rounded text-xs transition-colors ${
                          isCompleted
                            ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                            : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 flex-1 pr-2">
                            <span className="flex-shrink-0">
                              {isSingleSelect ? (
                                <span
                                  className={`w-3 h-3 rounded-full border-2 inline-block ${
                                    isCompleted
                                      ? "bg-green-600 border-green-600"
                                      : "border-gray-400 dark:border-gray-500"
                                  }`}
                                >
                                  {isCompleted && (
                                    <span className="block w-1 h-1 bg-white rounded-full mx-auto mt-0.5"></span>
                                  )}
                                </span>
                              ) : (
                                <span
                                  className={`w-3 h-3 rounded border inline-block ${
                                    isCompleted
                                      ? "bg-green-600 border-green-600"
                                      : "border-gray-400 dark:border-gray-500"
                                  }`}
                                >
                                  {isCompleted && (
                                    <span className="text-white text-xs leading-none">
                                      ✓
                                    </span>
                                  )}
                                </span>
                              )}
                            </span>
                            <span>{objective.description}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">
                              {objective.points}pts
                            </span>
                            {objective.type === "bonus" && (
                              <span className="text-orange-500 text-xs bg-orange-100 dark:bg-orange-900 px-1 rounded">
                                bonus
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
