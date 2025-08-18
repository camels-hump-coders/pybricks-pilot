import { useState } from "react";
import { useMissionManager } from "../hooks/useMissionManager";
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
    isMissionManagementOpen,
    isAddMissionDialogOpen,
    isMissionEditorOpen,
    canCreateMissions,
    setIsMissionManagementOpen,
    setIsAddMissionDialogOpen,
    selectMission,
    startEditingMission,
  } = useMissionManager();

  const [selectedMissionId, setSelectedMissionId] = useState<string>("");

  const handleMissionSelect = (missionId: string) => {
    setSelectedMissionId(missionId);
    selectMission(missionId);
  };

  const handleCreateMission = () => {
    setIsAddMissionDialogOpen(true);
  };

  const handleEditMission = () => {
    if (selectedMissionId) {
      startEditingMission(selectedMissionId);
      // Mission editing will now happen directly on the mat
    }
  };

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
                  {mission.points.length > 0 && ` (${mission.points.length} points)`}
                </option>
              ))}
            </select>
          </div>

          {/* Mission Info */}
          {selectedMission && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                {selectedMission.name}
              </div>
              {selectedMission.description && (
                <div className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  {selectedMission.description}
                </div>
              )}
              <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <div>Points: {selectedMission.points.length}</div>
                <div>Segments: {selectedMission.segments.length}</div>
                <div>Arc Radius: {selectedMission.defaultArcRadius}mm</div>
                <div className="text-blue-500 dark:text-blue-300 mt-2">
                  Modified: {new Date(selectedMission.modified).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}

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

            {selectedMissionId && (
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

          {/* Mission Status */}
          {missions.length === 0 && (
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