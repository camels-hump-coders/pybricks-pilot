import { useState } from "react";
import { useMissionManager } from "../hooks/useMissionManager";
import type { Mission } from "../types/missionPlanner";

/**
 * Dialog for managing missions (edit names/descriptions, delete missions)
 */
export function MissionManagementDialog() {
  const {
    isMissionManagementOpen,
    setIsMissionManagementOpen,
    missions,
    removeMission,
    updateMission,
    validateMissionName,
    canCreateMissions,
  } = useMissionManager();

  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editArcRadius, setEditArcRadius] = useState(100);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleClose = () => {
    setIsMissionManagementOpen(false);
    setEditingMission(null);
    setEditName("");
    setEditDescription("");
    setEditArcRadius(100);
    setIsDeleting(null);
    setError("");
  };

  const handleEditStart = (mission: Mission) => {
    setEditingMission(mission);
    setEditName(mission.name);
    setEditDescription(mission.description || "");
    setEditArcRadius(mission.defaultArcRadius);
    setError("");
  };

  const handleEditSave = async () => {
    if (!editingMission) return;

    const trimmedName = editName.trim();
    const nameError = validateMissionName(trimmedName, editingMission.id);
    if (nameError) {
      setError(nameError);
      return;
    }

    if (editArcRadius < 10 || editArcRadius > 1000) {
      setError("Arc radius must be between 10 and 1000mm");
      return;
    }

    const success = await updateMission(editingMission.id, {
      name: trimmedName,
      description: editDescription.trim() || undefined,
      defaultArcRadius: editArcRadius,
    });

    if (success) {
      setEditingMission(null);
      setEditName("");
      setEditDescription("");
      setEditArcRadius(100);
      setError("");
    } else {
      setError("Failed to update mission");
    }
  };

  const handleEditCancel = () => {
    setEditingMission(null);
    setEditName("");
    setEditDescription("");
    setEditArcRadius(100);
    setError("");
  };

  const handleDelete = async (missionId: string) => {
    if (!missionId) return;

    setIsDeleting(missionId);
    const success = await removeMission(missionId);

    if (!success) {
      setError("Failed to delete mission");
    }

    setIsDeleting(null);
  };

  if (!isMissionManagementOpen) return null;

  if (!canCreateMissions) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-4xl mb-4">📁</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Folder Not Mounted
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Mission management requires a mounted folder to save mission
              files. Please mount a folder to enable mission management.
            </p>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Manage Missions
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg
              role="img"
              aria-label="Close"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {missions.length === 0 ? (
            <div className="text-center p-8 text-gray-500 dark:text-gray-400">
              <div className="text-4xl mb-2">🎯</div>
              <p>No missions created yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {missions.map((mission) => (
                <div
                  key={mission.id}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700"
                >
                  {editingMission?.id === mission.id ? (
                    <div className="space-y-3">
                      {/* Edit Form */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Mission Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          placeholder="Mission name..."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description
                        </label>
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          placeholder="Mission description..."
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Default Arc Radius (mm)
                        </label>
                        <input
                          type="number"
                          min="10"
                          max="1000"
                          value={editArcRadius}
                          onChange={(e) =>
                            setEditArcRadius(
                              Math.max(10, parseInt(e.target.value, 10) || 10),
                            )
                          }
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>

                      {error && (
                        <div className="text-xs text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                          {error}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={handleEditSave}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Mission Info Display */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {mission.name}
                            </h4>
                            <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                              Mission
                            </span>
                          </div>

                          {mission.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {mission.description}
                            </p>
                          )}

                          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                            <div className="flex flex-wrap gap-4">
                              <span>Points: {mission.points.length}</span>
                              <span>Segments: {mission.segments.length}</span>
                              <span>
                                Arc Radius: {mission.defaultArcRadius}mm
                              </span>
                            </div>
                            <div>
                              Modified:{" "}
                              {new Date(mission.modified).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 ml-3">
                          <button
                            onClick={() => handleEditStart(mission)}
                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                            title="Edit mission"
                          >
                            <svg
                              role="img"
                              aria-label="Edit"
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(mission.id)}
                            disabled={isDeleting === mission.id}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                            title="Delete mission"
                          >
                            {isDeleting === mission.id ? (
                              <svg
                                role="img"
                                aria-label="Loading"
                                className="w-4 h-4 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  className="opacity-25"
                                ></circle>
                                <path
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  className="opacity-75"
                                ></path>
                              </svg>
                            ) : (
                              <svg
                                role="img"
                                aria-label="Delete"
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {error && !editingMission && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-4 mt-6 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
