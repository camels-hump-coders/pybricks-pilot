import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { telemetryHistory } from "../services/telemetryHistory";
import {
  calculateRobotPosition,
  controlModeAtom,
  currentScoreAtom,
  customMatConfigAtom,
  isSettingPositionAtom,
  manualHeadingAdjustmentAtom,
  maxPathPointsAtom,
  mousePositionAtom,
  movementPreviewAtom,
  pathColorModeAtom,
  pathOpacityAtom,
  perpendicularPreviewAtom,
  resetScoringAtom,
  robotPositionAtom,
  scoringStateAtom,
  showPathAtom,
  telemetryReferenceAtom,
  totalScoreAtom,
  updateScoringAtom,
  type ObjectiveState,
  type RobotPosition,
} from "../store/atoms/gameMat";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";

export function useJotaiGameMat() {
  // Robot position state
  const [robotPosition, setRobotPositionDirect] = useAtom(robotPositionAtom);
  const [isSettingPosition, setIsSettingPosition] = useAtom(
    isSettingPositionAtom
  );
  const [mousePosition, setMousePosition] = useAtom(mousePositionAtom);
  const [manualHeadingAdjustment, setManualHeadingAdjustment] = useAtom(
    manualHeadingAdjustmentAtom
  );
  const [telemetryReference, setTelemetryReference] = useAtom(
    telemetryReferenceAtom
  );
  const robotConfig = useAtomValue(robotConfigAtom);

  // Game mat configuration
  const [customMatConfig, setCustomMatConfig] = useAtom(customMatConfigAtom);
  const [scoringState, setScoringStateDirect] = useAtom(scoringStateAtom);
  const [totalScore, setTotalScore] = useAtom(totalScoreAtom);

  // Movement preview
  const [movementPreview, setMovementPreview] = useAtom(movementPreviewAtom);

  // Perpendicular motion preview
  const [perpendicularPreview, setPerpendicularPreview] = useAtom(perpendicularPreviewAtom);

  // Path visualization
  const [showPath, setShowPath] = useAtom(showPathAtom);
  const [pathColorMode, setPathColorMode] = useAtom(pathColorModeAtom);
  const [pathOpacity, setPathOpacity] = useAtom(pathOpacityAtom);
  const [maxPathPoints, setMaxPathPoints] = useAtom(maxPathPointsAtom);

  // Control mode
  const [controlMode, setControlMode] = useAtom(controlModeAtom);

  // Derived values
  const currentScore = useAtomValue(currentScoreAtom);

  // Actions
  const updateScoringAction = useSetAtom(updateScoringAtom);
  const resetScoringAction = useSetAtom(resetScoringAtom);

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
      const currentRobotConfig = robotConfigRef.current;

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
    [setTelemetryReference, setRobotPositionDirect] // Only stable dependencies
  );

  // Wrapper functions for backward compatibility
  const setRobotPosition = useCallback(
    async (position: RobotPosition, resetFunctions?: { resetTelemetry: () => Promise<void>; clearProgramOutputLog: () => void; setAccumulatedTelemetry: (state: { distance: number; angle: number }) => void; setManualHeadingAdjustment: (adjustment: number) => void; setScoringState: (state: any) => void; }) => {
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
      telemetryHistory.onMatReset();
    },
    [setRobotPositionDirect, setTelemetryReference]
  );

  const updateScoring = useCallback(
    (missionId: string, objectiveId: string, state: ObjectiveState) => {
      updateScoringAction({ missionId, objectiveId, state });
    },
    [updateScoringAction]
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
  }, [robotConfig, setRobotPosition, setTelemetryReference, setManualHeadingAdjustment]);

  const togglePathVisualization = useCallback(() => {
    setShowPath((prev) => !prev);
  }, [setShowPath]);

  const cyclePathColorMode = useCallback(() => {
    setPathColorMode((prev) => {
      switch (prev) {
        case "time":
          return "speed";
        case "speed":
          return "heading";
        case "heading":
          return "time";
        default:
          return "time";
      }
    });
  }, [setPathColorMode]);

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
  };
}
