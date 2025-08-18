import { useCallback } from "react";
import { useMissionManager } from "../hooks/useMissionManager";
import { useMissionEditing } from "../hooks/useMissionEditing";
import { usePositionManager } from "../hooks/usePositionManager";
import type { ActionPoint } from "../types/missionPlanner";

interface MissionEditingOverlayProps {
  onCancelEditing?: () => void;
  className?: string;
}

/**
 * Overlay component for mission editing tools that appears directly on the mat
 */
export function MissionEditingOverlay({
  onCancelEditing,
  className = "",
}: MissionEditingOverlayProps) {
  const {
    editingMission,
    saveEditingMission,
    cancelEditingMission,
    removePoint,
    selectedPointId,
    selectPoint,
  } = useMissionManager();

  const {
    isEditingMission,
    pointPlacementMode,
    actionPointHeading,
    selectedStartEndRef,
    setPointPlacementMode,
    setActionPointHeading,
    setSelectedStartEndRef,
  } = useMissionEditing();

  const { positions } = usePositionManager();

  // Handle save and cancel
  const handleSave = useCallback(async () => {
    await saveEditingMission();
    setPointPlacementMode(null);
  }, [saveEditingMission, setPointPlacementMode]);

  const handleCancel = useCallback(() => {
    cancelEditingMission();
    setPointPlacementMode(null);
    onCancelEditing?.();
  }, [cancelEditingMission, setPointPlacementMode, onCancelEditing]);

  if (!isEditingMission || !editingMission) return null;

  return (
    <div className={`mission-editing-overlay ${className}`}>
      {/* Top toolbar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-600">
        <div className="flex items-center space-x-3">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            🎯 Editing: {editingMission.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {editingMission.points.length} points
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            💾 Save
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            ❌ Cancel
          </button>
        </div>
      </div>

      {/* Left side panel - Point placement tools */}
      <div className="absolute top-20 left-4 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-600 w-64">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Add Points
        </h4>

        {/* Point type buttons */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setPointPlacementMode("waypoint")}
            className={`px-3 py-2 text-xs rounded transition-colors ${
              pointPlacementMode === "waypoint"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
            }`}
          >
            📍 Waypoint
          </button>
          <button
            onClick={() => setPointPlacementMode("action")}
            className={`px-3 py-2 text-xs rounded transition-colors ${
              pointPlacementMode === "action"
                ? "bg-violet-500 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
            }`}
          >
            🎯 Action
          </button>
          <button
            onClick={() => setPointPlacementMode("start")}
            className={`px-3 py-2 text-xs rounded transition-colors ${
              pointPlacementMode === "start"
                ? "bg-green-500 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
            }`}
          >
            🏁 Start
          </button>
          <button
            onClick={() => setPointPlacementMode("end")}
            className={`px-3 py-2 text-xs rounded transition-colors ${
              pointPlacementMode === "end"
                ? "bg-red-500 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
            }`}
          >
            🏁 End
          </button>
        </div>

        {/* Action Point Configuration */}
        {pointPlacementMode === "action" && (
          <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg mb-4">
            <h5 className="text-xs font-medium text-violet-900 dark:text-violet-100 mb-2">
              Action Point Settings
            </h5>
            <div>
              <label className="block text-xs text-violet-700 dark:text-violet-300 mb-1">
                Heading: {actionPointHeading}°
              </label>
              <input
                type="range"
                min="0"
                max="359"
                value={actionPointHeading}
                onChange={(e) => setActionPointHeading(parseInt(e.target.value))}
                className="w-full h-2 bg-violet-200 rounded-lg appearance-none cursor-pointer dark:bg-violet-700"
              />
              <div className="flex justify-between text-xs text-violet-600 dark:text-violet-400 mt-1">
                <span>0° (North)</span>
                <span>180° (South)</span>
              </div>
            </div>
          </div>
        )}

        {/* Start/End Point Reference Selection */}
        {(pointPlacementMode === "start" || pointPlacementMode === "end") && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
            <h5 className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
              Reference Position
            </h5>
            <select
              value={selectedStartEndRef}
              onChange={(e) => setSelectedStartEndRef(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700"
            >
              <option value="">Select reference...</option>
              {positions.map((pos) => (
                <option key={pos.id} value={pos.id}>
                  📍 {pos.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Instruction text */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {pointPlacementMode ? (
            <p>Click on the mat to place a {pointPlacementMode} point.</p>
          ) : (
            <p>Select a point type above, then click on the mat to place it.</p>
          )}
        </div>
      </div>

      {/* Right side panel - Points list */}
      <div className="absolute top-20 right-4 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-600 w-64">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Mission Points ({editingMission.points.length})
        </h4>

        <div className="space-y-1 max-h-80 overflow-y-auto">
          {editingMission.points.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
              No points added yet
            </p>
          ) : (
            editingMission.points.map((point, index) => (
              <div
                key={point.id}
                className={`flex items-center justify-between p-2 text-xs rounded cursor-pointer transition-colors ${
                  selectedPointId === point.id
                    ? "bg-amber-100 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700"
                    : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
                onClick={() => selectPoint(point.id)}
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="truncate">
                    <div className="font-medium">
                      {point.type.charAt(0).toUpperCase() + point.type.slice(1)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      ({Math.round(point.x)}, {Math.round(point.y)})
                      {point.type === "action" && `, ${(point as ActionPoint).heading}°`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePoint(point.id);
                  }}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Delete point"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}