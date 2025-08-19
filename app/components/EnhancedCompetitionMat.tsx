import { useAtom, useAtomValue } from "jotai";
import { useCallback, useRef } from "react";
import { useCanvasDrawing } from "../hooks/useCanvasDrawing";
import { useCanvasEventHandlers } from "../hooks/useCanvasEventHandlers";
import { useCanvasSize } from "../hooks/useCanvasSize";
import { useCmdKey } from "../hooks/useCmdKey";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useMatImageLoader } from "../hooks/useMatImageLoader";
import { useMissionEditing } from "../hooks/useMissionEditing";
import { usePositionResetEvents } from "../hooks/usePositionResetEvents";
import { useSplineKeyboardEvents } from "../hooks/useSplineKeyboardEvents";
import { useTelemetryRecording } from "../hooks/useTelemetryRecording";
import { useTelemetryReferenceInit } from "../hooks/useTelemetryReferenceInit";
import { useTelemetryUpdates } from "../hooks/useTelemetryUpdates";
import {
  coordinateUtilsAtom,
  hoveredObjectAtom,
  hoveredPointAtom,
  missionBoundsAtom,
} from "../store/atoms/canvasState";
import { controlModeAtom, customMatConfigAtom } from "../store/atoms/gameMat";
import {
  hoveredTelemetryPointAtom,
  isPseudoCodeExpandedAtom,
  isTelemetryPlaybackExpandedAtom,
  justFinishedDraggingAtom,
  popoverObjectAtom,
  tooltipPositionAtom,
} from "../store/atoms/matUIState";
import { telemetryDataAtom } from "../store/atoms/robotConnection";
import {
  allTelemetryPointsAtom,
  selectedPathPointsAtom,
} from "../store/atoms/telemetryPoints";
import {
  getMaxPointsForMission,
  getTotalPointsForMission,
} from "../utils/scoringUtils";
import { MissionsList } from "./EnhancedCompetitionMat/MissionsList";
import { TelemetryTooltip } from "./EnhancedCompetitionMat/TelemetryTooltip";
import { PseudoCodePanel } from "./PseudoCodePanel";
import { ScoringModal } from "./ScoringModal";
import { TelemetryPlayback } from "./TelemetryPlayback";

// RobotPosition interface now imported from utils/canvas

interface EnhancedCompetitionMatProps {
  isConnected: boolean;
  showScoring?: boolean;
}

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

  // Mission editing functionality
  const missionEditing = useMissionEditing();
  const { isEditingMission, pointPlacementMode, handlePointPlacement } =
    missionEditing;

  // Get robot configuration
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
  const [hoveredObject, _setHoveredObject] = useAtom(hoveredObjectAtom);
  const [_missionBounds, setMissionBounds] = useAtom(missionBoundsAtom);

  // Note: missionsExpanded is now handled inside MissionsList component

  // Path visualization state from atom
  const selectedPathPoints = useAtomValue(selectedPathPointsAtom);
  const [hoveredPoint, setHoveredPoint] = useAtom(hoveredTelemetryPointAtom);
  const [hoveredPointIndex, setHoveredPointIndex] = useAtom(hoveredPointAtom);
  const hoveredPointIndexValue = hoveredPointIndex ?? -1; // Convert null to -1 for backwards compatibility
  const [tooltipPosition, setTooltipPosition] = useAtom(tooltipPositionAtom);

  // Accordion panel states from atoms
  const [isPseudoCodeExpanded, setIsPseudoCodeExpanded] = useAtom(
    isPseudoCodeExpandedAtom,
  );
  const [isTelemetryPlaybackExpanded, setIsTelemetryPlaybackExpanded] = useAtom(
    isTelemetryPlaybackExpandedAtom,
  );

  // Spline path dragging state from atoms
  const justFinishedDragging = useAtomValue(justFinishedDraggingAtom);

  // Fresh telemetry data from atom (not stale closure data)
  const currentTelemetryData = useAtomValue(telemetryDataAtom);

  // Use a ref to always have access to the latest telemetry data
  const telemetryDataRef = useRef(currentTelemetryData);
  telemetryDataRef.current = currentTelemetryData;

  // Use custom hooks for lifecycle management
  useTelemetryRecording(isConnected, currentPosition);
  usePositionResetEvents();

  // Canvas size and drawing management
  const { updateCanvasSize } = useCanvasSize(canvasRef);

  // Mat image loading hook
  const { matImageRef } = useMatImageLoader(
    customMatConfig || null,
    updateCanvasSize,
  );

  // Canvas drawing hook
  useCanvasDrawing({
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
    pointPlacementMode: missionEditing.pointPlacementMode,
    actionPointHeading: missionEditing.actionPointHeading,
  });

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

  // Initialize telemetry reference
  useTelemetryReferenceInit(
    currentPosition,
    telemetryReference,
    isConnected,
    setTelemetryReference,
  );

  // Canvas event handlers hook
  const {
    handleCanvasMouseDown,
    handleCanvasClick: originalHandleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
    toggleObjective,
  } = useCanvasEventHandlers({
    canvasRef,
    showScoring,
    scoringState,
    setScoringState,
    coordinateUtils,
    currentSplinePath,
    isSplinePathMode,
    justFinishedDragging,
    addSplinePointAtMousePosition,
    setSelectedSplinePointId,
    updateSplinePoint,
    updateControlPoint,
    updateTangencyHandle,
    setHoveredSplinePointId,
    setHoveredCurvatureHandlePointId,
    setHoveredPoint,
    setHoveredPointIndex,
    setTooltipPosition,
    setMousePosition,
  });

  // Spline keyboard events
  useSplineKeyboardEvents({
    isSplinePathMode,
    selectedSplinePointId,
    currentSplinePath,
    deleteSplinePoint,
    setSelectedSplinePointId,
    completeSplinePath,
    exitSplinePathMode,
  });

  // Custom canvas click handler that includes mission editing
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      console.log("Canvas clicked - mission editing check:", {
        controlMode,
        isEditingMission,
        pointPlacementMode,
      });

      // If we're in mission editing mode and have a point placement mode active
      if (controlMode === "mission" && isEditingMission && pointPlacementMode) {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        console.log("Canvas coordinates:", { canvasX, canvasY });

        // Convert canvas coordinates to mat coordinates
        const { canvasToMm } = coordinateUtils;
        const matPos = canvasToMm(canvasX, canvasY);

        console.log("Mat coordinates:", matPos);

        // Handle mission point placement
        const newPoint = handlePointPlacement(matPos.x, matPos.y);
        console.log("Point placement result:", newPoint);
        if (newPoint) {
          // Point was placed, we're done
          return;
        }
      }

      // Fall back to original canvas click handler
      originalHandleCanvasClick(event);
    },
    [
      controlMode,
      isEditingMission,
      pointPlacementMode,
      coordinateUtils,
      handlePointPlacement,
      originalHandleCanvasClick,
    ],
  );

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
                {coordinateUtils.matDimensions.tableHeight}mm
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
                      0,
                    )}
                    /
                    {customMatConfig.missions.reduce(
                      (sum, obj) => sum + getMaxPointsForMission(obj),
                      0,
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
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
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
            (m) => m.id === popoverObject,
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
