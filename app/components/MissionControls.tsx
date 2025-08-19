import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { useMissionEditing } from "../hooks/useMissionEditing";
import { useMissionExecution } from "../hooks/useMissionExecution";
import { useMissionManager } from "../hooks/useMissionManager";
import { usePositionManager } from "../hooks/usePositionManager";
import { coordinateUtilsAtom } from "../store/atoms/canvasState";
import { robotTypeAtom } from "../store/atoms/robotConnection";
import type {
  ActionPoint,
  EndPoint,
  StartPoint,
} from "../types/missionPlanner";
import { hasCoordinates } from "../utils/canvas/missionDrawing";
import { AddMissionDialog } from "./AddMissionDialog";
import { MissionManagementDialog } from "./MissionManagementDialog";

interface MissionControlsProps {
  className?: string;
}

/**
 * Mission Planner control panel for managing and executing missions
 */
export function MissionControls({ className = "" }: MissionControlsProps) {
  const {
    missions,
    selectedMission,
    editingMission,
    isEditingMission,
    isMissionManagementOpen,
    isAddMissionDialogOpen,
    canCreateMissions,
    setIsMissionManagementOpen,
    setIsAddMissionDialogOpen,
    selectMission,
    startEditingMission,
    saveEditingMission,
    cancelEditingMission,
    insertPointAfter,
    removePoint,
    updatePoint,
  } = useMissionManager();

  const {
    pointPlacementMode,
    actionPointHeading,
    setPointPlacementMode,
    setActionPointHeading,
  } = useMissionEditing();

  const { positions } = usePositionManager();
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const robotType = useAtomValue(robotTypeAtom);

  const [selectedMissionId, setSelectedMissionId] = useState<string>("");

  // Mission execution hook
  const {
    isGenerating,
    isExecuting,
    currentCommands,
    error: executionError,
    executeMission,
    stopExecution,
    clearState,
    canExecute,
  } = useMissionExecution();

  const handleMissionSelect = (missionId: string) => {
    setSelectedMissionId(missionId);
    selectMission(missionId);
  };

  const handleCreateMission = () => {
    setIsAddMissionDialogOpen(true);
  };

  const handleEditMission = useCallback(() => {
    if (selectedMissionId) {
      startEditingMission(selectedMissionId);
    }
  }, [selectedMissionId, startEditingMission]);

  // Handle adding waypoint after a specific point
  const handleAddWaypoint = useCallback(
    (afterPointId: string | null) => {
      if (!isEditingMission) return;
      setPointPlacementMode("waypoint", afterPointId);
    },
    [isEditingMission, setPointPlacementMode]
  );

  // Handle adding action point after a specific point
  const handleAddAction = useCallback(
    (afterPointId: string | null) => {
      if (!isEditingMission) return;
      setPointPlacementMode("action", afterPointId);
    },
    [isEditingMission, setPointPlacementMode]
  );

  // Cancel point placement
  const handleCancelPlacement = useCallback(() => {
    setPointPlacementMode(null);
  }, [setPointPlacementMode]);

  const handleManageMissions = () => {
    setIsMissionManagementOpen(true);
  };

  // Handle mission execution
  const handleRunMission = useCallback(async () => {
    if (!selectedMission) {
      return;
    }

    try {
      await executeMission(selectedMission, {
        defaultSpeed: 200, // mm/s
        defaultTurnSpeed: 90, // degrees/s
        arcApproximationSegments: 6,
        actionPauseDuration: 2000, // 2 seconds
      });
    } catch (error) {
      // Error handling is done in the hook
    }
  }, [selectedMission, executeMission]);

  // Handle stopping mission
  const handleStopMission = useCallback(async () => {
    await stopExecution();
  }, [stopExecution]);

  return (
    <div className={`space-y-4 p-4 ${className}`}>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
        <span className="mr-2">🎯</span>
        Mission Planner
      </div>

      {!canCreateMissions ? (
        <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-2">📁</div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            Folder Not Mounted
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Mission planner requires a mounted folder to save mission files
          </div>
        </div>
      ) : (
        <>
          {/* Mission Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Mission
            </label>
            <select
              value={selectedMissionId}
              onChange={(e) => handleMissionSelect(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a mission...</option>
              {missions.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {mission.name}
                  {mission.points.length > 0 &&
                    ` (${mission.points.length} points)`}
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCreateMission}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                ➕ New Mission
              </button>
              <button
                onClick={handleManageMissions}
                className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                📋 Manage
              </button>
            </div>

            {selectedMissionId && !isEditingMission && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleEditMission}
                  className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  ✏️ Edit Mission
                </button>
                {!isExecuting ? (
                  <button
                    onClick={handleRunMission}
                    disabled={
                      !selectedMission ||
                      selectedMission.points.length < 2 ||
                      isGenerating ||
                      robotType === null
                    }
                    className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      robotType === null
                        ? "Connect a robot to run missions"
                        : (selectedMission?.points?.length || 0) < 2
                          ? "Mission needs at least start and end points"
                          : ""
                    }
                  >
                    {isGenerating ? "⏳ Generating..." : "▶️ Run Mission"}
                  </button>
                ) : (
                  <button
                    onClick={handleStopMission}
                    className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors animate-pulse"
                  >
                    ⏹️ Stop Mission
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mission Execution Status */}
          {(isExecuting || isGenerating || executionError) && (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              {/* Error Display */}
              {executionError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                  <div className="text-sm text-red-700 dark:text-red-300">
                    {executionError}
                  </div>
                  <button
                    onClick={clearState}
                    className="mt-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Clear Error
                  </button>
                </div>
              )}

              {/* Mission Summary */}
              {currentCommands.length > 0 &&
                !isExecuting &&
                !executionError && (
                  <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                    <div className="text-xs text-green-700 dark:text-green-300">
                      <div className="flex justify-between items-center">
                        <span>
                          Mission ready: {currentCommands.length} commands
                        </span>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Mission Editing Interface */}
          {isEditingMission && editingMission && (
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  🎯 Editing: {editingMission.name}
                </h4>
                <div className="flex gap-1">
                  <button
                    onClick={saveEditingMission}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    💾
                  </button>
                  <button
                    onClick={cancelEditingMission}
                    className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Point placement mode indicator */}
              {pointPlacementMode && (
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-center">
                  <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                    Click on the mat to place {pointPlacementMode}
                    {pointPlacementMode === "action" &&
                      ` (heading: ${actionPointHeading}°)`}
                  </div>
                  {pointPlacementMode === "action" && (
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-xs text-blue-600 dark:text-blue-400">
                        Heading:
                      </label>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={actionPointHeading}
                        onChange={(e) =>
                          setActionPointHeading(parseInt(e.target.value))
                        }
                        className="flex-1 h-1 bg-blue-200 rounded-lg appearance-none cursor-pointer dark:bg-blue-700"
                      />
                      <span className="text-xs text-blue-600 dark:text-blue-400 w-12 text-right">
                        {actionPointHeading}°
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleCancelPlacement}
                    className="mt-2 px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Mission Points List */}
              <div>
                <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Mission Points ({editingMission.points.length})
                </h5>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {editingMission.points.length === 0 ? (
                    <div className="text-center py-4 text-xs text-gray-500 dark:text-gray-400">
                      Click "Edit Mission" to add default start/end points
                    </div>
                  ) : (
                    editingMission.points.map((point, index) => (
                      <div key={point.id} className="space-y-1">
                        {/* Point Display */}
                        <div className="space-y-2 p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-6">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-medium">
                                    {point.type === "start" && "🏁"}
                                    {point.type === "end" && "🏁"}
                                    {point.type === "waypoint" && "📍"}
                                    {point.type === "action" && "🎯"}
                                    {point.type.charAt(0).toUpperCase() +
                                      point.type.slice(1)}
                                  </span>
                                  {point.type === "action" && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {(point as ActionPoint).heading}°
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {hasCoordinates(point) ? (
                                    <>
                                      ({Math.round(point.x)},{" "}
                                      {Math.round(point.y)})
                                    </>
                                  ) : (
                                    <span className="italic">
                                      Referenced position
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Delete button (not for start/end points) */}
                              {point.type !== "start" &&
                                point.type !== "end" && (
                                  <button
                                    onClick={() => removePoint(point.id)}
                                    className="text-red-500 hover:text-red-700 p-1 text-xs"
                                    title="Delete point"
                                  >
                                    ✕
                                  </button>
                                )}
                            </div>
                          </div>

                          {/* Position Reference Selector for Start/End Points */}
                          {(point.type === "start" || point.type === "end") && (
                            <div className="flex items-center gap-2 text-xs">
                              <label className="text-gray-600 dark:text-gray-400">
                                Position:
                              </label>
                              <select
                                value={
                                  (point as StartPoint | EndPoint).referenceId
                                }
                                onChange={(e) => {
                                  const newReferenceId = e.target.value;
                                  const referencedPosition = positions.find(
                                    (pos) => pos.id === newReferenceId
                                  );
                                  if (referencedPosition) {
                                    // Update the existing point with new coordinates
                                    const pointUpdates = {
                                      x: referencedPosition.x,
                                      y: referencedPosition.y,
                                      heading: referencedPosition.heading,
                                      referenceId: newReferenceId,
                                      referenceType: "position" as const,
                                    };
                                    updatePoint(point.id, pointUpdates);
                                  }
                                }}
                                className="flex-1 px-2 py-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {positions.map((pos) => (
                                  <option key={pos.id} value={pos.id}>
                                    {pos.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Add After Buttons (not after end point) */}
                        {point.type !== "end" && (
                          <div className="flex gap-1 pl-8">
                            <button
                              onClick={() => handleAddWaypoint(point.id)}
                              disabled={pointPlacementMode !== null}
                              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              + Waypoint
                            </button>
                            <button
                              onClick={() => handleAddAction(point.id)}
                              disabled={pointPlacementMode !== null}
                              className="px-2 py-1 text-xs bg-violet-500 text-white rounded hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              + Action
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mission Status */}
          {missions.length === 0 && !isEditingMission && (
            <div className="text-center p-4 text-gray-500 dark:text-gray-400 text-sm">
              No missions created yet. Click "New Mission" to get started.
            </div>
          )}
        </>
      )}

      {/* Mission Dialogs */}
      <AddMissionDialog />
      <MissionManagementDialog />
    </div>
  );
}
