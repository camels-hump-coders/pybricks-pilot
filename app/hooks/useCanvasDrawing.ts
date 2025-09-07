import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { calculateTrajectoryProjection } from "../components/MovementPreview";
import type { TelemetryPoint } from "../services/telemetryHistory";
import { telemetryHistory } from "../services/telemetryHistory";
import {
  canvasScaleAtom,
  canvasSizeAtom,
  coordinateUtilsAtom,
  hoveredObjectAtom,
  missionBoundsAtom,
} from "../store/atoms/canvasState";
import type {
  MovementPreview,
  ObjectiveState,
  PerpendicularPreviewGhost,
  SplinePath,
} from "../store/atoms/gameMat";
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
import { positionsAtom } from "../store/atoms/positionManagement";
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
import { lowQualityModeAtom } from "../store/atoms/matUIState";
import type { RobotPosition } from "../utils/robotPosition";

type ScoringState = {
  [objectId: string]: {
    objectives: {
      [objectiveId: string]: ObjectiveState;
    };
  };
};

type PerpendicularPreview = {
  show: boolean;
  ghosts: PerpendicularPreviewGhost[];
  distance: number;
  angle: number;
};

interface UseCanvasDrawingProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  matImageRef: React.RefObject<HTMLCanvasElement | HTMLImageElement | null>;
  currentPosition: RobotPosition | null;
  mousePosition: { x: number; y: number } | null;
  scoringState: ScoringState;
  showScoring: boolean;
  movementPreview: MovementPreview | null;
  perpendicularPreview: PerpendicularPreview;
  isSplinePathMode: boolean;
  currentSplinePath: SplinePath | null;
  splinePaths: SplinePath[];
  selectedSplinePointId: string | null;
  hoveredSplinePointId: string | null;
  hoveredCurvatureHandlePointId: string | null;
  hoveredPoint: TelemetryPoint | null;
  hoveredPointIndexValue: number;
  setMissionBounds: (
    bounds: Map<
      string,
      { x: number; y: number; width: number; height: number }
    >,
  ) => void;
  // Mission editing props
  pointPlacementMode?: "waypoint" | "action" | "start" | "end" | null;
  actionPointHeading?: number;
}

/**
 * Custom hook for managing canvas drawing operations with continuous rendering
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

  // Store refs for always-current data access
  const dataRefs = useRef({
    canvasSize: { width: 0, height: 0 },
    scale: 1,
    coordinateUtils: null as any,
    customMatConfig: null as any,
    controlMode: "program" as any,
    robotConfig: null as any,
    showGridOverlay: false,
    hoveredObject: null as string | null,
    missionBounds: new Map(),
    pathOptions: null as any,
    selectedPathPoints: [] as any[],
    ghostRobot: null as any,
    editingMission: null as any,
    selectedMission: null as any,
    selectedPointId: null as string | null,
    positions: [] as any[],
    atomMousePosition: null as any,
    // Props that change frequently
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
    pointPlacementMode,
    actionPointHeading,
  });

  // Get current state from atoms (but don't trigger re-renders)
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
  const positions = useAtomValue(positionsAtom) || [];
  const atomMousePosition = useAtomValue(mousePositionAtom);

  // Update refs with latest data
  dataRefs.current.canvasSize = canvasSize;
  dataRefs.current.scale = scale;
  dataRefs.current.coordinateUtils = coordinateUtils;
  dataRefs.current.customMatConfig = customMatConfig;
  dataRefs.current.controlMode = controlMode;
  dataRefs.current.robotConfig = robotConfig;
  dataRefs.current.showGridOverlay = showGridOverlay;
  dataRefs.current.hoveredObject = hoveredObject;
  dataRefs.current.missionBounds = missionBounds;
  dataRefs.current.pathOptions = pathOptions;
  dataRefs.current.selectedPathPoints = selectedPathPoints;
  dataRefs.current.ghostRobot = ghostRobot;
  dataRefs.current.editingMission = editingMission;
  dataRefs.current.selectedMission = selectedMission;
  dataRefs.current.selectedPointId = selectedPointId;
  dataRefs.current.positions = positions;
  dataRefs.current.atomMousePosition = atomMousePosition;
  dataRefs.current.currentPosition = currentPosition;
  dataRefs.current.mousePosition = mousePosition;
  dataRefs.current.scoringState = scoringState;
  dataRefs.current.showScoring = showScoring;
  dataRefs.current.movementPreview = movementPreview;
  dataRefs.current.perpendicularPreview = perpendicularPreview;
  dataRefs.current.isSplinePathMode = isSplinePathMode;
  dataRefs.current.currentSplinePath = currentSplinePath;
  dataRefs.current.splinePaths = splinePaths;
  dataRefs.current.selectedSplinePointId = selectedSplinePointId;
  dataRefs.current.hoveredSplinePointId = hoveredSplinePointId;
  dataRefs.current.hoveredCurvatureHandlePointId =
    hoveredCurvatureHandlePointId;
  dataRefs.current.hoveredPoint = hoveredPoint;
  dataRefs.current.hoveredPointIndexValue = hoveredPointIndexValue;
  dataRefs.current.setMissionBounds = setMissionBounds;
  dataRefs.current.pointPlacementMode = pointPlacementMode;
  dataRefs.current.actionPointHeading = actionPointHeading;

  // Event-driven redraw control
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const targetFrameMs = 1000 / 30; // cap ~30 FPS when invalidations flood
  const lowQuality = useAtomValue(lowQualityModeAtom);

  // compute reduced effects contextually inside draw based on env and load

  // Main drawing function that uses refs for always-current data
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Get current data from refs (always up-to-date)
    const data = dataRefs.current;
    const { canvasToMm, mmToCanvas } = data.coordinateUtils || {
      canvasToMm: () => ({ x: 0, y: 0 }),
      mmToCanvas: () => ({ x: 0, y: 0 }),
    };
    const ghostPosition = data.ghostRobot?.isVisible
      ? data.ghostRobot.position
      : null;

    // Clear canvas with a neutral background
    ctx.fillStyle = "#e5e5e5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reducedEffects =
      lowQuality ||
      prefersReduced ||
      document.visibilityState === "hidden" ||
      data.scale > 1.5 ||
      (data.selectedPathPoints?.length || 0) > 4000;

    // Draw the table surface (skip gradients when reducedEffects)
    if (!reducedEffects) {
      const tableGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      tableGradient.addColorStop(0, "#1a1a1a");
      tableGradient.addColorStop(0.5, "#0d0d0d");
      tableGradient.addColorStop(1, "#000000");
      ctx.fillStyle = tableGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const glossGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      glossGradient.addColorStop(0, "rgba(255, 255, 255, 0.02)");
      glossGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
      glossGradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");
      ctx.fillStyle = glossGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#0f0f0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw border walls (3D effect) - only if coordinateUtils is available
    if (data.coordinateUtils) {
      drawBorderWalls(
        ctx,
        { scale: data.scale },
        data.coordinateUtils.matDimensions.borderWallThickness,
        data.coordinateUtils.matDimensions.tableWidth,
        data.coordinateUtils.matDimensions.tableHeight,
      );

      // Calculate mat position - centered horizontally, flush with bottom edge of table surface
      const borderOffset =
        data.coordinateUtils.matDimensions.borderWallThickness * data.scale;
      const matWidth =
        (data.customMatConfig?.dimensions?.widthMm ||
          data.coordinateUtils.matDimensions.matWidthMm) * data.scale;
      const matHeight =
        (data.customMatConfig?.dimensions?.heightMm ||
          data.coordinateUtils.matDimensions.matHeightMm) * data.scale;
      const tableWidth =
        data.coordinateUtils.matDimensions.tableWidth * data.scale;
      const tableHeight =
        data.coordinateUtils.matDimensions.tableHeight * data.scale;

      // Mat is centered horizontally within the table surface (3mm gap on each side)
      const matX = borderOffset + (tableWidth - matWidth) / 2;
      // Mat is flush with the bottom edge of the table surface (6mm gap at top, 0mm at bottom)
      const matY = borderOffset + (tableHeight - matHeight);

      // Optional shadow under the mat for depth
      if (!reducedEffects) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 10 * data.scale;
        ctx.shadowOffsetX = 2 * data.scale;
        ctx.shadowOffsetY = 2 * data.scale;
      }

      // Draw mat background or image
      if (matImageRef.current) {
        // Draw the de-skewed mat image using configured dimensions
        ctx.drawImage(matImageRef.current, matX, matY, matWidth, matHeight);
      } else {
        // Fallback: plain mat with grid
        ctx.fillStyle = "#f8f9fa";
        ctx.fillRect(matX, matY, matWidth, matHeight);
        drawGrid(ctx, data.canvasSize.width, data.canvasSize.height);
      }

      // Reset shadow
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // Draw missions if custom mat and in program mode
    if (
      data.customMatConfig &&
      data.showScoring &&
      data.controlMode === "program" &&
      data.coordinateUtils
    ) {
      drawMissions(
        ctx,
        data.customMatConfig,
        data.scoringState,
        data.hoveredObject,
        { mmToCanvas, canvasToMm, scale: data.scale },
        {
          matWidthMm:
            data.customMatConfig?.dimensions?.widthMm ||
            data.coordinateUtils.matDimensions.matWidthMm,
          matHeightMm:
            data.customMatConfig?.dimensions?.heightMm ||
            data.coordinateUtils.matDimensions.matHeightMm,
          borderWallThickness:
            data.coordinateUtils.matDimensions.borderWallThickness,
          tableWidth: data.coordinateUtils.matDimensions.tableWidth,
          tableHeight: data.coordinateUtils.matDimensions.tableHeight,
        },
        data.setMissionBounds,
      );
    }

    // Draw telemetry path (sample points in reduced mode)
    if (data.pathOptions?.showPath) {
      let points = data.selectedPathPoints;
      if (reducedEffects && points.length > 2000) {
        const step = Math.ceil(points.length / 2000);
        const sampled: typeof points = [];
        for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
        // Ensure we include the last point for continuity
        if (sampled[sampled.length - 1] !== points[points.length - 1]) {
          sampled.push(points[points.length - 1]);
        }
        points = sampled;
      }
      drawTelemetryPath(
        ctx,
        points,
        {
          ...data.pathOptions,
          colorMode:
            data.pathOptions.colorMode === "none"
              ? "time"
              : (data.pathOptions.colorMode as "time" | "speed" | "heading"),
          strokeWidth: reducedEffects
            ? Math.max(1, (data.pathOptions.strokeWidth || 2) * 0.75)
            : data.pathOptions.strokeWidth,
        },
        {
          getColorForPoint: (point: any, colorMode: string) =>
            telemetryHistory.getColorForPoint(point, colorMode as any),
        },
        { mmToCanvas },
        data.hoveredPointIndexValue,
      );
    }

    // Draw robot
    if (data.currentPosition && data.robotConfig) {
      drawRobot(
        ctx,
        data.currentPosition,
        data.robotConfig,
        { mmToCanvas, scale: data.scale },
        false,
      );
    }

    // Draw ghost robot from telemetry playback
    if (ghostPosition && data.robotConfig) {
      drawRobot(
        ctx,
        ghostPosition,
        data.robotConfig,
        { mmToCanvas, scale: data.scale },
        true,
        "playback",
      );
    }

    // Draw robot-oriented grid overlay BEFORE ghosts so ghosts appear on top
    // Only show grid overlay when in Step mode (incremental) AND the toggle is enabled
    if (
      data.showGridOverlay &&
      data.controlMode === "incremental" &&
      data.currentPosition &&
      !reducedEffects
    ) {
      drawRobotOrientedGrid(ctx, data.currentPosition, {
        mmToCanvas,
        scale: data.scale,
      });
    }

    // Draw movement preview robots (dual previews)
    if (data.robotConfig) {
      drawMovementPreview(
        ctx,
        data.movementPreview,
        data.currentPosition,
        data.controlMode === "mission" || data.controlMode === "program"
          ? "incremental"
          : data.controlMode,
        data.robotConfig,
        { mmToCanvas, scale: data.scale },
      );
    }

    // Draw perpendicular preview ghosts - show robot ghosts at all 4 possible movement positions
    if (
      data.perpendicularPreview?.show &&
      data.perpendicularPreview.ghosts?.length > 0 &&
      data.currentPosition &&
      data.currentPosition.x > 0 &&
      data.currentPosition.y > 0 &&
      data.robotConfig
    ) {
      // Draw each ghost robot with its appropriate color
      data.perpendicularPreview.ghosts.forEach((ghost: any) => {
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
          data.robotConfig,
          { mmToCanvas, scale: data.scale },
          true, // isGhost
          "perpendicular", // previewType
          ghost.direction, // direction
        );

        ctx.restore();

        // Calculate trajectory for this ghost to show path
        if (data.currentPosition) {
          const trajectory = calculateTrajectoryProjection(
            data.currentPosition,
            data.perpendicularPreview.distance,
            data.perpendicularPreview.angle,
            ghost.type,
            ghost.direction,
            2356,
            1137,
            data.robotConfig,
          );

          // Draw trajectory path
          drawPerpendicularTrajectoryProjection(
            ctx,
            trajectory.trajectoryPath,
            ghost.direction,
            { mmToCanvas, scale: data.scale },
          );
        }
      });
    }

    // Draw spline paths
    if (
      data.isSplinePathMode &&
      data.currentSplinePath &&
      data.currentSplinePath.points.length > 0
    ) {
      drawSplinePath(
        ctx,
        data.currentSplinePath,
        data.selectedSplinePointId,
        { mmToCanvas, scale: data.scale },
        data.hoveredSplinePointId,
        data.hoveredCurvatureHandlePointId,
      );
    }

    // Draw completed spline paths
    if (data.splinePaths) {
      for (const splinePath of data.splinePaths) {
        if (
          splinePath.isComplete &&
          splinePath.id !== data.currentSplinePath?.id
        ) {
          drawSplinePath(ctx, splinePath, null, {
            mmToCanvas,
            scale: data.scale,
          });
        }
      }
    }

    // Draw mission planner points and connections - ALWAYS show in mission mode
    if (data.controlMode === "mission" && data.robotConfig) {
      // Show the editing mission if available, otherwise show the selected mission
      const missionToShow = data.editingMission || data.selectedMission;

      if (missionToShow) {
        drawMissionPlanner(
          ctx,
          missionToShow,
          data.positions,
          { mmToCanvas, canvasToMm, scale: data.scale },
          {
            showConnections: true,
            selectedPointId: data.selectedPointId,
            showRobotGhosts: true,
            robotConfig: data.robotConfig,
          },
        );
      }
    }

    // Draw mission point placement preview with arc path preview
    // Use atom mouse position instead of prop, and convert from mat coordinates to canvas coordinates
    const mousePositionForPreview = data.atomMousePosition
      ? mmToCanvas(data.atomMousePosition.x, data.atomMousePosition.y)
      : null;

    if (
      data.controlMode === "mission" &&
      data.pointPlacementMode &&
      mousePositionForPreview &&
      data.editingMission &&
      data.robotConfig
    ) {
      // no-op

      // Draw the smooth path preview showing how the new point will connect
      if (
        data.pointPlacementMode === "waypoint" ||
        data.pointPlacementMode === "action"
      ) {
        drawMissionPathPreview(
          ctx,
          data.editingMission,
          data.positions,
          mousePositionForPreview,
          data.pointPlacementMode,
          data.actionPointHeading,
          { mmToCanvas, canvasToMm, scale: data.scale },
        );
      }

      // Draw the point preview on top of the path preview
      drawMissionPointPreview(
        ctx,
        mousePositionForPreview,
        data.pointPlacementMode,
        data.actionPointHeading,
        { mmToCanvas, canvasToMm, scale: data.scale },
        data.robotConfig,
      );
    }
  }, [matImageRef.current, canvasRef.current]);

  // Event-driven draw; coalesce invalidations via RAF
  const invalidate = useCallback(() => {
    if (!canvasRef.current) return;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const data = dataRefs.current;
      const targetWidth = Math.round(data.canvasSize.width);
      const targetHeight = Math.round(data.canvasSize.height);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      const now = performance.now();
      if (now - lastFrameTimeRef.current >= targetFrameMs) {
        lastFrameTimeRef.current = now;
        drawCanvas();
      }
    });
  }, [drawCanvas, canvasRef.current]);

  // Signal-driven invalidation for relevant inputs
  useEffect(() => { invalidate(); }, [
    // Atom-driven inputs
    canvasSize,
    scale,
    coordinateUtils,
    customMatConfig,
    controlMode,
    robotConfig,
    showGridOverlay,
    hoveredObject,
    missionBounds,
    pathOptions,
    selectedPathPoints,
    ghostRobot,
    editingMission,
    selectedMission,
    selectedPointId,
    positions,
    atomMousePosition,
    // Prop-driven inputs
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
    lowQuality,
  ]);

  return {
    drawCanvas,
    invalidate,
  };
}
