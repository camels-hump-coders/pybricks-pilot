import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { telemetryHistory } from "../services/telemetryHistory";
import {
  // Control point atoms
  addControlPointAtom,
  addSplinePointAtom,
  addTangencyHandlesToIntermediatePointsAtom,
  calculateRobotPosition,
  cancelSplinePathAtom,
  completeSplinePathAtom,
  controlModeAtom,
  createSplinePathAtom,
  currentScoreAtom,
  currentSplinePathAtom,
  customMatConfigAtom,
  deleteSplinePointAtom,
  executingCommandIndexAtom,
  hoveredCurvatureHandlePointIdAtom,
  hoveredSplinePointIdAtom,
  isExecutingSplinePathAtom,
  isSettingPositionAtom,
  // Spline path atoms
  isSplinePathModeAtom,
  manualHeadingAdjustmentAtom,
  maxPathPointsAtom,
  mousePositionAtom,
  movementPreviewAtom,
  type ObjectiveState,
  pathColorModeAtom,
  pathOpacityAtom,
  perpendicularPreviewAtom,
  removeControlPointAtom,
  resetScoringAtom,
  robotPositionAtom,
  type SplinePathPoint,
  scoringStateAtom,
  selectedSplinePointIdAtom,
  showPathAtom,
  splinePathCommandsAtom,
  splinePathsAtom,
  telemetryReferenceAtom,
  totalScoreAtom,
  updateControlPointAtom,
  updateScoringAtom,
  updateSplinePointAtom,
  // Curvature handle atoms
  updateTangencyHandleAtom,
} from "../store/atoms/gameMat";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import type { ColorMode } from "../services/telemetryHistory";
import type { RobotPosition } from "../utils/robotPosition";

export function useJotaiGameMat() {
  // Robot position state
  const [robotPosition, setRobotPositionDirect] = useAtom(robotPositionAtom);
  const [isSettingPosition, setIsSettingPosition] = useAtom(
    isSettingPositionAtom,
  );
  const [mousePosition, setMousePosition] = useAtom(mousePositionAtom);
  const [manualHeadingAdjustment, setManualHeadingAdjustment] = useAtom(
    manualHeadingAdjustmentAtom,
  );
  const [telemetryReference, setTelemetryReference] = useAtom(
    telemetryReferenceAtom,
  );
  const robotConfig = useAtomValue(robotConfigAtom);

  // Game mat configuration
  const [customMatConfig, setCustomMatConfig] = useAtom(customMatConfigAtom);
  const [scoringState, setScoringStateDirect] = useAtom(scoringStateAtom);
  const [totalScore, setTotalScore] = useAtom(totalScoreAtom);

  // Movement preview
  const [movementPreview, setMovementPreview] = useAtom(movementPreviewAtom);

  // Perpendicular motion preview
  const [perpendicularPreview, setPerpendicularPreview] = useAtom(
    perpendicularPreviewAtom,
  );

  // Path visualization
  const [showPath, setShowPath] = useAtom(showPathAtom);
  const [pathColorMode, setPathColorMode] = useAtom(pathColorModeAtom);
  const [pathOpacity, setPathOpacity] = useAtom(pathOpacityAtom);
  const [maxPathPoints, setMaxPathPoints] = useAtom(maxPathPointsAtom);

  // Control mode
  const [controlMode, setControlMode] = useAtom(controlModeAtom);

  // Spline path planning mode
  const [isSplinePathMode, setIsSplinePathMode] = useAtom(isSplinePathModeAtom);
  const [currentSplinePath, setCurrentSplinePath] = useAtom(
    currentSplinePathAtom,
  );
  const [splinePaths, _setSplinePaths] = useAtom(splinePathsAtom);
  const [selectedSplinePointId, setSelectedSplinePointId] = useAtom(
    selectedSplinePointIdAtom,
  );
  const [hoveredSplinePointId, setHoveredSplinePointId] = useAtom(
    hoveredSplinePointIdAtom,
  );
  const [hoveredCurvatureHandlePointId, setHoveredCurvatureHandlePointId] =
    useAtom(hoveredCurvatureHandlePointIdAtom);
  const [splinePathCommands, setSplinePathCommands] = useAtom(
    splinePathCommandsAtom,
  );
  const [isExecutingSplinePath, setIsExecutingSplinePath] = useAtom(
    isExecutingSplinePathAtom,
  );
  const [executingCommandIndex, setExecutingCommandIndex] = useAtom(
    executingCommandIndexAtom,
  );

  // Derived values
  const currentScore = useAtomValue(currentScoreAtom);

  // Actions
  const updateScoringAction = useSetAtom(updateScoringAtom);
  const resetScoringAction = useSetAtom(resetScoringAtom);

  // Spline path actions
  const createSplinePathAction = useSetAtom(createSplinePathAtom);
  const addSplinePointAction = useSetAtom(addSplinePointAtom);
  const updateSplinePointAction = useSetAtom(updateSplinePointAtom);
  const deleteSplinePointAction = useSetAtom(deleteSplinePointAtom);
  const completeSplinePathAction = useSetAtom(completeSplinePathAtom);
  const cancelSplinePathAction = useSetAtom(cancelSplinePathAtom);

  // Control point actions
  const addControlPointAction = useSetAtom(addControlPointAtom);
  const updateControlPointAction = useSetAtom(updateControlPointAtom);
  const removeControlPointAction = useSetAtom(removeControlPointAtom);

  // Tangency handle actions
  const updateTangencyHandleAction = useSetAtom(updateTangencyHandleAtom);
  const addTangencyHandlesToIntermediatePointsAction = useSetAtom(
    addTangencyHandlesToIntermediatePointsAtom,
  );

  // Helper functions - stabilize with refs to avoid recreating on every render
  const telemetryReferenceRef = useRef(telemetryReference);
  const robotPositionRef = useRef(robotPosition);
  const manualHeadingAdjustmentRef = useRef(manualHeadingAdjustment);
  const robotConfigRef = useRef(robotConfig);

  // Update refs when values change
  useEffect(() => {
    telemetryReferenceRef.current = telemetryReference;
  }, [telemetryReference]);

  useEffect(() => {
    robotPositionRef.current = robotPosition;
  }, [robotPosition]);

  useEffect(() => {
    manualHeadingAdjustmentRef.current = manualHeadingAdjustment;
  }, [manualHeadingAdjustment]);

  useEffect(() => {
    robotConfigRef.current = robotConfig;
  }, [robotConfig]);

  // Color Mode is unified via pathColorModeAtom (re-exported from telemetryPoints)

  const updateRobotPositionFromTelemetry = useCallback(
    (telemetryData: {
      drivebase?: {
        distance?: number;
        angle?: number;
      };
    }) => {
      if (!telemetryData?.drivebase) return;

      const { distance, angle } = telemetryData.drivebase;

      // Handle undefined values
      if (distance === undefined || angle === undefined) return;

      // Use refs to get current values without causing re-renders
      const currentTelemetryReference = telemetryReferenceRef.current;
      const currentRobotPosition = robotPositionRef.current;
      const currentManualHeadingAdjustment = manualHeadingAdjustmentRef.current;

      // Initialize reference if needed
      if (!currentTelemetryReference) {
        setTelemetryReference({
          distance,
          angle,
          position: currentRobotPosition,
        });
        return;
      }

      // Calculate delta from reference
      const deltaDistance = distance - currentTelemetryReference.distance;
      const deltaAngle = angle - currentTelemetryReference.angle;

      // SIMPLIFIED MODEL: Track center of rotation position directly
      // The stored position IS the center of rotation position
      let centerOfRotationX = currentRobotPosition.x;
      let centerOfRotationY = currentRobotPosition.y;
      let newHeading = currentRobotPosition.heading;

      // Apply manual heading adjustment
      newHeading = (newHeading + currentManualHeadingAdjustment) % 360;

      // Handle rotation: Only changes heading, center of rotation position stays the same
      if (Math.abs(deltaAngle) > 0.1) {
        newHeading = (newHeading + deltaAngle) % 360;
      }

      // Apply forward/backward movement: Move the center of rotation directly
      if (Math.abs(deltaDistance) > 0.1) {
        const headingRad = (newHeading * Math.PI) / 180;
        const deltaX = deltaDistance * Math.sin(headingRad);
        // SIMPLIFIED MODEL: Move center of rotation in heading direction
        // heading=0° = move UP (decrease Y), heading=180° = move DOWN (increase Y)
        const deltaY = -deltaDistance * Math.cos(headingRad);

        centerOfRotationX = centerOfRotationX + deltaX;
        centerOfRotationY = centerOfRotationY + deltaY;
      }

      // Set robot position directly - this is now the CENTER OF ROTATION position
      // This avoids recursive calls while maintaining the telemetry flow
      setRobotPositionDirect({
        x: centerOfRotationX,
        y: centerOfRotationY,
        heading: newHeading,
      });
    },
    [setTelemetryReference, setRobotPositionDirect], // Only stable dependencies
  );

  // Wrapper functions for backward compatibility
  const setRobotPosition = useCallback(
    async (
      position: RobotPosition,
      resetFunctions?: {
        resetTelemetry: () => Promise<void>;
        clearProgramOutputLog: () => void;
        setAccumulatedTelemetry: (state: {
          distance: number;
          angle: number;
        }) => void;
        setManualHeadingAdjustment: (adjustment: number) => void;
        setScoringState: (state: any) => void;
      },
    ) => {
      // MANUAL POSITION SETTING: Perform same reset steps as reset button before setting position
      if (resetFunctions) {
        await resetFunctions.resetTelemetry();
        resetFunctions.clearProgramOutputLog();
        resetFunctions.setAccumulatedTelemetry({ distance: 0, angle: 0 });
        resetFunctions.setManualHeadingAdjustment(0);
        resetFunctions.setScoringState({});
      }

      // This bypasses the delta-based telemetry system for manual positioning
      setRobotPositionDirect(position);

      // Reset telemetry reference to the new position
      setTelemetryReference({
        distance: 0,
        angle: 0,
        position: position,
      });

      // Clear telemetry history when manually setting position
      telemetryHistory.startNewPath();
    },
    [setRobotPositionDirect, setTelemetryReference],
  );

  const updateScoring = useCallback(
    (missionId: string, objectiveId: string, state: ObjectiveState) => {
      updateScoringAction({ missionId, objectiveId, state });
    },
    [updateScoringAction],
  );

  const resetScoring = useCallback(() => {
    resetScoringAction();
  }, [resetScoringAction]);

  const resetRobotToStartPosition = useCallback(() => {
    // Reset robot position to default starting position (bottom-right)
    const startPosition = calculateRobotPosition(robotConfig, "bottom-right");
    setRobotPosition(startPosition);
    // Reset telemetry reference to maintain position tracking
    setTelemetryReference({
      distance: 0,
      angle: 0,
      position: startPosition,
    });
    // Clear manual heading adjustment
    setManualHeadingAdjustment(0);
  }, [
    robotConfig,
    setRobotPosition,
    setTelemetryReference,
    setManualHeadingAdjustment,
  ]);

  const togglePathVisualization = useCallback(() => {
    setShowPath((prev) => !prev);
  }, [setShowPath]);

  const cyclePathColorMode = useCallback(() => {
    const order: ColorMode[] = [
      "none",
      "speed",
      "motorLoad",
      "distanceSensor",
      "reflectionSensor",
      "forceSensor",
    ];
    const idx = order.indexOf(pathColorMode as unknown as ColorMode);
    const next = order[(idx + 1) % order.length];
    setPathColorMode(next as any);
  }, [pathColorMode, setPathColorMode]);

  // Spline path helper functions
  const createSplinePath = useCallback(
    (name: string) => {
      return createSplinePathAction(name);
    },
    [createSplinePathAction],
  );

  const addSplinePoint = useCallback(
    (position: RobotPosition) => {
      return addSplinePointAction(position);
    },
    [addSplinePointAction],
  );

  const updateSplinePoint = useCallback(
    (pointId: string, updates: Partial<SplinePathPoint>) => {
      updateSplinePointAction(pointId, updates);
    },
    [updateSplinePointAction],
  );

  const deleteSplinePoint = useCallback(
    (pointId: string) => {
      deleteSplinePointAction(pointId);
    },
    [deleteSplinePointAction],
  );

  const completeSplinePath = useCallback(() => {
    completeSplinePathAction();
  }, [completeSplinePathAction]);

  const cancelSplinePath = useCallback(() => {
    cancelSplinePathAction();
  }, [cancelSplinePathAction]);

  // Control point helper functions
  const addControlPoint = useCallback(
    (
      pointId: string,
      controlType: "before" | "after",
      controlPoint: { x: number; y: number },
    ) => {
      addControlPointAction(pointId, controlType, controlPoint);
    },
    [addControlPointAction],
  );

  const updateControlPoint = useCallback(
    (
      pointId: string,
      controlType: "before" | "after",
      controlPoint: { x: number; y: number },
    ) => {
      updateControlPointAction(pointId, controlType, controlPoint);
    },
    [updateControlPointAction],
  );

  const removeControlPoint = useCallback(
    (pointId: string, controlType: "before" | "after") => {
      removeControlPointAction(pointId, controlType);
    },
    [removeControlPointAction],
  );

  // Curvature handle helper functions
  const updateTangencyHandle = useCallback(
    (
      pointId: string,
      tangencyHandle: {
        x: number;
        y: number;
        strength: number;
        isEdited: boolean;
        isTangentDriving: boolean;
      },
    ) => {
      updateTangencyHandleAction(pointId, tangencyHandle);
    },
    [updateTangencyHandleAction],
  );

  const addTangencyHandlesToIntermediatePoints = useCallback(() => {
    addTangencyHandlesToIntermediatePointsAction();
  }, [addTangencyHandlesToIntermediatePointsAction]);

  const enterSplinePathMode = useCallback(
    (pathName: string = "New Path") => {
      setControlMode("mission");
      createSplinePath(pathName);
    },
    [setControlMode, createSplinePath],
  );

  const exitSplinePathMode = useCallback(() => {
    if (currentSplinePath && !currentSplinePath.isComplete) {
      cancelSplinePath();
    } else {
      setIsSplinePathMode(false);
      setCurrentSplinePath(null);
      setSelectedSplinePointId(null);
    }
    // Return to incremental mode when exiting spline mode
    setControlMode("incremental");
  }, [
    currentSplinePath,
    cancelSplinePath,
    setIsSplinePathMode,
    setCurrentSplinePath,
    setSelectedSplinePointId,
    setControlMode,
  ]);

  const addSplinePointAtMousePosition = useCallback(
    (mouseX: number, mouseY: number) => {
      if (!isSplinePathMode) return null;

      // Calculate heading for the new point based on direction from previous point
      let heading = robotPosition.heading; // Default to current robot heading

      if (currentSplinePath && currentSplinePath.points.length > 0) {
        const lastPoint =
          currentSplinePath.points[currentSplinePath.points.length - 1];
        const dx = mouseX - lastPoint.position.x;
        const dy = mouseY - lastPoint.position.y;
        heading = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
        if (heading > 180) heading -= 360; // Normalize to -180 to 180
      }

      const newPosition: RobotPosition = {
        x: mouseX,
        y: mouseY,
        heading: heading,
      };

      const pointId = addSplinePoint(newPosition);

      // After adding a point, check if we need to add curvature handles
      // Use queueMicrotask for more reliable async execution
      queueMicrotask(() => {
        addTangencyHandlesToIntermediatePoints();
      });

      return pointId;
    },
    [
      isSplinePathMode,
      robotPosition,
      currentSplinePath,
      addSplinePoint,
      addTangencyHandlesToIntermediatePoints,
    ],
  );

  // Effect to automatically add curvature handles when spline path changes
  useEffect(() => {
    if (currentSplinePath && currentSplinePath.points.length >= 3) {
      // Check if any intermediate points are missing curvature handles
      const needsHandles = currentSplinePath.points.some((point, index) => {
        const isIntermediate =
          index > 0 && index < currentSplinePath.points.length - 1;
        return isIntermediate && !point.tangencyHandle;
      });

      if (needsHandles) {
        console.log("Adding curvature handles to intermediate points...");
        addTangencyHandlesToIntermediatePoints();
      }
    }
  }, [currentSplinePath, addTangencyHandlesToIntermediatePoints]);

  return {
    // Robot position
    robotPosition,
    setRobotPosition,
    isSettingPosition,
    setIsSettingPosition,
    mousePosition,
    setMousePosition,
    manualHeadingAdjustment,
    setManualHeadingAdjustment,
    telemetryReference,
    setTelemetryReference,
    updateRobotPositionFromTelemetry,

    // Game mat configuration
    customMatConfig,
    setCustomMatConfig,
    scoringState,
    setScoringState: setScoringStateDirect,
    totalScore,
    setTotalScore,
    currentScore,

    // Scoring actions
    updateScoring,
    resetScoring,
    resetRobotToStartPosition,

    // Movement preview
    movementPreview,
    setMovementPreview,

    // Perpendicular motion preview
    perpendicularPreview,
    setPerpendicularPreview,

    // Path visualization
    showPath,
    setShowPath,
    togglePathVisualization,
    pathColorMode,
    setPathColorMode,
    cyclePathColorMode,
    pathOpacity,
    setPathOpacity,
    maxPathPoints,
    setMaxPathPoints,

    // Control mode
    controlMode,
    setControlMode,

    // Spline path planning mode
    isSplinePathMode,
    currentSplinePath,
    splinePaths,
    selectedSplinePointId,
    setSelectedSplinePointId,
    hoveredSplinePointId,
    setHoveredSplinePointId,
    hoveredCurvatureHandlePointId,
    setHoveredCurvatureHandlePointId,
    splinePathCommands,
    setSplinePathCommands,
    isExecutingSplinePath,
    setIsExecutingSplinePath,
    executingCommandIndex,
    setExecutingCommandIndex,

    // Spline path actions
    createSplinePath,
    addSplinePoint,
    updateSplinePoint,
    deleteSplinePoint,
    completeSplinePath,
    cancelSplinePath,
    enterSplinePathMode,
    exitSplinePathMode,

    // Control point actions
    addControlPoint,
    updateControlPoint,
    removeControlPoint,

    // Tangency handle actions
    updateTangencyHandle,
    addTangencyHandlesToIntermediatePoints,
    addSplinePointAtMousePosition,
  };
}
