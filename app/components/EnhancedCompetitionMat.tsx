import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCmdKey } from "../hooks/useCmdKey";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import type { GameMatConfig, Mission } from "../schemas/GameMatConfig";
import { LEGO_STUD_SIZE_MM } from "../schemas/RobotConfig";
import {
  telemetryHistory,
  type ColorMode,
  type PathVisualizationOptions,
  type TelemetryPoint,
} from "../services/telemetryHistory";
import { showGridOverlayAtom } from "../store/atoms/gameMat";
import { ghostRobotAtom } from "../store/atoms/ghostPosition";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { allTelemetryPointsAtom } from "../store/atoms/telemetryPoints";
import { calculateTrajectoryProjection } from "./MovementPreview";
import { PseudoCodePanel } from "./PseudoCodePanel";
import { TelemetryPlayback } from "./TelemetryPlayback";

interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top edge, positive = downward)
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
}

interface EnhancedCompetitionMatProps {
  isConnected: boolean;
  customMatConfig?: GameMatConfig | null;
  showScoring?: boolean;
  controlMode?: "incremental" | "continuous";
}

// FLL Competition Mat and Table dimensions (all in mm)
const MAT_WIDTH_MM = 2356; // Actual mat width
const MAT_HEIGHT_MM = 1137; // Actual mat height
const TABLE_WIDTH_MM = 2786; // Table interior width (82mm wider than mat)
const TABLE_HEIGHT_MM = 1140; // Table interior height (4mm taller than mat)
const BORDER_WALL_HEIGHT_MM = 36; // 36mm tall border walls
const BORDER_WALL_THICKNESS_MM = 36; // Border wall thickness (same as height)

interface ObjectiveState {
  completed: boolean;
  points: number;
  // New: track which choice is selected for objectives with choices
  selectedChoiceId?: string;
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

  return Object.values(state.objectives).reduce((sum, objState) => {
    if (objState.completed) {
      return sum + objState.points;
    }
    return sum;
  }, 0);
};

const getMaxPointsForMission = (mission: Mission): number => {
  return mission.objectives.reduce((sum, objective) => {
    // All objectives now have choices, so max is the highest choice
    return sum + Math.max(...objective.choices.map((choice) => choice.points));
  }, 0);
};

const isMissionScored = (
  mission: Mission,
  scoringState: ScoringState
): boolean => {
  const state = scoringState[mission.id];
  if (!state?.objectives) return false;

  return Object.values(state.objectives).some((objState) => objState.completed);
};

// Helper function to migrate old mission format to new format
const migrateMissionFormat = (mission: any): Mission => {
  // Convert all objectives to use choices array
  const migratedObjectives = mission.objectives.map((objective: any) => {
    if (objective.choices) {
      // Already has choices, just ensure it's valid
      return {
        id: objective.id,
        description: objective.description,
        choices: objective.choices,
      };
    } else {
      // Convert simple objective to choice-based
      return {
        id: objective.id,
        description: objective.description,
        choices: [
          {
            id: objective.id,
            description: objective.description,
            points: objective.points || 0,
            type: objective.type || "primary",
          },
        ],
      };
    }
  });

  return {
    ...mission,
    objectives: migratedObjectives,
  };
};

export function EnhancedCompetitionMat({
  isConnected,
  customMatConfig,
  showScoring = false,
  controlMode = "incremental",
}: EnhancedCompetitionMatProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const matImageRef = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);

  const robotConnection = useJotaiRobotConnection();
  const { resetTelemetry, clearProgramOutputLog } = robotConnection;

  // Get robot configuration
  const robotConfig = useAtomValue(robotConfigAtom);
  const allTelemetryPoints = useAtomValue(allTelemetryPointsAtom);

  // Use Jotai for game mat state management
  const gameMat = useJotaiGameMat();
  const {
    robotPosition: currentPosition,
    setRobotPosition: setCurrentPosition,
    mousePosition,
    setMousePosition,
    telemetryReference,
    setTelemetryReference,
    manualHeadingAdjustment,
    setManualHeadingAdjustment,
    scoringState,
    setScoringState,
    updateScoring,
    resetScoring,
    resetRobotToStartPosition,
    updateRobotPositionFromTelemetry,
    movementPreview,
    setMovementPreview,
    perpendicularPreview,
    currentScore,
  } = gameMat;

  // Local state that doesn't need to be in Jotai
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const [showObjectivesModal, setShowObjectivesModal] = useState(false);
  const [accumulatedTelemetry, setAccumulatedTelemetry] = useState({
    distance: 0,
    angle: 0,
  });
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
  const [loadedImage, setLoadedImage] = useState<null | string>(null);

  // Pseudo code panel state
  const [isPseudoCodeExpanded, setIsPseudoCodeExpanded] = useState(true);
  // Telemetry playback panel state
  const [isTelemetryPlaybackExpanded, setIsTelemetryPlaybackExpanded] =
    useState(true);

  // Ghost robot state for telemetry playback
  const ghostRobot = useAtomValue(ghostRobotAtom);
  const ghostPosition = ghostRobot.isVisible ? ghostRobot.position : null;

  // Grid overlay state from Jotai atom
  const showGridOverlay = useAtomValue(showGridOverlayAtom);

  // Track if we've already initialized recording for this connection
  const recordingInitializedRef = useRef(false);

  // Start telemetry recording when robot connects (only once per connection)
  useEffect(() => {
    if (isConnected && currentPosition && !recordingInitializedRef.current) {
      telemetryHistory.onMatReset(); // This will start a new recording session

      // Mark as initialized
      recordingInitializedRef.current = true;
    } else if (!isConnected) {
      // Reset the flag when disconnected
      recordingInitializedRef.current = false;
    }
  }, [isConnected]);

  // Handle position reset events only - telemetry is handled in the combined handler below
  useEffect(() => {
    const handlePositionResetEvent = (event: CustomEvent) => {
      console.log(
        "[EnhancedCompetitionMat] Position reset received, resetting robot to start position"
      );
      // Reset robot to the starting position but keep telemetry history
      resetRobotToStartPosition();
    };

    const handleSetPositionEvent = (event: CustomEvent<{ position: any }>) => {
      const positionData = event.detail.position;
      console.log(
        "[EnhancedCompetitionMat] Position set received:",
        positionData
      );

      try {
        // Calculate robot position from edge measurements (similar to CompactRobotController logic)
        const robotConfig = robotConfigAtom;
        const matWidth = MAT_WIDTH_MM;
        const matHeight = MAT_HEIGHT_MM;

        // Convert program position to mat coordinates
        let x: number, y: number;

        if (positionData.side === "left") {
          x = positionData.fromSide; // Distance from left edge
        } else {
          x = matWidth - positionData.fromSide; // Distance from right edge
        }

        y = matHeight - positionData.fromBottom; // Distance from bottom edge (mat coordinates are top-origin)

        const robotPosition: RobotPosition = {
          x,
          y,
          heading: positionData.heading,
        };

        console.log(
          "[EnhancedCompetitionMat] Setting robot position to:",
          robotPosition
        );

        // Use the existing setRobotPosition function without reset functions to preserve telemetry
        gameMat.setRobotPosition(robotPosition);
      } catch (error) {
        console.error(
          "[EnhancedCompetitionMat] Failed to set robot position:",
          error
        );
      }
    };

    // Listen for position reset and set events
    document.addEventListener(
      "positionReset",
      handlePositionResetEvent as EventListener
    );
    document.addEventListener(
      "setPosition",
      handleSetPositionEvent as EventListener
    );

    return () => {
      document.removeEventListener(
        "positionReset",
        handlePositionResetEvent as EventListener
      );
      document.removeEventListener(
        "setPosition",
        handleSetPositionEvent as EventListener
      );
    };
  }, [resetRobotToStartPosition, gameMat]);

  // Calculate canvas size and scale based on container
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Check if container has valid dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }

    // Include border walls in total dimensions
    const totalWidth = TABLE_WIDTH_MM + 2 * BORDER_WALL_THICKNESS_MM;
    const totalHeight = TABLE_HEIGHT_MM + 2 * BORDER_WALL_THICKNESS_MM;

    // PRIORITIZE USING FULL CONTAINER WIDTH
    // Always use the full available container width for the canvas
    const newScale = Math.min(containerWidth / totalWidth, 1); // Don't scale up beyond 1:1
    const calculatedHeight = totalHeight * newScale;

    // Only update if scale actually changed to avoid infinite loops
    setScale((prevScale) => {
      if (Math.abs(prevScale - newScale) < 0.001) {
        return prevScale; // No change
      }
      return newScale;
    });

    setCanvasSize((prevSize) => {
      // Round dimensions to avoid floating-point precision issues
      // Use full container width and calculated height based on aspect ratio
      const newWidth = Math.round(containerWidth);
      const newHeight = Math.round(calculatedHeight);

      // Only update if rounded values actually changed
      if (prevSize.width === newWidth && prevSize.height === newHeight) {
        return prevSize; // No change after rounding
      }

      return {
        width: newWidth,
        height: newHeight,
      };
    });
  }, []);

  // Convert mm to canvas pixels (accounts for mat position within table)
  // STANDARDIZED COORDINATE SYSTEM: Y=0 at top, Y+ points down (no flipping needed)
  const mmToCanvas = (mmX: number, mmY: number): { x: number; y: number } => {
    // Use configured mat dimensions instead of hardcoded constants
    const matWidthMm = customMatConfig?.dimensions?.widthMm || MAT_WIDTH_MM;
    const matHeightMm = customMatConfig?.dimensions?.heightMm || MAT_HEIGHT_MM;

    // Use exact same calculation as drawMissions function
    const matOffset = BORDER_WALL_THICKNESS_MM * scale;
    const matX = matOffset + (TABLE_WIDTH_MM * scale - matWidthMm * scale) / 2;
    const matY = matOffset + (TABLE_HEIGHT_MM * scale - matHeightMm * scale);

    // Convert mm coordinates to mat canvas coordinates
    // No Y-coordinate flip - keep consistent with world coordinates (Y=0 at top)
    const canvasX = matX + mmX * scale;
    const canvasY = matY + mmY * scale; // Y=0 at top, Y+ down

    return { x: canvasX, y: canvasY };
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Canvas size is now set separately in useEffect to avoid clearing

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
    const matWidth =
      (customMatConfig?.dimensions?.widthMm || MAT_WIDTH_MM) * scale;
    const matHeight =
      (customMatConfig?.dimensions?.heightMm || MAT_HEIGHT_MM) * scale;
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
      // Draw the de-skewed mat image using configured dimensions
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
    if (currentPosition) {
      drawRobot(ctx, currentPosition, false);
    }

    // Draw ghost robot from telemetry playback
    if (ghostPosition) {
      drawRobot(ctx, ghostPosition, true, "playback");
    }

    // Draw movement preview robots (dual previews)
    if (
      movementPreview?.positions &&
      controlMode === "incremental" &&
      currentPosition &&
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
          movementPreview.direction || undefined
        );
      }

      // Draw secondary preview robot
      if (movementPreview.positions.secondary && movementPreview.direction) {
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

      // Draw trajectory projection path
      if (
        movementPreview.trajectoryProjection?.trajectoryPath &&
        movementPreview.direction
      ) {
        // Draw very subtle next move end indicator first
        if (movementPreview.trajectoryProjection.nextMoveEnd) {
          drawNextMoveEndIndicator(
            ctx,
            movementPreview.trajectoryProjection.nextMoveEnd,
            movementPreview.direction
          );
        }

        // Then draw the trajectory path
        drawTrajectoryProjection(
          ctx,
          movementPreview.trajectoryProjection.trajectoryPath,
          movementPreview.direction
        );
      }

      // Draw secondary trajectory projection if available (for dual previews when hovering over sliders)
      if (
        movementPreview.secondaryTrajectoryProjection?.trajectoryPath &&
        movementPreview.positions.secondary
      ) {
        // Determine the opposite direction for secondary trajectory
        let oppositeDirection: "forward" | "backward" | "left" | "right";
        if (movementPreview.type === "drive") {
          oppositeDirection =
            movementPreview.direction === "forward" ? "backward" : "forward";
        } else {
          oppositeDirection =
            movementPreview.direction === "left" ? "right" : "left";
        }

        // Draw very subtle next move end indicator for secondary trajectory
        if (movementPreview.secondaryTrajectoryProjection.nextMoveEnd) {
          drawNextMoveEndIndicator(
            ctx,
            movementPreview.secondaryTrajectoryProjection.nextMoveEnd,
            oppositeDirection
          );
        }

        // Draw the secondary trajectory path
        drawTrajectoryProjection(
          ctx,
          movementPreview.secondaryTrajectoryProjection.trajectoryPath,
          oppositeDirection
        );
      }
    }

    // Draw perpendicular preview trajectories - show ALL movement options when hovering over stop button
    if (
      perpendicularPreview.show &&
      perpendicularPreview.hoveredButtonType &&
      currentPosition &&
      currentPosition.x > 0 &&
      currentPosition.y > 0
    ) {
      // For stop button hover, show both drive and turn trajectories
      // Drive trajectories
      const forwardTrajectory = calculateTrajectoryProjection(
        currentPosition,
        perpendicularPreview.distance,
        perpendicularPreview.angle,
        "drive",
        "forward",
        2356,
        1137,
        robotConfig
      );
      const backwardTrajectory = calculateTrajectoryProjection(
        currentPosition,
        perpendicularPreview.distance,
        perpendicularPreview.angle,
        "drive",
        "backward",
        2356,
        1137,
        robotConfig
      );

      // Turn trajectories
      const leftTrajectory = calculateTrajectoryProjection(
        currentPosition,
        perpendicularPreview.distance,
        perpendicularPreview.angle,
        "turn",
        "left",
        2356,
        1137,
        robotConfig
      );
      const rightTrajectory = calculateTrajectoryProjection(
        currentPosition,
        perpendicularPreview.distance,
        perpendicularPreview.angle,
        "turn",
        "right",
        2356,
        1137,
        robotConfig
      );

      // Draw all trajectory options
      drawPerpendicularTrajectoryProjection(
        ctx,
        forwardTrajectory.trajectoryPath,
        "forward"
      );
      drawPerpendicularTrajectoryProjection(
        ctx,
        backwardTrajectory.trajectoryPath,
        "backward"
      );
      drawPerpendicularTrajectoryProjection(
        ctx,
        leftTrajectory.trajectoryPath,
        "left"
      );
      drawPerpendicularTrajectoryProjection(
        ctx,
        rightTrajectory.trajectoryPath,
        "right"
      );
    }

    // Draw grid overlay oriented to robot heading
    if (showGridOverlay && currentPosition) {
      drawGridOverlay(ctx, currentPosition);
    }
  }, [
    scale,
    currentPosition,
    mousePosition,
    movementPreview,
    perpendicularPreview,
    pathOptions,
    hoveredObject,
    hoveredPoint,
    customMatConfig,
    scoringState,
    showScoring,
    controlMode,
    robotConfig,
    loadedImage,
    showGridOverlay,
  ]); // canvasSize removed as it's handled separately

  // Load and process mat image
  useEffect(() => {
    if (customMatConfig) {
      const imageUrl = customMatConfig.imageUrl;
      if (!imageUrl) {
        console.warn(
          "No image URL provided for mat config:",
          customMatConfig.name
        );
        return;
      }

      const img = new Image();
      img.onload = () => {
        matImageRef.current = img;
        // Force canvas size update and redraw
        updateCanvasSize();
        setLoadedImage(imageUrl);
      };

      // Load image from URL (either from Vite import or custom path)
      // From Vite glob import
      img.src = imageUrl;
    }
  }, [customMatConfig, updateCanvasSize]);

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

  const drawGridOverlay = (
    ctx: CanvasRenderingContext2D,
    position: RobotPosition
  ) => {
    if (!position || position.x <= 0 || position.y <= 0) return;

    // Grid configuration
    const GRID_SIZE_MM = 100; // 100mm grid squares
    const gridSizePixels = GRID_SIZE_MM * scale;

    // Get robot center position in canvas coordinates
    const centerPos = mmToCanvas(position.x, position.y);

    // Convert robot heading to radians (0° = north, clockwise positive)
    const headingRad = (position.heading * Math.PI) / 180;

    // Save the current canvas state
    ctx.save();

    // Set up grid styling
    ctx.strokeStyle = "rgba(0, 150, 255, 0.3)"; // Light blue with transparency
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]); // Dashed lines

    // Calculate visible area bounds
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Number of grid lines to draw in each direction from center
    const gridExtent = 20; // Will draw 40x40 grid centered on robot

    // Translate to robot position and rotate to robot heading
    ctx.translate(centerPos.x, centerPos.y);
    ctx.rotate(headingRad);

    // Draw vertical grid lines (parallel to robot's forward direction)
    for (let i = -gridExtent; i <= gridExtent; i++) {
      const x = i * gridSizePixels;
      ctx.beginPath();
      ctx.moveTo(x, -gridExtent * gridSizePixels);
      ctx.lineTo(x, gridExtent * gridSizePixels);
      ctx.stroke();
    }

    // Draw horizontal grid lines (perpendicular to robot's forward direction)
    for (let i = -gridExtent; i <= gridExtent; i++) {
      const y = i * gridSizePixels;
      ctx.beginPath();
      ctx.moveTo(-gridExtent * gridSizePixels, y);
      ctx.lineTo(gridExtent * gridSizePixels, y);
      ctx.stroke();
    }

    // Draw thicker lines at robot's axes
    ctx.strokeStyle = "rgba(0, 100, 200, 0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([]); // Solid lines for axes

    // Forward/backward axis (Y-axis in robot's frame)
    ctx.beginPath();
    ctx.moveTo(0, -gridExtent * gridSizePixels);
    ctx.lineTo(0, gridExtent * gridSizePixels);
    ctx.stroke();

    // Left/right axis (X-axis in robot's frame)
    ctx.beginPath();
    ctx.moveTo(-gridExtent * gridSizePixels, 0);
    ctx.lineTo(gridExtent * gridSizePixels, 0);
    ctx.stroke();

    // Add grid size label
    ctx.fillStyle = "rgba(0, 100, 200, 0.7)";
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("100mm grid", gridSizePixels + 5, 5);

    // Restore the canvas state
    ctx.restore();
  };

  const drawRobot = (
    ctx: CanvasRenderingContext2D,
    position: RobotPosition,
    isGhost = false,
    previewType?: "primary" | "secondary" | "perpendicular" | "playback",
    direction?: "forward" | "backward" | "left" | "right"
  ) => {
    // SIMPLIFIED MODEL: position IS the center of rotation
    const centerOfRotationPos = mmToCanvas(position.x, position.y);
    const heading = (position.heading * Math.PI) / 180;

    // Calculate robot body offset from center of rotation
    const robotCenterX = robotConfig.dimensions.width / 2; // Center of robot width in studs
    const robotCenterY = robotConfig.dimensions.length / 2; // Center of robot length in studs
    const centerOfRotationX = robotConfig.centerOfRotation.distanceFromLeftEdge; // In studs from left edge
    const centerOfRotationY = robotConfig.centerOfRotation.distanceFromTop; // In studs from top edge

    // Calculate offset from center of rotation to robot center (in mm, scaled)
    // This is the INVERSE of the previous calculation
    const robotBodyOffsetX =
      (robotCenterX - centerOfRotationX) * LEGO_STUD_SIZE_MM * scale;
    const robotBodyOffsetY =
      (robotCenterY - centerOfRotationY) * LEGO_STUD_SIZE_MM * scale;

    ctx.save();

    // Translate to center of rotation position
    ctx.translate(centerOfRotationPos.x, centerOfRotationPos.y);
    // Rotate around center of rotation
    ctx.rotate(heading);
    // Translate to robot body center for drawing
    ctx.translate(robotBodyOffsetX, robotBodyOffsetY);

    // NOTE: Now drawing robot body at (0,0) which is the robot's geometric center

    const robotWidth = robotConfig.dimensions.width * 8 * scale; // Convert studs to mm
    const robotLength = robotConfig.dimensions.length * 8 * scale; // Convert studs to mm

    if (isGhost) {
      // Different opacity and styling based on preview type
      if (previewType === "perpendicular") {
        // Perpendicular previews should be much more subtle
        ctx.globalAlpha = 0.3;
      } else if (previewType === "playback") {
        // Playback ghost robot - distinct purple color
        ctx.globalAlpha = 0.7;
      } else {
        // Primary/secondary previews - make them highly visible
        ctx.globalAlpha = 0.9;
      }

      // Different colors for different movement directions
      let bodyColor, borderColor;
      if (previewType === "playback") {
        // Playback ghost - purple/magenta theme
        bodyColor = "rgba(147, 51, 234, 0.2)";
        borderColor = "#9333ea";
      } else if (direction === "forward") {
        // Forward - subtle green (matching forward button)
        bodyColor =
          previewType === "perpendicular"
            ? "rgba(0, 255, 0, 0.05)"
            : "rgba(0, 255, 0, 0.15)";
        borderColor = "#00ff00";
      } else if (direction === "backward") {
        // Backward - subtle orange (matching backward button)
        bodyColor =
          previewType === "perpendicular"
            ? "rgba(255, 165, 0, 0.05)"
            : "rgba(255, 165, 0, 0.15)";
        borderColor = "#ffa500";
      } else if (direction === "left") {
        // Left - subtle purple (matching left turn button)
        bodyColor =
          previewType === "perpendicular"
            ? "rgba(128, 0, 128, 0.05)"
            : "rgba(128, 0, 128, 0.15)";
        borderColor = "#800080";
      } else if (direction === "right") {
        // Right - subtle cyan (matching right turn button)
        bodyColor =
          previewType === "perpendicular"
            ? "rgba(6, 182, 212, 0.05)"
            : "rgba(6, 182, 212, 0.15)";
        borderColor = "#06b6d4";
      } else {
        // Default preview - subtle cyan
        bodyColor =
          previewType === "perpendicular"
            ? "rgba(0, 255, 255, 0.05)"
            : "rgba(0, 255, 255, 0.15)";
        borderColor = "#00ffff";
      }

      // Robot body with preview-specific colors
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = previewType === "perpendicular" ? 2 : 4; // Thinner border for perpendicular previews

      ctx.fillRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
      ctx.strokeRect(
        -robotWidth / 2,
        -robotLength / 2,
        robotWidth,
        robotLength
      );

      // Wheels - bright white, match Robot Builder sizing
      const wheelWidth = (robotConfig.wheels.left.width * scale) / 4; // Match Robot Builder scale
      const wheelDiameter = (robotConfig.wheels.left.diameter * scale) / 4; // Match Robot Builder scale

      // Convert edge-based positioning to center-based coordinates
      // Wheels are positioned from edges, so we need to convert to center-based
      const robotWidthMm = robotConfig.dimensions.width * LEGO_STUD_SIZE_MM;
      const robotLengthMm = robotConfig.dimensions.length * LEGO_STUD_SIZE_MM;

      // Left wheel is distanceFromEdge studs from left edge
      const leftWheelX =
        (-robotWidthMm / 2 +
          robotConfig.wheels.left.distanceFromEdge * LEGO_STUD_SIZE_MM) *
        scale;
      // Right wheel is distanceFromEdge studs from right edge
      const rightWheelX =
        (robotWidthMm / 2 -
          robotConfig.wheels.right.distanceFromEdge * LEGO_STUD_SIZE_MM) *
        scale;
      // Both wheels are distanceFromTop studs from top edge (top of robot)
      // In new coordinate system: top is at -length/2, bottom at +length/2
      const wheelY =
        (-robotLengthMm / 2 +
          robotConfig.wheels.left.distanceFromTop * LEGO_STUD_SIZE_MM) *
        scale;

      ctx.fillStyle = "rgba(255, 255, 255, 0.9)"; // Bright white wheels
      ctx.fillRect(
        leftWheelX - wheelWidth / 2,
        wheelY - wheelDiameter / 2,
        wheelWidth,
        wheelDiameter
      );
      ctx.fillRect(
        rightWheelX - wheelWidth / 2,
        wheelY - wheelDiameter / 2,
        wheelWidth,
        wheelDiameter
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
        indicatorColor = "#06b6d4"; // Bright cyan (matching right turn button)
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

      // Add a bright center point for preview at the center of rotation
      // SIMPLIFIED MODEL: Center of rotation is at (0,0) after transformation
      ctx.fillStyle = indicatorColor;
      ctx.beginPath();
      // Go back to center of rotation position (undo the robot body offset)
      ctx.arc(-robotBodyOffsetX, -robotBodyOffsetY, 5, 0, 2 * Math.PI); // Larger center point at center of rotation
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
      // Regular robot - use robot configuration colors
      ctx.globalAlpha = 0.75;

      // Robot body - use configured colors
      ctx.fillStyle = robotConfig.appearance.primaryColor;
      ctx.strokeStyle = robotConfig.appearance.secondaryColor;
      ctx.lineWidth = 2;

      ctx.fillRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
      ctx.strokeRect(
        -robotWidth / 2,
        -robotLength / 2,
        robotWidth,
        robotLength
      );

      // Wheels - match Robot Builder sizing
      const wheelWidth = (robotConfig.wheels.left.width * scale) / 4; // Match Robot Builder scale
      const wheelDiameter = (robotConfig.wheels.left.diameter * scale) / 4; // Match Robot Builder scale

      // Convert edge-based positioning to center-based coordinates
      // Wheels are positioned from edges, so we need to convert to center-based
      const robotWidthMm = robotConfig.dimensions.width * LEGO_STUD_SIZE_MM;
      const robotLengthMm = robotConfig.dimensions.length * LEGO_STUD_SIZE_MM;

      // Left wheel is distanceFromEdge studs from left edge
      const leftWheelX =
        (-robotWidthMm / 2 +
          robotConfig.wheels.left.distanceFromEdge * LEGO_STUD_SIZE_MM) *
        scale;
      // Right wheel is distanceFromEdge studs from right edge
      const rightWheelX =
        (robotWidthMm / 2 -
          robotConfig.wheels.right.distanceFromEdge * LEGO_STUD_SIZE_MM) *
        scale;
      // Both wheels are distanceFromTop studs from top edge (top of robot)
      // In new coordinate system: top is at -length/2, bottom at +length/2
      const wheelY =
        (-robotLengthMm / 2 +
          robotConfig.wheels.left.distanceFromTop * LEGO_STUD_SIZE_MM) *
        scale;

      ctx.fillStyle = robotConfig.appearance.wheelColor;
      ctx.fillRect(
        leftWheelX - wheelWidth / 2,
        wheelY - wheelDiameter / 2,
        wheelWidth,
        wheelDiameter
      );
      ctx.fillRect(
        rightWheelX - wheelWidth / 2,
        wheelY - wheelDiameter / 2,
        wheelWidth,
        wheelDiameter
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

      // Center of rotation indicator - now at the origin since we translated to COR
      // SIMPLIFIED MODEL: Center of rotation is at (0,0) after transformation
      ctx.fillStyle = "#ff0000";
      ctx.beginPath();
      // Go back to center of rotation position (undo the robot body offset)
      ctx.arc(-robotBodyOffsetX, -robotBodyOffsetY, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.restore();
  };

  // New: Draw trajectory projection path
  const drawTrajectoryProjection = (
    ctx: CanvasRenderingContext2D,
    trajectoryPath: RobotPosition[],
    direction: "forward" | "backward" | "left" | "right"
  ) => {
    if (trajectoryPath.length < 2) return;

    ctx.save();

    // Set line style based on direction
    let lineColor, lineWidth;
    if (direction === "forward") {
      lineColor = "rgba(0, 255, 0, 0.6)"; // More visible green
      lineWidth = 4; // Thicker line
    } else if (direction === "backward") {
      lineColor = "rgba(255, 165, 0, 0.6)"; // More visible orange
      lineWidth = 4; // Thicker line
    } else if (direction === "left") {
      lineColor = "rgba(128, 0, 128, 0.6)"; // More visible purple
      lineWidth = 4; // Thicker line
    } else if (direction === "right") {
      lineColor = "rgba(6, 182, 212, 0.6)"; // More visible cyan
      lineWidth = 4; // Thicker line
    } else {
      lineColor = "rgba(0, 255, 255, 0.6)"; // Default more visible cyan
      lineWidth = 4; // Thicker line
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw the trajectory path
    ctx.beginPath();
    const startPos = mmToCanvas(trajectoryPath[0].x, trajectoryPath[0].y);
    ctx.moveTo(startPos.x, startPos.y);

    for (let i = 1; i < trajectoryPath.length; i++) {
      const pos = mmToCanvas(trajectoryPath[i].x, trajectoryPath[i].y);
      ctx.lineTo(pos.x, pos.y);
    }

    ctx.stroke();

    // Draw more visible dots at key points (next move end and board edge)
    if (trajectoryPath.length >= 2) {
      // Next move end point
      const nextMovePos = mmToCanvas(trajectoryPath[1].x, trajectoryPath[1].y);
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(nextMovePos.x, nextMovePos.y, 4, 0, 2 * Math.PI); // Larger dot
      ctx.fill();

      // Board edge projection point (if different from next move)
      if (trajectoryPath.length >= 3) {
        const boardEdgePos = mmToCanvas(
          trajectoryPath[2].x,
          trajectoryPath[2].y
        );
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(boardEdgePos.x, boardEdgePos.y, 3, 0, 2 * Math.PI); // Medium dot
        ctx.fill();
      }
    }

    ctx.restore();
  };

  // New: Draw perpendicular trajectory projection (much more subtle than primary trajectories)
  const drawPerpendicularTrajectoryProjection = (
    ctx: CanvasRenderingContext2D,
    trajectoryPath: RobotPosition[],
    direction: "forward" | "backward" | "left" | "right"
  ) => {
    if (trajectoryPath.length < 2) return;

    ctx.save();

    // Subtle but visible line style for perpendicular previews
    let lineColor, lineWidth;
    if (direction === "forward") {
      lineColor = "rgba(0, 255, 0, 0.4)"; // More visible green
      lineWidth = 3; // Thicker line for better visibility
    } else if (direction === "backward") {
      lineColor = "rgba(255, 165, 0, 0.4)"; // More visible orange
      lineWidth = 3; // Thicker line for better visibility
    } else if (direction === "left") {
      lineColor = "rgba(128, 0, 128, 0.4)"; // More visible purple
      lineWidth = 3; // Thicker line for better visibility
    } else if (direction === "right") {
      lineColor = "rgba(6, 182, 212, 0.4)"; // More visible cyan
      lineWidth = 3; // Thicker line for better visibility
    } else {
      lineColor = "rgba(0, 255, 255, 0.4)"; // Default more visible cyan
      lineWidth = 3; // Thicker line for better visibility
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([3, 3]); // Dashed line to differentiate from primary trajectories

    // Draw the trajectory path
    ctx.beginPath();
    const startPos = mmToCanvas(trajectoryPath[0].x, trajectoryPath[0].y);
    ctx.moveTo(startPos.x, startPos.y);

    for (let i = 1; i < trajectoryPath.length; i++) {
      const pos = mmToCanvas(trajectoryPath[i].x, trajectoryPath[i].y);
      ctx.lineTo(pos.x, pos.y);
    }

    ctx.stroke();

    // Skip the dots for perpendicular previews to keep them even more subtle

    ctx.restore();
  };

  // New: Draw very subtle next move end indicator
  const drawNextMoveEndIndicator = (
    ctx: CanvasRenderingContext2D,
    nextMoveEnd: RobotPosition,
    direction: "forward" | "backward" | "left" | "right"
  ) => {
    const pos = mmToCanvas(nextMoveEnd.x, nextMoveEnd.y);

    ctx.save();

    // Set more visible styling based on direction
    let indicatorColor;
    if (direction === "forward") {
      indicatorColor = "rgba(0, 255, 0, 0.3)"; // More visible green
    } else if (direction === "backward") {
      indicatorColor = "rgba(255, 165, 0, 0.3)"; // More visible orange
    } else if (direction === "left") {
      indicatorColor = "rgba(128, 0, 128, 0.3)"; // More visible purple
    } else if (direction === "right") {
      indicatorColor = "rgba(6, 182, 212, 0.3)"; // More visible cyan
    } else {
      indicatorColor = "rgba(0, 255, 255, 0.3)"; // Default more visible cyan
    }

    // Draw a more visible outline of where the robot will be
    const robotWidth = robotConfig.dimensions.width * 8 * scale; // Convert studs to mm
    const robotLength = robotConfig.dimensions.length * 8 * scale; // Convert studs to mm

    ctx.strokeStyle = indicatorColor;
    ctx.lineWidth = 2; // Thicker line for better visibility
    ctx.setLineDash([8, 4]); // Slightly longer dashes for better visibility

    ctx.strokeRect(
      pos.x - robotWidth / 2,
      pos.y - robotLength / 2,
      robotWidth,
      robotLength
    );

    ctx.setLineDash([]); // Reset line dash

    // Draw a more visible center point
    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3, 0, 2 * Math.PI); // Larger center point
    ctx.fill();

    ctx.restore();
  };

  const drawMissions = (ctx: CanvasRenderingContext2D) => {
    if (!customMatConfig) return;

    // Use configured mat dimensions instead of hardcoded constants
    const matWidthMm = customMatConfig?.dimensions?.widthMm || MAT_WIDTH_MM;
    const matHeightMm = customMatConfig?.dimensions?.heightMm || MAT_HEIGHT_MM;

    const matOffset = BORDER_WALL_THICKNESS_MM * scale;
    const matX = matOffset + (TABLE_WIDTH_MM * scale - matWidthMm * scale) / 2;
    const matY = matOffset + (TABLE_HEIGHT_MM * scale - matHeightMm * scale);

    // Store bounding boxes for accurate hit detection
    const newBounds = new Map<
      string,
      { x: number; y: number; width: number; height: number }
    >();

    customMatConfig?.missions.forEach((obj) => {
      // Convert normalized position (0-1) to world coordinates (mm), then to canvas coordinates
      // Use the same coordinate transformation as robot positions for consistency
      const matWidthMm = customMatConfig?.dimensions?.widthMm || MAT_WIDTH_MM;
      const matHeightMm =
        customMatConfig?.dimensions?.heightMm || MAT_HEIGHT_MM;
      const worldX = obj.position.x * matWidthMm; // Convert normalized to mm using configured dimensions
      const worldY = obj.position.y * matHeightMm; // Convert normalized to mm using configured dimensions
      const pos = mmToCanvas(worldX, worldY); // Apply standardized coordinate transformation

      const isScored = isMissionScored(obj, scoringState);
      const currentPoints = getTotalPointsForMission(obj, scoringState);
      const maxPoints = getMaxPointsForMission(obj);
      const isHovered = hoveredObject === obj.id;

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
      newBounds.set(obj.id, boundingBox);

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
      const completionPercentage =
        maxPoints > 0 ? currentPoints / maxPoints : 0;

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
    });

    // Update the stored bounds
    setMissionBounds(newBounds);
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

      // SIMPLIFIED MODEL: telemetry points are already in center-of-rotation coordinates
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
        // SIMPLIFIED MODEL: telemetry points are already in center-of-rotation coordinates
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

  // Use refs to track previous telemetry values and avoid circular dependencies
  const prevTelemetryRef = useRef({ distance: 0, angle: 0 });

  // Use CMD key detection hook
  const isCmdKeyPressed = useCmdKey();

  // Use refs to access current values without causing useEffect re-runs
  const telemetryReferenceRef = useRef(telemetryReference);
  const currentPositionRef = useRef(currentPosition);
  const manualHeadingAdjustmentRef = useRef(manualHeadingAdjustment);
  const customMatConfigRef = useRef(customMatConfig);
  const showScoringRef = useRef(showScoring);
  const isCmdKeyPressedRef = useRef(isCmdKeyPressed);
  isCmdKeyPressedRef.current = isCmdKeyPressed;

  // Update refs when values change
  useEffect(() => {
    telemetryReferenceRef.current = telemetryReference;
  }, [telemetryReference]);

  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);

  useEffect(() => {
    manualHeadingAdjustmentRef.current = manualHeadingAdjustment;
  }, [manualHeadingAdjustment]);

  useEffect(() => {
    customMatConfigRef.current = customMatConfig;
  }, [customMatConfig]);

  useEffect(() => {
    showScoringRef.current = showScoring;
  }, [showScoring]);

  // Initialize telemetry reference when robot position is available but reference is not set
  useEffect(() => {
    if (currentPosition && !telemetryReference && isConnected) {
      setTelemetryReference({
        distance: 0,
        angle: 0,
        position: currentPosition,
      });
    }
  }, [currentPosition, telemetryReference, isConnected, setTelemetryReference]);

  // Handle telemetry updates using event subscription instead of reactive useEffect
  useEffect(() => {
    if (!isConnected) return;

    const handleTelemetryEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      const receivedTelemetryData = customEvent.detail;

      // Early return if we don't have required data
      if (!receivedTelemetryData?.drivebase || !currentPositionRef.current) {
        return;
      }

      // Robot position will be updated by the manual calculation below
      // Removed redundant updateRobotPositionFromTelemetry call that was overriding manual positioning

      // Ensure recording is active when we have telemetry data
      telemetryHistory.ensureRecordingActive();

      const { drivebase } = receivedTelemetryData;
      const currentDistance = drivebase.distance || 0;
      const currentAngle = drivebase.angle || 0;

      // Initialize telemetry reference if not set
      if (!telemetryReferenceRef.current) {
        // Initialize telemetry reference

        telemetryReferenceRef.current = {
          distance: currentDistance,
          angle: currentAngle,
          position: { ...currentPositionRef.current },
        };

        // Reference initialized, no need for previous tracking

        return; // Don't process movement on first telemetry data
      }

      // Calculate deltas from the telemetry reference (like working version)
      const deltaDistance =
        currentDistance - telemetryReferenceRef.current.distance;
      const deltaAngle = currentAngle - telemetryReferenceRef.current.angle;

      // Calculate heading using delta from reference + manual adjustment
      const currentHeading =
        (telemetryReferenceRef.current.position.heading +
          deltaAngle +
          manualHeadingAdjustmentRef.current) %
        360;

      // Calculate movement using the current heading (matches working version)
      const headingRad = (currentHeading * Math.PI) / 180;

      const newX =
        telemetryReferenceRef.current.position.x +
        deltaDistance * Math.sin(headingRad);
      // SIMPLIFIED MODEL: Move center of rotation in heading direction
      // heading=0° = move UP (decrease Y), heading=180° = move DOWN (increase Y)
      const newY =
        telemetryReferenceRef.current.position.y -
        deltaDistance * Math.cos(headingRad);

      const newPosition: RobotPosition = {
        x: newX,
        y: newY,
        heading: currentHeading,
      };

      // Remove verbose logging to save context

      // Add telemetry point to history if recording
      if (telemetryHistory.isRecordingActive() && receivedTelemetryData) {
        telemetryHistory.addTelemetryPoint(
          receivedTelemetryData,
          newPosition.x,
          newPosition.y,
          newPosition.heading,
          isCmdKeyPressedRef.current
        );
      }

      // Instead of directly setting robot position, update it through telemetry
      // This ensures all position updates go through the same path
      const newTelemetryData = {
        timestamp: Date.now(),
        type: "telemetry",
        hub: {
          imu: {
            heading: newPosition.heading,
            acceleration: [0, 0, 0],
            angular_velocity: [0, 0, 0],
          },
        },
        drivebase: {
          distance: currentDistance,
          angle: currentAngle,
          state: {
            distance: currentDistance,
            drive_speed: 0,
            angle: currentAngle,
            turn_rate: 0,
          },
        },
      };

      // Temporarily bypass telemetry flow to debug rendering issue
      updateRobotPositionFromTelemetry(newTelemetryData);

      // Update telemetry reference to new position so next movement calculates from here
      setTelemetryReference({
        distance: currentDistance,
        angle: currentAngle,
        position: newPosition,
      });

      // Update accumulated telemetry state for external consumption
      setAccumulatedTelemetry({
        distance: currentDistance,
        angle: currentAngle,
      });

      // Robot position is now managed by Jotai atoms automatically
    };

    // Subscribe to telemetry events from the global document
    document.addEventListener("telemetry", handleTelemetryEvent);

    return () => {
      document.removeEventListener("telemetry", handleTelemetryEvent);
    };
  }, [isConnected, updateRobotPositionFromTelemetry]); // Added dependency for robot position updates

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

  const handleCanvasClick = async (
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

    // Check for mission clicks (if scoring is enabled)
    if (showScoring) {
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

    // Check for telemetry point hover (if path visualization is enabled)
    if (pathOptions.showMarkers) {
      checkTelemetryPointHover(canvasX, canvasY, event.pageX, event.pageY);
    } else {
      setHoveredPoint(null);
      setHoveredPointIndex(-1);
      setTooltipPosition(null);
    }

    // Check for mission hover
    if (showScoring) {
      const hoveredObjectId = checkMissionClick(canvasX, canvasY);
      setHoveredObject(hoveredObjectId);
    } else {
      setHoveredObject(null);
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
      // SIMPLIFIED MODEL: telemetry points are already in center-of-rotation coordinates
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
    points: number,
    choiceId: string
  ) => {
    setScoringState((prev) => {
      const currentObjectives = prev[objectId]?.objectives || {};
      const currentState = currentObjectives[objectiveId];
      const isCompleted = currentState?.completed || false;
      const mission = customMatConfig?.missions.find((m) => m.id === objectId);
      const objective = mission?.objectives.find((o) => o.id === objectiveId);

      if (!objective) return prev;

      let newObjectives = { ...currentObjectives };

      // All objectives now have choices - handle single selection
      if (isCompleted && currentState?.selectedChoiceId === choiceId) {
        // If clicking on already selected choice, deselect it
        newObjectives[objectiveId] = {
          completed: false,
          points: 0,
          selectedChoiceId: undefined,
        };
      } else {
        // Select the new choice
        const selectedChoice = objective.choices.find((c) => c.id === choiceId);
        if (selectedChoice) {
          newObjectives[objectiveId] = {
            completed: true,
            points: selectedChoice.points,
            selectedChoiceId: choiceId,
          };
        }
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
      // Score is automatically tracked via Jotai currentScore atom

      return newState;
    });
  };

  // Single canvas update system - consolidate all canvas operations
  const updateCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size if needed (canvasSize is already rounded)
    const targetWidth = Math.round(canvasSize.width);
    const targetHeight = Math.round(canvasSize.height);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    // Draw the canvas
    drawCanvas();
  }, [canvasSize, drawCanvas]);

  // Single useEffect that triggers canvas updates for all changes
  useEffect(() => {
    const rafId = requestAnimationFrame(updateCanvas);
    return () => cancelAnimationFrame(rafId);
  }, [
    canvasSize,
    scale,
    currentPosition,
    mousePosition,
    movementPreview,
    hoveredObject,
    hoveredPoint,
    customMatConfig?.name,
    scoringState,
    showScoring,
    ghostPosition, // Added to trigger redraw when ghost moves
    updateCanvas,
  ]);

  // Update canvas size on mount and resize
  useEffect(() => {
    updateCanvasSize();

    // Throttle resize events to prevent excessive updates
    let resizeTimeout: NodeJS.Timeout;
    const throttledResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateCanvasSize, 100);
    };

    window.addEventListener("resize", throttledResize);

    // Use ResizeObserver for more reliable container size detection
    let resizeObserver: ResizeObserver | null = null;
    const container = canvasRef.current?.parentElement;
    if (container) {
      resizeObserver = new ResizeObserver(throttledResize);
      resizeObserver.observe(container);
    }

    return () => {
      window.removeEventListener("resize", throttledResize);
      clearTimeout(resizeTimeout);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateCanvasSize]); // updateCanvasSize is now stable due to useCallback

  // Additional canvas size update when component becomes visible
  useEffect(() => {
    const checkVisibility = () => {
      if (document.visibilityState === "visible") {
        // Component became visible, update canvas size
        setTimeout(() => updateCanvasSize(), 100);
      }
    };

    document.addEventListener("visibilitychange", checkVisibility);
    return () =>
      document.removeEventListener("visibilitychange", checkVisibility);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-2 sm:p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
              Competition Table & Mat
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
              {customMatConfig ? customMatConfig.name : "Loading..."}
              <span className="hidden sm:inline">
                {" "}
                - Mat: {customMatConfig?.dimensions?.widthMm || MAT_WIDTH_MM}×
                {customMatConfig?.dimensions?.heightMm || MAT_HEIGHT_MM}mm,
                Table: {TABLE_WIDTH_MM}×{TABLE_HEIGHT_MM}mm with{" "}
                {BORDER_WALL_HEIGHT_MM}mm walls
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            {/* Color Mode Selector */}
            <select
              value={pathOptions.colorMode}
              onChange={(e) =>
                setPathOptions((prev) => ({
                  ...prev,
                  colorMode: e.target.value as ColorMode,
                }))
              }
              className="px-1 sm:px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
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

            {/* Prominent Score Display */}
            {customMatConfig && showScoring && (
              <div className="bg-gradient-to-r from-green-400 to-blue-500 dark:from-green-500 dark:to-blue-600 text-white px-3 py-2 rounded-lg shadow-lg border-2 border-white dark:border-gray-300">
                <div className="text-center">
                  <div className="text-lg font-bold">
                    {customMatConfig.missions.reduce(
                      (sum, obj) =>
                        sum + getTotalPointsForMission(obj, scoringState),
                      0
                    )}
                    /
                    {customMatConfig.missions.reduce(
                      (sum, obj) => sum + getMaxPointsForMission(obj),
                      0
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 p-2 sm:p-4 rounded-lg">
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
            hoveredObject ? "cursor-pointer" : "cursor-default"
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

      {/* Telemetry Playback Controls */}
      <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        {/* Accordion Header */}
        <button
          onClick={() =>
            setIsTelemetryPlaybackExpanded(!isTelemetryPlaybackExpanded)
          }
          className="w-full p-3 text-left border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                Telemetry Playback
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`transform transition-transform ${
                  isTelemetryPlaybackExpanded ? "rotate-90" : "rotate-0"
                }`}
              >
                ▶
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {isTelemetryPlaybackExpanded ? "Hide" : "Show"}
              </span>
            </div>
          </div>
        </button>
        {/* Accordion Content */}
        {isTelemetryPlaybackExpanded && <TelemetryPlayback />}
      </div>

      {/* Missions List */}
      {customMatConfig && showScoring && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Accordion Header */}
          <button
            onClick={() => setMissionsExpanded(!missionsExpanded)}
            className="w-full p-3 text-left border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  Missions
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`transition-transform ${missionsExpanded ? "rotate-90" : "rotate-0"}`}
                >
                  ▶
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {missionsExpanded ? "Hide" : "Show"} (
                  {customMatConfig?.missions.length || 0})
                </span>
              </div>
            </div>
          </button>
          {missionsExpanded && (
            <div className="space-y-4">
              {customMatConfig?.missions.map((obj) => (
                <div
                  key={obj.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2 sm:p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm sm:text-base font-medium text-gray-800 dark:text-gray-200">
                      {obj.name}
                    </h5>
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {getTotalPointsForMission(obj, scoringState)}/
                      {getMaxPointsForMission(obj)}pts
                    </span>
                  </div>
                  {obj.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {obj.description}
                    </p>
                  )}
                  <div className="space-y-3">
                    {obj.objectives.map((objective, index) => {
                      const objectiveState =
                        scoringState[obj.id]?.objectives?.[objective.id];
                      const isCompleted = objectiveState?.completed || false;

                      // All objectives now have choices
                      return (
                        <div key={objective.id} className="space-y-1">
                          {objective.description && (
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                              {objective.description}
                            </div>
                          )}
                          {objective.choices.map((choice) => {
                            const isChoiceSelected =
                              isCompleted &&
                              objectiveState?.selectedChoiceId === choice.id;

                            return (
                              <button
                                key={choice.id}
                                onClick={() =>
                                  toggleObjective(
                                    obj.id,
                                    objective.id,
                                    choice.points,
                                    choice.id
                                  )
                                }
                                className={`w-full text-left p-2 rounded text-sm transition-colors ${
                                  isChoiceSelected
                                    ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                                    : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                }`}
                              >
                                <span className="flex items-center justify-between">
                                  <span className="flex items-center gap-2">
                                    <span className="flex-shrink-0">
                                      <span
                                        className={`w-3 h-3 rounded-full border-2 inline-block ${
                                          isChoiceSelected
                                            ? "bg-green-600 border-green-600"
                                            : "border-gray-400 dark:border-gray-500"
                                        }`}
                                      >
                                        {isChoiceSelected && (
                                          <span className="block w-1 h-1 bg-white rounded-full mx-auto mt-0.5"></span>
                                        )}
                                      </span>
                                    </span>
                                    <span>{choice.description}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="text-xs">
                                      {choice.points}pts
                                    </span>
                                    {choice.type === "bonus" && (
                                      <span className="text-orange-500 text-xs">
                                        bonus
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                          {/* Add dividing line between objectives (except after the last one) */}
                          {index < obj.objectives.length - 1 && (
                            <div className="border-t border-gray-200 dark:border-gray-600 my-2"></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mission Scoring Side Panel */}
      {popoverObject && customMatConfig && (
        <>
          {/* Backdrop - full screen on mobile, right side only on large screens */}
          <div
            className="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity md:right-0 md:left-auto md:w-1/3 lg:w-1/4 xl:w-1/5"
            onClick={() => {
              setPopoverObject(null);
              setPopoverPosition(null);
            }}
          />

          {/* Side Panel */}
          <div className="fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-white dark:bg-gray-800 border-l border-gray-300 dark:border-gray-600 shadow-xl transform transition-transform duration-300 ease-in-out">
            <div className="p-4 flex flex-col h-full">
              {(() => {
                const obj = customMatConfig?.missions.find(
                  (o) => o.id === popoverObject
                );
                if (!obj) return null;

                const currentPoints = getTotalPointsForMission(
                  obj,
                  scoringState
                );
                const maxPoints = getMaxPointsForMission(obj);

                return (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base">
                        {obj.name}
                      </h4>
                      <button
                        onClick={() => {
                          setPopoverObject(null);
                          setPopoverPosition(null);
                        }}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    {obj.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                        {obj.description}
                      </p>
                    )}

                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                      Score: {currentPoints}/{maxPoints} points
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
                      {obj.objectives.map((objective, index) => {
                        const objectiveState =
                          scoringState[obj.id]?.objectives?.[objective.id];
                        const isCompleted = objectiveState?.completed || false;

                        // All objectives now have choices
                        return (
                          <div key={objective.id} className="space-y-2">
                            {objective.description && (
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {objective.description}
                              </div>
                            )}
                            {objective.choices.map((choice) => {
                              const isChoiceSelected =
                                isCompleted &&
                                objectiveState?.selectedChoiceId === choice.id;

                              return (
                                <button
                                  key={choice.id}
                                  onClick={() =>
                                    toggleObjective(
                                      obj.id,
                                      objective.id,
                                      choice.points,
                                      choice.id
                                    )
                                  }
                                  className={`w-full text-left p-3 rounded-lg text-sm transition-colors touch-manipulation ${
                                    isChoiceSelected
                                      ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700"
                                      : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-3 flex-1 pr-3">
                                      <span className="flex-shrink-0">
                                        <span
                                          className={`w-4 h-4 rounded-full border-2 inline-block ${
                                            isChoiceSelected
                                              ? "bg-green-600 border-green-600"
                                              : "border-gray-400 dark:border-gray-500"
                                          }`}
                                        >
                                          {isChoiceSelected && (
                                            <span className="block w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5"></span>
                                          )}
                                        </span>
                                      </span>
                                      <span className="text-sm leading-relaxed">
                                        {choice.description}
                                      </span>
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-sm">
                                        {choice.points}pts
                                      </span>
                                      {choice.type === "bonus" && (
                                        <span className="text-orange-500 text-xs bg-orange-100 dark:bg-orange-900 px-2 py-1 rounded-full font-medium">
                                          bonus
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                            {/* Add dividing line between objectives (except after the last one) */}
                            {index < obj.objectives.length - 1 && (
                              <div className="border-t border-gray-300 dark:border-gray-600 my-3"></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* Pseudo Code Panel */}
      <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        {/* Accordion Header */}
        <button
          onClick={() => setIsPseudoCodeExpanded(!isPseudoCodeExpanded)}
          className="w-full p-3 text-left border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                Generated Pseudo Code
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`transform transition-transform ${isPseudoCodeExpanded ? "rotate-90" : "rotate-0"}`}
              >
                ▶
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {isPseudoCodeExpanded ? "Hide" : "Show"}
              </span>
            </div>
          </div>
        </button>

        {/* Accordion Content */}
        {isPseudoCodeExpanded && (
          <PseudoCodePanel
            telemetryPoints={allTelemetryPoints}
            isVisible={true}
            onToggle={() => setIsPseudoCodeExpanded(false)}
          />
        )}
      </div>
    </div>
  );
}
