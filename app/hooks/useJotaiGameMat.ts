import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import {
  robotPositionAtom,
  isSettingPositionAtom,
  mousePositionAtom,
  manualHeadingAdjustmentAtom,
  telemetryReferenceAtom,
  customMatConfigAtom,
  scoringStateAtom,
  totalScoreAtom,
  movementPreviewAtom,
  showPathAtom,
  pathColorModeAtom,
  pathOpacityAtom,
  maxPathPointsAtom,
  controlModeAtom,
  currentScoreAtom,
  setRobotPositionAtom,
  updateScoringAtom,
  resetScoringAtom,
  type RobotPosition,
  type MovementPreview,
  type ScoringState,
  type ObjectiveState,
} from "../store/atoms/gameMat";

export function useJotaiGameMat() {
  // Robot position state
  const [robotPosition, setRobotPositionDirect] = useAtom(robotPositionAtom);
  const [isSettingPosition, setIsSettingPosition] = useAtom(isSettingPositionAtom);
  const [mousePosition, setMousePosition] = useAtom(mousePositionAtom);
  const [manualHeadingAdjustment, setManualHeadingAdjustment] = useAtom(manualHeadingAdjustmentAtom);
  const [telemetryReference, setTelemetryReference] = useAtom(telemetryReferenceAtom);
  
  // Game mat configuration
  const [customMatConfig, setCustomMatConfig] = useAtom(customMatConfigAtom);
  const [scoringState, setScoringStateDirect] = useAtom(scoringStateAtom);
  const [totalScore, setTotalScore] = useAtom(totalScoreAtom);
  
  // Movement preview
  const [movementPreview, setMovementPreview] = useAtom(movementPreviewAtom);
  
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
  const setRobotPositionAction = useSetAtom(setRobotPositionAtom);
  const updateScoringAction = useSetAtom(updateScoringAtom);
  const resetScoringAction = useSetAtom(resetScoringAtom);
  
  // Wrapper functions for backward compatibility
  const setRobotPosition = useCallback((position: RobotPosition) => {
    setRobotPositionAction(position);
  }, [setRobotPositionAction]);
  
  const updateScoring = useCallback((
    missionId: string,
    objectiveId: string,
    state: ObjectiveState
  ) => {
    updateScoringAction({ missionId, objectiveId, state });
  }, [updateScoringAction]);
  
  const resetScoring = useCallback(() => {
    resetScoringAction();
  }, [resetScoringAction]);
  
  // Helper functions
  const updateRobotPositionFromTelemetry = useCallback((telemetryData: any) => {
    if (!telemetryData?.drivebase) return;
    
    const { distance, angle } = telemetryData.drivebase;
    
    // Initialize reference if needed
    if (!telemetryReference) {
      setTelemetryReference({
        distance,
        angle,
        position: robotPosition,
      });
      return;
    }
    
    // Calculate delta from reference
    const deltaDistance = distance - telemetryReference.distance;
    const deltaAngle = angle - telemetryReference.angle;
    
    // Update position based on delta
    const newHeading = (telemetryReference.position.heading + deltaAngle + manualHeadingAdjustment) % 360;
    const headingRad = (newHeading * Math.PI) / 180;
    
    const newX = telemetryReference.position.x + deltaDistance * Math.sin(headingRad);
    const newY = telemetryReference.position.y + deltaDistance * Math.cos(headingRad);
    
    setRobotPositionDirect({
      x: newX,
      y: newY,
      heading: newHeading,
    });
  }, [telemetryReference, robotPosition, manualHeadingAdjustment, setTelemetryReference, setRobotPositionDirect]);
  
  const togglePathVisualization = useCallback(() => {
    setShowPath((prev) => !prev);
  }, [setShowPath]);
  
  const cyclePathColorMode = useCallback(() => {
    setPathColorMode((prev) => {
      switch (prev) {
        case "time": return "speed";
        case "speed": return "heading";
        case "heading": return "time";
        default: return "time";
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
    
    // Movement preview
    movementPreview,
    setMovementPreview,
    
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