import { useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import { calculateTrajectoryProjection } from "../components/MovementPreview";
import { telemetryHistory } from "../services/telemetryHistory";
import {
  canvasScaleAtom,
  canvasSizeAtom,
  coordinateUtilsAtom,
  hoveredObjectAtom,
  missionBoundsAtom,
} from "../store/atoms/canvasState";
import {
  controlModeAtom,
  customMatConfigAtom,
  mousePositionAtom,
  showGridOverlayAtom,
} from "../store/atoms/gameMat";
import { ghostRobotAtom } from "../store/atoms/ghostPosition";
import {
  editingMissionAtom,
  selectedMissionAtom,
  selectedPointIdAtom,
} from "../store/atoms/missionPlanner";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import {
  pathVisualizationOptionsAtom,
  selectedPathPointsAtom,
} from "../store/atoms/telemetryPoints";
import { drawBorderWalls, drawGrid } from "../utils/canvas/basicDrawing";
import {
  drawMissionPathPreview,
  drawMissionPlanner,
  drawMissionPointPreview,
  drawMissions,
} from "../utils/canvas/missionDrawing";
import { drawMovementPreview } from "../utils/canvas/movementPreviewDrawing";
import { drawRobot } from "../utils/canvas/robotDrawing";
import { drawRobotOrientedGrid } from "../utils/canvas/robotGridDrawing";
import { drawSplinePath } from "../utils/canvas/splinePathDrawing";
import { drawTelemetryPath } from "../utils/canvas/telemetryDrawing";
import { drawPerpendicularTrajectoryProjection } from "../utils/canvas/trajectoryDrawing";
import { type RobotPosition } from "../utils/robotPosition";

interface UseCanvasDrawingProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  matImageRef: React.RefObject<HTMLCanvasElement | HTMLImageElement | null>;
  currentPosition: RobotPosition | null;
  mousePosition: { x: number; y: number } | null;
  scoringState: any; // TODO: Add proper typing
  showScoring: boolean;
  movementPreview: any; // TODO: Add proper typing
  perpendicularPreview: any; // TODO: Add proper typing
  isSplinePathMode: boolean;
  currentSplinePath: any; // TODO: Add proper typing
  splinePaths: any[]; // TODO: Add proper typing
  selectedSplinePointId: string | null;
  hoveredSplinePointId: string | null;
  hoveredCurvatureHandlePointId: string | null;
  hoveredPoint: any; // TODO: Add proper typing
  hoveredPointIndexValue: number;
  setMissionBounds: (
    bounds: Map<string, { x: number; y: number; width: number; height: number }>
  ) => void;
  // Mission editing props
  pointPlacementMode?: "waypoint" | "action" | "start" | "end" | null;
  actionPointHeading?: number;
}

/**
 * Custom hook for managing canvas drawing operations
 */
export function useCanvasDrawing(props: UseCanvasDrawingProps) {
  const {
    canvasRef,
    matImageRef,
    currentPosition,
    mousePosition,
    scoringState,
    showScoring,
    movementPreview,
    perpendicularPreview,
    isSplinePathMode,
    currentSplinePath,
    splinePaths,
    selectedSplinePointId,
    hoveredSplinePointId,
    hoveredCurvatureHandlePointId,
    hoveredPoint,
    hoveredPointIndexValue,
    setMissionBounds,
    pointPlacementMode = null,
    actionPointHeading = 0,
  } = props;

  // Get state from atoms
  const canvasSize = useAtomValue(canvasSizeAtom);
  const scale = useAtomValue(canvasScaleAtom);
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const customMatConfig = useAtomValue(customMatConfigAtom);
  const controlMode = useAtomValue(controlModeAtom);
  const robotConfig = useAtomValue(robotConfigAtom);
  const showGridOverlay = useAtomValue(showGridOverlayAtom);
  const hoveredObject = useAtomValue(hoveredObjectAtom);
  const missionBounds = useAtomValue(missionBoundsAtom);
  const pathOptions = useAtomValue(pathVisualizationOptionsAtom);
  const selectedPathPoints = useAtomValue(selectedPathPointsAtom);
  const ghostRobot = useAtomValue(ghostRobotAtom);
  const editingMission = useAtomValue(editingMissionAtom);
  const selectedMission = useAtomValue(selectedMissionAtom);
  const selectedPointId = useAtomValue(selectedPointIdAtom);

  // Get mouse position directly from atom instead of prop
  const atomMousePosition = useAtomValue(mousePositionAtom);

  // Extract coordinate utilities
  const { canvasToMm, mmToCanvas } = coordinateUtils;
  const ghostPosition = ghostRobot.isVisible ? ghostRobot.position : null;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

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

    // Add subtle glossy highlight overlay across entire surface
    const glossGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    glossGradient.addColorStop(0, "rgba(255, 255, 255, 0.02)");
    glossGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
    glossGradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");
    ctx.fillStyle = glossGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw border walls (3D effect)
    drawBorderWalls(
      ctx,
      { scale },
      coordinateUtils.matDimensions.borderWallThickness,
      coordinateUtils.matDimensions.tableWidth,
      coordinateUtils.matDimensions.tableHeight
    );

    // Calculate mat position - centered horizontally, flush with bottom edge of table surface
    const borderOffset =
      coordinateUtils.matDimensions.borderWallThickness * scale;
    const matWidth =
      (customMatConfig?.dimensions?.widthMm ||
        coordinateUtils.matDimensions.matWidthMm) * scale;
    const matHeight =
      (customMatConfig?.dimensions?.heightMm ||
        coordinateUtils.matDimensions.matHeightMm) * scale;
    const tableWidth = coordinateUtils.matDimensions.tableWidth * scale;
    const tableHeight = coordinateUtils.matDimensions.tableHeight * scale;

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
      drawGrid(ctx, canvasSize.width, canvasSize.height);
    }

    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw missions if custom mat and in program mode
    if (customMatConfig && showScoring && controlMode === "program") {
      drawMissions(
        ctx,
        customMatConfig,
        scoringState,
        hoveredObject,
        { mmToCanvas, canvasToMm, scale },
        {
          matWidthMm:
            customMatConfig?.dimensions?.widthMm ||
            coordinateUtils.matDimensions.matWidthMm,
          matHeightMm:
            customMatConfig?.dimensions?.heightMm ||
            coordinateUtils.matDimensions.matHeightMm,
          borderWallThickness:
            coordinateUtils.matDimensions.borderWallThickness,
          tableWidth: coordinateUtils.matDimensions.tableWidth,
          tableHeight: coordinateUtils.matDimensions.tableHeight,
        },
        setMissionBounds
      );
    }

    // Draw telemetry path
    if (pathOptions.showPath) {
      drawTelemetryPath(
        ctx,
        selectedPathPoints,
        {
          ...pathOptions,
          colorMode:
            pathOptions.colorMode === "none"
              ? "time"
              : (pathOptions.colorMode as "time" | "speed" | "heading"),
        },
        {
          getColorForPoint: (point: any, colorMode: string) =>
            telemetryHistory.getColorForPoint(point, colorMode as any),
        },
        { mmToCanvas },
        hoveredPointIndexValue
      );
    }

    // Draw robot
    if (currentPosition) {
      drawRobot(
        ctx,
        currentPosition,
        robotConfig,
        { mmToCanvas, scale },
        false
      );
    }

    // Draw ghost robot from telemetry playback
    if (ghostPosition) {
      drawRobot(
        ctx,
        ghostPosition,
        robotConfig,
        { mmToCanvas, scale },
        true,
        "playback"
      );
    }

    // Draw robot-oriented grid overlay BEFORE ghosts so ghosts appear on top
    // Only show grid overlay when in Step mode (incremental) AND the toggle is enabled
    if (showGridOverlay && controlMode === "incremental" && currentPosition) {
      drawRobotOrientedGrid(ctx, currentPosition, { mmToCanvas, scale });
    }

    // Draw movement preview robots (dual previews)
    drawMovementPreview(
      ctx,
      movementPreview,
      currentPosition,
      controlMode === "mission" || controlMode === "program"
        ? "incremental"
        : controlMode, // Fallback to incremental for mission and program modes
      robotConfig,
      { mmToCanvas, scale }
    );

    // Draw perpendicular preview ghosts - show robot ghosts at all 4 possible movement positions
    if (
      perpendicularPreview.show &&
      perpendicularPreview.ghosts.length > 0 &&
      currentPosition &&
      currentPosition.x > 0 &&
      currentPosition.y > 0
    ) {
      // Draw each ghost robot with its appropriate color
      perpendicularPreview.ghosts.forEach((ghost: any) => {
        // Set custom color for this ghost
        ctx.save();
        // Set opacity based on ghost type:
        // - Hover ghosts: 0.8 (boldest)
        // - Trajectory overlay ghosts: 0.4 (lighter)
        // - Other ghosts: 0.5 (medium)
        const ghostAny = ghost as any;
        if (ghostAny.isHover) {
          ctx.globalAlpha = 0.8; // Hover ghosts are boldest
        } else if (ghostAny.isTrajectoryOverlay) {
          ctx.globalAlpha = 0.4; // Trajectory overlay ghosts are lighter
        } else {
          ctx.globalAlpha = 0.5; // Default ghosts
        }
        ctx.strokeStyle = ghost.color;
        ctx.fillStyle = ghost.color;

        // Draw ghost robot at the calculated position
        drawRobot(
          ctx,
          ghost.position,
          robotConfig,
          { mmToCanvas, scale },
          true, // isGhost
          "perpendicular", // previewType
          ghost.direction // direction
        );

        ctx.restore();

        // Calculate trajectory for this ghost to show path
        const trajectory = calculateTrajectoryProjection(
          currentPosition,
          perpendicularPreview.distance,
          perpendicularPreview.angle,
          ghost.type,
          ghost.direction,
          2356,
          1137,
          robotConfig
        );

        // Draw trajectory path
        drawPerpendicularTrajectoryProjection(
          ctx,
          trajectory.trajectoryPath,
          ghost.direction,
          { mmToCanvas, scale }
        );
      });
    }

    // Draw spline paths
    if (
      isSplinePathMode &&
      currentSplinePath &&
      currentSplinePath.points.length > 0
    ) {
      drawSplinePath(
        ctx,
        currentSplinePath,
        selectedSplinePointId,
        { mmToCanvas, scale },
        hoveredSplinePointId,
        hoveredCurvatureHandlePointId
      );
    }

    // Draw completed spline paths
    for (const splinePath of splinePaths) {
      if (splinePath.isComplete && splinePath.id !== currentSplinePath?.id) {
        drawSplinePath(ctx, splinePath, null, { mmToCanvas, scale });
      }
    }

    // Draw mission planner points and connections - ALWAYS show in mission mode
    if (controlMode === "mission") {
      // Show the editing mission if available, otherwise show the selected mission
      const missionToShow = editingMission || selectedMission;
      if (missionToShow) {
        drawMissionPlanner(
          ctx,
          missionToShow,
          { mmToCanvas, canvasToMm, scale },
          {
            showConnections: true,
            selectedPointId: selectedPointId,
            showRobotGhosts: true,
            robotConfig: robotConfig,
          }
        );
      }
    }

    // Draw mission point placement preview with arc path preview
    // Use atom mouse position instead of prop, and convert from mat coordinates to canvas coordinates
    const mousePositionForPreview = atomMousePosition
      ? mmToCanvas(atomMousePosition.x, atomMousePosition.y)
      : null;

    if (
      controlMode === "mission" &&
      pointPlacementMode &&
      mousePositionForPreview &&
      editingMission
    ) {
      console.log("Drawing mission point preview:", {
        controlMode,
        pointPlacementMode,
        atomMousePosition,
        mousePositionForPreview,
        actionPointHeading,
      });

      // Draw the smooth path preview showing how the new point will connect
      if (
        pointPlacementMode === "waypoint" ||
        pointPlacementMode === "action"
      ) {
        drawMissionPathPreview(
          ctx,
          editingMission,
          mousePositionForPreview,
          pointPlacementMode,
          actionPointHeading,
          { mmToCanvas, canvasToMm, scale }
        );
      }

      // Draw the point preview on top of the path preview
      drawMissionPointPreview(
        ctx,
        mousePositionForPreview,
        pointPlacementMode,
        actionPointHeading,
        { mmToCanvas, canvasToMm, scale },
        robotConfig
      );
    } else if (controlMode === "mission" && pointPlacementMode) {
      console.log("Preview conditions not met:", {
        controlMode,
        pointPlacementMode,
        hasAtomMousePosition: !!atomMousePosition,
        hasMousePositionForPreview: !!mousePositionForPreview,
        hasEditingMission: !!editingMission,
      });
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
    matImageRef,
    showGridOverlay,
    // Spline path state
    isSplinePathMode,
    currentSplinePath,
    splinePaths,
    selectedSplinePointId,
    mmToCanvas,
    canvasToMm,
    canvasSize,
    coordinateUtils,
    hoveredSplinePointId,
    hoveredCurvatureHandlePointId,
    hoveredPointIndexValue,
    selectedPathPoints,
    ghostPosition,
    // Mission planner state
    editingMission,
    selectedMission,
    selectedPointId,
    missionBounds,
    pointPlacementMode,
    actionPointHeading,
    atomMousePosition,
    coordinateUtils,
  ]);

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
    controlMode,
    ghostPosition,
    pointPlacementMode,
    actionPointHeading,
    atomMousePosition,
    selectedMission,
    coordinateUtils,
    updateCanvas,
  ]);

  return {
    drawCanvas,
    updateCanvas,
  };
}
