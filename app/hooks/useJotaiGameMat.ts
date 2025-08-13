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
import { robotConfigAtom } from "../store/atoms/robotConfig";

export function useJotaiGameMat() {
  // Robot position state
  const [robotPosition, setRobotPositionDirect] = useAtom(robotPositionAtom);
  const [isSettingPosition, setIsSettingPosition] = useAtom(isSettingPositionAtom);
  const [mousePosition, setMousePosition] = useAtom(mousePositionAtom);
  const [manualHeadingAdjustment, setManualHeadingAdjustment] = useAtom(manualHeadingAdjustmentAtom);
  const [telemetryReference, setTelemetryReference] = useAtom(telemetryReferenceAtom);
  const robotConfig = useAtomValue(robotConfigAtom);
  
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
    
    // Start with the reference position
    let newX = telemetryReference.position.x;
    let newY = telemetryReference.position.y;
    let newHeading = telemetryReference.position.heading;
    
    // Apply manual heading adjustment
    newHeading = (newHeading + manualHeadingAdjustment) % 360;
    
    // If there's a turn (deltaAngle), handle it with proper center of rotation kinematics
    if (Math.abs(deltaAngle) > 0.1 && robotConfig) {
      // Calculate center of rotation offset from robot center (in mm)
      const robotCenterX = robotConfig.dimensions.width / 2; // Center of robot width in studs
      const robotCenterY = robotConfig.dimensions.length / 2; // Center of robot length in studs
      const centerOfRotationX = robotConfig.centerOfRotation.distanceFromLeftEdge; // In studs from left edge
      const centerOfRotationY = robotConfig.centerOfRotation.distanceFromBack; // In studs from back edge
      
      const centerOffsetX = (centerOfRotationX - robotCenterX) * 8; // Convert studs to mm
      const centerOffsetY = (centerOfRotationY - robotCenterY) * 8; // Convert studs to mm
      
      // Calculate center of rotation position in world coordinates before turn
      // Note: World coordinates have Y+ pointing up, so we need to flip centerOffsetY
      const beforeHeadingRad = (newHeading * Math.PI) / 180;
      const corWorldX = newX + centerOffsetX * Math.cos(beforeHeadingRad) - (-centerOffsetY) * Math.sin(beforeHeadingRad);
      const corWorldY = newY + centerOffsetX * Math.sin(beforeHeadingRad) + (-centerOffsetY) * Math.cos(beforeHeadingRad);
      
      // Apply the turn
      newHeading = (newHeading + deltaAngle) % 360;
      const afterHeadingRad = (newHeading * Math.PI) / 180;
      
      // Calculate new robot center position after rotation around center of rotation
      newX = corWorldX - centerOffsetX * Math.cos(afterHeadingRad) + (-centerOffsetY) * Math.sin(afterHeadingRad);
      newY = corWorldY - centerOffsetX * Math.sin(afterHeadingRad) - (-centerOffsetY) * Math.cos(afterHeadingRad);
    } else {
      // Just apply the turn to heading if no robot config or small angle
      newHeading = (newHeading + deltaAngle) % 360;
    }
    
    // Apply forward/backward movement (this is always from the robot center)
    if (Math.abs(deltaDistance) > 0.1) {
      const headingRad = (newHeading * Math.PI) / 180;
      newX = newX + deltaDistance * Math.sin(headingRad);
      newY = newY + deltaDistance * Math.cos(headingRad);
    }
    
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