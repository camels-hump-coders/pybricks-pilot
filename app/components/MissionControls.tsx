import { useAtomValue } from "jotai";
import React, { useCallback, useState } from "react";
import { useMissionEditing } from "../hooks/useMissionEditing";
import { useMissionManager } from "../hooks/useMissionManager";
import { usePositionManager } from "../hooks/usePositionManager";
import { coordinateUtilsAtom } from "../store/atoms/canvasState";
import type {
  ActionPoint,
  EndPoint,
  MissionPointType,
  StartPoint,
} from "../types/missionPlanner";
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

  const [selectedMissionId, setSelectedMissionId] = useState<string>("");

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

  // Initialize default start/end points when editing starts
  React.useEffect(() => {
    if (
      isEditingMission &&
      editingMission &&
      editingMission.points.length === 0 &&
      positions.length > 0
    ) {
      // Find the bottom-right position to get properly resolved coordinates
      const bottomRightPosition = positions.find(
        (pos) => pos.id === "bottom-right"
      );

      if (!bottomRightPosition) {
        console.warn(
          "Bottom Right position not found, cannot create default start/end points. Available positions:",
          positions.map((p) => p.id)
        );
        return;
      }

      // Check if we already have start/end points to avoid duplicates
      const hasStart = editingMission.points.some((p) => p.type === "start");
      const hasEnd = editingMission.points.some((p) => p.type === "end");

      if (hasStart && hasEnd) {
        console.log(
          "Start and end points already exist, skipping default creation"
        );
        return;
      }

      const pointsToAdd: MissionPointType[] = [];

      // Add default start point if missing
      if (!hasStart) {
        const startPoint: StartPoint = {
          id: `start-${Date.now()}-1`,
          x: bottomRightPosition.x,
          y: bottomRightPosition.y,
          type: "start",
          heading: bottomRightPosition.heading,
          referenceType: "position",
          referenceId: "bottom-right",
        };
        pointsToAdd.push(startPoint);
      }

      // Add default end point if missing
      if (!hasEnd) {
        const endPoint: EndPoint = {
          id: `end-${Date.now()}-2`,
          x: bottomRightPosition.x,
          y: bottomRightPosition.y,
          type: "end",
          heading: bottomRightPosition.heading,
          referenceType: "position",
          referenceId: "bottom-right",
        };
        pointsToAdd.push(endPoint);
      }

      // Insert points sequentially
      if (pointsToAdd.length > 0) {
        console.log(
          "Creating default start/end points:",
          pointsToAdd.map((p) => p.type)
        );
        setTimeout(() => {
          let prevPointId: string | null = null;
          pointsToAdd.forEach((point, index) => {
            setTimeout(() => {
              insertPointAfter(prevPointId, point);
              prevPointId = point.id;
            }, index * 20); // Stagger insertions
          });
        }, 10);
      }
    }
  }, [isEditingMission, editingMission, positions, insertPointAfter]);

  // Handle adding waypoint after a specific point
  const handleAddWaypoint = useCallback(
    (afterPointId: string | null) => {
      console.log("handleAddWaypoint called:", {
        afterPointId,
        isEditingMission,
      });
      if (!isEditingMission) return;
      console.log("Setting waypoint placement mode");
      setPointPlacementMode("waypoint", afterPointId);
    },
    [isEditingMission, setPointPlacementMode]
  );

  // Handle adding action point after a specific point
  const handleAddAction = useCallback(
    (afterPointId: string | null) => {
      console.log("handleAddAction called:", {
        afterPointId,
        isEditingMission,
      });
      if (!isEditingMission) return;
      console.log("Setting action placement mode");
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
                <button
                  disabled={selectedMission?.points.length === 0}
                  className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ▶️ Run Mission
                </button>
              </div>
            )}
          </div>

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
                                  ({Math.round(point.x)}, {Math.round(point.y)})
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
