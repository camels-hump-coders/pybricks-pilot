import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useCmdKey } from "../hooks/useCmdKey";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useMatImageLoader } from "../hooks/useMatImageLoader";
import { useTelemetryUpdates } from "../hooks/useTelemetryUpdates";
import {
  telemetryHistory,
  type TelemetryPoint,
} from "../services/telemetryHistory";
import {
  canvasScaleAtom,
  canvasSizeAtom,
  coordinateUtilsAtom,
  hoveredObjectAtom,
  hoveredPointAtom,
  missionBoundsAtom,
} from "../store/atoms/canvasState";
import {
  controlModeAtom,
  customMatConfigAtom,
  showGridOverlayAtom,
} from "../store/atoms/gameMat";
import { ghostRobotAtom } from "../store/atoms/ghostPosition";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { telemetryDataAtom } from "../store/atoms/robotConnection";
import {
  allTelemetryPointsAtom,
  pathVisualizationOptionsAtom,
  selectedPathPointsAtom,
} from "../store/atoms/telemetryPoints";
import {
  popoverObjectAtom,
  missionsExpandedAtom,
  isPseudoCodeExpandedAtom,
  isTelemetryPlaybackExpandedAtom,
  hoveredTelemetryPointAtom,
  tooltipPositionAtom,
  isDraggingPointAtom,
  draggedPointIdAtom,
  justFinishedDraggingAtom,
  isDraggingControlPointAtom,
  draggedControlPointAtom,
  isDraggingTangencyHandleAtom,
  draggedTangencyHandleAtom,
  stopAllDraggingAtom,
} from "../store/atoms/matUIState";
import { drawBorderWalls, drawGrid } from "../utils/canvas/basicDrawing";
import { drawMissions } from "../utils/canvas/missionDrawing";
import { drawMovementPreview } from "../utils/canvas/movementPreviewDrawing";
import { drawRobot } from "../utils/canvas/robotDrawing.js";
import { drawRobotOrientedGrid } from "../utils/canvas/robotGridDrawing";
import {
  drawSplinePath,
  findClickedControlPoint,
  findClickedTangencyHandle,
} from "../utils/canvas/splinePathDrawing";
import { drawTelemetryPath } from "../utils/canvas/telemetryDrawing.js";
import { drawPerpendicularTrajectoryProjection } from "../utils/canvas/trajectoryDrawing.js";
import { type RobotPosition } from "../utils/robotPosition";
import {
  getMaxPointsForMission,
  getTotalPointsForMission,
} from "../utils/scoringUtils";
import { calculateTrajectoryProjection } from "./MovementPreview";
import { PseudoCodePanel } from "./PseudoCodePanel";
import { ScoringModal } from "./ScoringModal";
import { TelemetryPlayback } from "./TelemetryPlayback";
import { TelemetryTooltip } from "./EnhancedCompetitionMat/TelemetryTooltip";
import { MissionsList } from "./EnhancedCompetitionMat/MissionsList";

// RobotPosition interface now imported from utils/canvas

interface EnhancedCompetitionMatProps {
  isConnected: boolean;
  showScoring?: boolean;
}

// Constants are now imported from coordinateUtilsAtom
const BORDER_WALL_HEIGHT_MM = 36; // 36mm tall border walls

// Scoring types and utilities now imported from utils/scoringUtils

export function EnhancedCompetitionMat({
  isConnected,
  showScoring = false,
}: EnhancedCompetitionMatProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Get coordinate utilities and constants from atom
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const customMatConfig = useAtomValue(customMatConfigAtom);

  // Get control mode from global atom
  const controlMode = useAtomValue(controlModeAtom);

  // Get robot configuration
  const robotConfig = useAtomValue(robotConfigAtom);
  const allTelemetryPoints = useAtomValue(allTelemetryPointsAtom);

  // Use Jotai for game mat state management
  const gameMat = useJotaiGameMat();
  const {
    robotPosition: currentPosition,
    mousePosition,
    setMousePosition,
    telemetryReference,
    setTelemetryReference,
    manualHeadingAdjustment,
    scoringState,
    setScoringState,
    resetRobotToStartPosition,
    updateRobotPositionFromTelemetry,
    movementPreview,
    perpendicularPreview,
    // Spline path planning
    isSplinePathMode,
    currentSplinePath,
    splinePaths,
    selectedSplinePointId,
    setSelectedSplinePointId,
    hoveredSplinePointId,
    setHoveredSplinePointId,
    hoveredCurvatureHandlePointId,
    setHoveredCurvatureHandlePointId,
    exitSplinePathMode,
    addSplinePointAtMousePosition,
    updateSplinePoint,
    deleteSplinePoint,
    completeSplinePath,
    updateControlPoint,
    // Curvature handle actions
    updateTangencyHandle,
  } = gameMat;

  const [popoverObject, setPopoverObject] = useAtom(popoverObjectAtom);

  // Canvas state from atoms
  const [hoveredObject, setHoveredObject] = useAtom(hoveredObjectAtom);
  const [scale, setScale] = useAtom(canvasScaleAtom);
  const [canvasSize, setCanvasSize] = useAtom(canvasSizeAtom);
  const [missionBounds, setMissionBounds] = useAtom(missionBoundsAtom);

  // Note: missionsExpanded is now handled inside MissionsList component

  // Path visualization state from atom
  const pathOptions = useAtomValue(pathVisualizationOptionsAtom);
  const selectedPathPoints = useAtomValue(selectedPathPointsAtom);
  const [hoveredPoint, setHoveredPoint] = useAtom(hoveredTelemetryPointAtom);
  const [hoveredPointIndex, setHoveredPointIndex] = useAtom(hoveredPointAtom);
  const hoveredPointIndexValue = hoveredPointIndex ?? -1; // Convert null to -1 for backwards compatibility
  const [tooltipPosition, setTooltipPosition] = useAtom(tooltipPositionAtom);

  // Accordion panel states from atoms
  const [isPseudoCodeExpanded, setIsPseudoCodeExpanded] = useAtom(isPseudoCodeExpandedAtom);
  const [isTelemetryPlaybackExpanded, setIsTelemetryPlaybackExpanded] = useAtom(isTelemetryPlaybackExpandedAtom);

  // Spline path dragging state from atoms
  const [isDraggingPoint, setIsDraggingPoint] = useAtom(isDraggingPointAtom);
  const [draggedPointId, setDraggedPointId] = useAtom(draggedPointIdAtom);
  const justFinishedDragging = useAtomValue(justFinishedDraggingAtom);

  // Control point dragging state from atoms
  const [isDraggingControlPoint, setIsDraggingControlPoint] = useAtom(isDraggingControlPointAtom);
  const [draggedControlPoint, setDraggedControlPoint] = useAtom(draggedControlPointAtom);

  // Curvature handle dragging state from atoms
  const [isDraggingTangencyHandle, setIsDraggingTangencyHandle] = useAtom(isDraggingTangencyHandleAtom);
  const [draggedTangencyHandle, setDraggedTangencyHandle] = useAtom(draggedTangencyHandleAtom);
  
  // Stop all dragging action
  const stopAllDragging = useSetAtom(stopAllDraggingAtom);

  // Hover states are now managed by Jotai atoms

  // Ghost robot state for telemetry playback
  const ghostRobot = useAtomValue(ghostRobotAtom);
  const ghostPosition = ghostRobot.isVisible ? ghostRobot.position : null;

  // Grid overlay state from Jotai atom
  const showGridOverlay = useAtomValue(showGridOverlayAtom);

  // Fresh telemetry data from atom (not stale closure data)
  const currentTelemetryData = useAtomValue(telemetryDataAtom);

  // Use a ref to always have access to the latest telemetry data
  const telemetryDataRef = useRef(currentTelemetryData);
  telemetryDataRef.current = currentTelemetryData;

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
    const handlePositionResetEvent = () => {
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
        const matWidth = coordinateUtils.matDimensions.matWidthMm;
        const matHeight = coordinateUtils.matDimensions.matHeightMm;

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
    const totalWidth =
      coordinateUtils.matDimensions.tableWidth +
      2 * coordinateUtils.matDimensions.borderWallThickness;
    const totalHeight =
      coordinateUtils.matDimensions.tableHeight +
      2 * coordinateUtils.matDimensions.borderWallThickness;

    // PRIORITIZE USING FULL CONTAINER WIDTH
    // Always use the full available container width for the canvas
    const newScale = containerWidth / totalWidth; // Scale to fill container width
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

  // Mat image loading hook
  const { matImageRef, loadedImage } = useMatImageLoader(
    customMatConfig || null,
    updateCanvasSize
  );

  // Note: Using coordinate utils from atoms instead of local implementation
  // This avoids duplication and ensures consistency

  // Use the coordinate utils from atoms - no need for duplicate implementation
  const { canvasToMm, mmToCanvas } = coordinateUtils;

  // Event handlers use extracted coordinate utilities (keeping local implementation for now)

  // normalizeHeading is now imported from utils/headingUtils
  // waitForDesiredHeading function removed - now using compound turnAndDrive commands

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
      BORDER_WALL_HEIGHT_MM,
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
        { mmToCanvas, scale },
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
          getColorForPoint: (point: TelemetryPoint, colorMode: string) =>
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
      controlMode === "spline" || controlMode === "program"
        ? "incremental"
        : controlMode, // Fallback to incremental for spline and program modes
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
      perpendicularPreview.ghosts.forEach((ghost) => {
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
    // Spline path state
    isSplinePathMode,
    currentSplinePath,
    splinePaths,
    selectedSplinePointId,
    mmToCanvas,
    canvasToMm,
  ]); // canvasSize removed as it's handled separately

  // Use CMD key detection hook
  const isCmdKeyPressed = useCmdKey();

  // Telemetry updates hook
  useTelemetryUpdates({
    isConnected,
    currentPosition,
    telemetryReference,
    manualHeadingAdjustment,
    isCmdKeyPressed,
    onTelemetryReferenceUpdate: setTelemetryReference,
    onRobotPositionUpdate: updateRobotPositionFromTelemetry,
  });

  // Use refs to access current values without causing useEffect re-runs
  const telemetryReferenceRef = useRef(telemetryReference);
  const currentPositionRef = useRef(currentPosition);
  const manualHeadingAdjustmentRef = useRef(manualHeadingAdjustment);
  const customMatConfigRef = useRef(customMatConfig);
  const showScoringRef = useRef(showScoring);
  const isCmdKeyPressedRef = useRef(isCmdKeyPressed);

  isCmdKeyPressedRef.current = isCmdKeyPressed;
  telemetryReferenceRef.current = telemetryReference;
  currentPositionRef.current = currentPosition;
  manualHeadingAdjustmentRef.current = manualHeadingAdjustment;
  customMatConfigRef.current = customMatConfig;
  showScoringRef.current = showScoring;

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

  // Helper function to check if a click is on a spline path point
  const findClickedSplinePoint = (
    canvasX: number,
    canvasY: number
  ): string | null => {
    if (!currentSplinePath || !currentSplinePath.points.length) return null;

    const clickRadius = 15; // Click detection radius in pixels

    for (const point of currentSplinePath.points) {
      const pointCanvasPos = mmToCanvas(point.position.x, point.position.y);
      const distance = Math.sqrt(
        Math.pow(canvasX - pointCanvasPos.x, 2) +
          Math.pow(canvasY - pointCanvasPos.y, 2)
      );

      if (distance <= clickRadius) {
        return point.id;
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

    // Handle spline path mode clicks
    if (isSplinePathMode) {
      // Ignore clicks immediately after finishing a drag operation
      if (justFinishedDragging) {
        console.log("Ignoring click immediately after drag ended");
        return;
      }

      const matPos = canvasToMm(canvasX, canvasY);

      // Check if clicking on an existing point for selection/editing or dragging
      if (currentSplinePath) {
        // First check for control point clicks
        const utils = {
          mmToCanvas: (x: number, y: number) => {
            const coords = coordinateUtils.mmToCanvas(x, y);
            return { x: coords.x, y: coords.y };
          },
          scale,
        };

        // Check for tangency handle clicks (highest priority)
        const clickedTangencyHandle = findClickedTangencyHandle(
          canvasX,
          canvasY,
          currentSplinePath,
          utils
        );
        if (clickedTangencyHandle) {
          setSelectedSplinePointId(clickedTangencyHandle.pointId);

          // Get the current handle for initial state
          const point = currentSplinePath.points.find(
            (p) => p.id === clickedTangencyHandle.pointId
          );
          if (point?.tangencyHandle) {
            const matPos = canvasToMm(canvasX, canvasY);
            setDraggedTangencyHandle({
              pointId: clickedTangencyHandle.pointId,
              gripType: clickedTangencyHandle.gripType,
              initialHandle: { ...point.tangencyHandle },
              initialMousePos: { x: matPos.x, y: matPos.y },
            });
            setIsDraggingTangencyHandle(true);
          }
          return;
        }

        // Then check for control point clicks
        const clickedControlPoint = findClickedControlPoint(
          canvasX,
          canvasY,
          currentSplinePath,
          utils
        );
        if (clickedControlPoint) {
          setSelectedSplinePointId(clickedControlPoint.pointId);
          setDraggedControlPoint(clickedControlPoint);
          setIsDraggingControlPoint(true);
          return;
        }

        // Then check for regular point clicks
        const clickedPointId = findClickedSplinePoint(canvasX, canvasY);
        if (clickedPointId) {
          setSelectedSplinePointId(clickedPointId);
          setDraggedPointId(clickedPointId);
          setIsDraggingPoint(true);
          return;
        }
      }

      // Add new point to the path
      const pointId = addSplinePointAtMousePosition(matPos.x, matPos.y);
      if (pointId) {
        setSelectedSplinePointId(pointId);
        console.log("Added spline point at", matPos);
      }
      return;
    }

    // Check for mission clicks (if scoring is enabled and in program mode)
    if (showScoring && controlMode === "program") {
      const clickedObjectId = checkMissionClick(canvasX, canvasY);
      if (clickedObjectId) {
        setPopoverObject(clickedObjectId);
        return;
      } else {
        // Close popover if clicking elsewhere
        setPopoverObject(null);
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

    // Handle spline point dragging
    if (isSplinePathMode && isDraggingPoint && draggedPointId) {
      const matPos = canvasToMm(canvasX, canvasY);
      // Find the point and update its position
      const point = currentSplinePath?.points.find(
        (p) => p.id === draggedPointId
      );
      if (point) {
        updateSplinePoint(draggedPointId, {
          position: {
            x: matPos.x,
            y: matPos.y,
            heading: point.position.heading, // Keep existing heading
          },
        });
      }
    }

    // Handle control point dragging
    if (isSplinePathMode && isDraggingControlPoint && draggedControlPoint) {
      const matPos = canvasToMm(canvasX, canvasY);
      // Find the point and update the control point relative to the point position
      const point = currentSplinePath?.points.find(
        (p) => p.id === draggedControlPoint.pointId
      );
      if (point) {
        const controlPoint = {
          x: matPos.x - point.position.x,
          y: matPos.y - point.position.y,
        };
        updateControlPoint(
          draggedControlPoint.pointId,
          draggedControlPoint.controlType,
          controlPoint
        );
      }
    }

    // Handle SolidWorks-style tangency handle dragging
    if (isSplinePathMode && isDraggingTangencyHandle && draggedTangencyHandle) {
      const matPos = canvasToMm(canvasX, canvasY);
      const point = currentSplinePath?.points.find(
        (p) => p.id === draggedTangencyHandle.pointId
      );

      if (point?.tangencyHandle) {
        const currentOffset = {
          x: matPos.x - point.position.x,
          y: matPos.y - point.position.y,
        };

        const { gripType, initialHandle } = draggedTangencyHandle;
        let newHandle = { ...initialHandle, isEdited: true }; // Mark as edited (blue)

        if (gripType === "diamond") {
          // Diamond grip: Controls angle only, maintains original magnitude
          const originalLength = Math.sqrt(
            initialHandle.x * initialHandle.x +
              initialHandle.y * initialHandle.y
          );
          const newAngle = Math.atan2(currentOffset.y, currentOffset.x);
          newHandle.x = Math.cos(newAngle) * originalLength;
          newHandle.y = Math.sin(newAngle) * originalLength;
        } else if (gripType === "arrow") {
          // Arrow grip: Controls magnitude only, maintains original angle
          const originalAngle = Math.atan2(initialHandle.y, initialHandle.x);
          const newLength = Math.sqrt(
            currentOffset.x * currentOffset.x +
              currentOffset.y * currentOffset.y
          );
          newHandle.x = Math.cos(originalAngle) * newLength;
          newHandle.y = Math.sin(originalAngle) * newLength;

          // Update strength based on new length
          const maxDistance = 100; // 100mm max distance for full strength
          newHandle.strength = Math.min(newLength / maxDistance, 1);
        } else if (gripType === "endpoint") {
          // End-point grip: Controls both angle and magnitude
          newHandle.x = currentOffset.x;
          newHandle.y = currentOffset.y;

          // Update strength based on distance
          const distance = Math.sqrt(
            currentOffset.x * currentOffset.x +
              currentOffset.y * currentOffset.y
          );
          const maxDistance = 100; // 100mm max distance for full strength
          newHandle.strength = Math.min(distance / maxDistance, 1);
        }

        updateTangencyHandle(draggedTangencyHandle.pointId, newHandle);
      }
    }

    // Check for spline element hover (only when not dragging)
    if (
      isSplinePathMode &&
      currentSplinePath &&
      !isDraggingPoint &&
      !isDraggingControlPoint &&
      !isDraggingTangencyHandle
    ) {
      const utils = {
        mmToCanvas: (x: number, y: number) => {
          const coords = coordinateUtils.mmToCanvas(x, y);
          return { x: coords.x, y: coords.y };
        },
        scale,
      };

      // Check for tangency handle hover (highest priority)
      const hoveredTangencyHandle = findClickedTangencyHandle(
        canvasX,
        canvasY,
        currentSplinePath,
        utils
      );
      if (hoveredTangencyHandle) {
        setHoveredCurvatureHandlePointId(hoveredTangencyHandle.pointId);
        setHoveredSplinePointId(null);
        // Set cursor to pointer to indicate interactivity
        if (canvas.style.cursor !== "grab") canvas.style.cursor = "grab";
      } else {
        setHoveredCurvatureHandlePointId(null);

        // Check for spline point hover
        const hoveredPointId = findClickedSplinePoint(canvasX, canvasY);
        if (hoveredPointId) {
          setHoveredSplinePointId(hoveredPointId);
          // Set cursor to pointer to indicate interactivity
          if (canvas.style.cursor !== "grab") canvas.style.cursor = "grab";
        } else {
          setHoveredSplinePointId(null);
          // Reset cursor
          if (canvas.style.cursor !== "default")
            canvas.style.cursor = "default";
        }
      }
    } else if (!isSplinePathMode) {
      // Clear hover states when not in spline mode
      setHoveredSplinePointId(null);
      setHoveredCurvatureHandlePointId(null);
      // Reset cursor
      if (canvas.style.cursor !== "default") canvas.style.cursor = "default";
    }

    // Check for telemetry point hover (if path visualization is enabled)
    if (pathOptions.showMarkers) {
      checkTelemetryPointHover(canvasX, canvasY, event.pageX, event.pageY);
    } else {
      setHoveredPoint(null);
      setHoveredPointIndex(-1);
      setTooltipPosition(null);
    }

    // Check for mission hover (only in program mode)
    if (showScoring && controlMode === "program") {
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
    // Use selected path points from atom
    const allPoints: {
      point: TelemetryPoint;
      pathIndex: number;
      pointIndex: number;
    }[] = [];

    // Collect points from selected path
    selectedPathPoints.forEach((point, pointIndex) => {
      allPoints.push({ point, pathIndex: 1, pointIndex });
    });

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
    _points: number,
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
    controlMode, // Added to trigger redraw when control mode changes
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

  // Keyboard event handler for delete key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Delete selected point when Delete or Backspace is pressed
      if (
        isSplinePathMode &&
        selectedSplinePointId &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        deleteSplinePoint(selectedSplinePointId);
        setSelectedSplinePointId(null);
      }

      // Complete path when Enter is pressed
      if (isSplinePathMode && currentSplinePath && event.key === "Enter") {
        if (currentSplinePath.points.length >= 2) {
          completeSplinePath();
        }
      }

      // Cancel path when Escape is pressed
      if (isSplinePathMode && event.key === "Escape") {
        exitSplinePathMode();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isSplinePathMode,
    selectedSplinePointId,
    currentSplinePath,
    deleteSplinePoint,
    setSelectedSplinePointId,
    completeSplinePath,
    exitSplinePathMode,
  ]);

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
                - Mat:{" "}
                {customMatConfig?.dimensions?.widthMm ||
                  coordinateUtils.matDimensions.matWidthMm}
                ×
                {customMatConfig?.dimensions?.heightMm ||
                  coordinateUtils.matDimensions.matHeightMm}
                mm, Table: {coordinateUtils.matDimensions.tableWidth}×
                {coordinateUtils.matDimensions.tableHeight}mm with{" "}
                {BORDER_WALL_HEIGHT_MM}mm walls
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            {/* Prominent Score Display */}
            {customMatConfig && showScoring && (
              <div className="bg-gradient-to-r from-green-400 to-blue-500 dark:from-green-500 dark:to-blue-600 text-white px-3 py-3 rounded-lg shadow-lg border-2 border-white dark:border-gray-300">
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

      <div className="relative bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 rounded-lg">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={() => {
            // Stop all dragging when mouse is released
            stopAllDragging();
          }}
          onMouseLeave={() => {
            setMousePosition(null);
            setHoveredObject(null);
            setHoveredPoint(null);
            setHoveredPointIndex(-1);
            setTooltipPosition(null);
            // Stop all dragging when mouse leaves
            stopAllDragging();

            // Clear spline hover states
            setHoveredSplinePointId(null);
            setHoveredCurvatureHandlePointId(null);

            // Reset cursor
            const canvas = canvasRef.current;
            if (canvas && canvas.style.cursor !== "default") {
              canvas.style.cursor = "default";
            }
          }}
          className={`block w-full rounded shadow-2xl ${
            hoveredObject ? "cursor-pointer" : "cursor-default"
          }`}
          style={{ height: "auto" }}
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
        <TelemetryTooltip
          hoveredPoint={hoveredPoint}
          tooltipPosition={tooltipPosition}
          selectedPathPoints={selectedPathPoints}
        />
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
      <MissionsList
        customMatConfig={customMatConfig}
        showScoring={showScoring}
        scoringState={scoringState}
        onToggleObjective={toggleObjective}
        getTotalPointsForMission={getTotalPointsForMission}
        getMaxPointsForMission={getMaxPointsForMission}
      />

      {/* Mission Scoring Side Panel */}
      {popoverObject &&
        customMatConfig &&
        (() => {
          const selectedMission = customMatConfig.missions.find(
            (m) => m.id === popoverObject
          );
          if (!selectedMission) return null;

          return (
            <ScoringModal
              mission={selectedMission}
              scoringState={scoringState}
              onClose={() => {
                setPopoverObject(null);
              }}
              onToggleObjective={toggleObjective}
            />
          );
        })()}

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
