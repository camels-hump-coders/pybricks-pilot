import { useState } from "react";
import { usePositionManager } from "../hooks/usePositionManager";
import type { NamedPosition } from "../store/atoms/positionManagement";

/**
 * Dialog for managing custom positions (edit/delete) with protection for default positions
 */
export function PositionManagementDialog() {
  const {
    isPositionManagementOpen,
    setIsPositionManagementOpen,
    positions,
    customPositions,
    defaultPositions,
    removeCustomPosition,
    updateCustomPosition,
    canCreateCustomPositions,
  } = usePositionManager();

  const [editingPosition, setEditingPosition] = useState<NamedPosition | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleClose = () => {
    setIsPositionManagementOpen(false);
    setEditingPosition(null);
    setEditName("");
    setIsDeleting(null);
    setError("");
  };

  const handleEditStart = (position: NamedPosition) => {
    if (position.isDefault) return; // Should not happen due to UI protection
    setEditingPosition(position);
    setEditName(position.name);
    setError("");
  };

  const handleEditSave = async () => {
    if (!editingPosition) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError("Position name is required");
      return;
    }

    if (trimmedName.length < 2) {
      setError("Position name must be at least 2 characters");
      return;
    }

    // Check if name already exists (excluding current position)
    const nameExists = positions.some(
      (pos) =>
        pos.id !== editingPosition.id &&
        pos.name.toLowerCase() === trimmedName.toLowerCase(),
    );

    if (nameExists) {
      setError("A position with this name already exists");
      return;
    }

    const success = await updateCustomPosition(editingPosition.id, {
      name: trimmedName,
    });
    if (success) {
      setEditingPosition(null);
      setEditName("");
      setError("");
    } else {
      setError("Failed to update position");
    }
  };

  const handleEditCancel = () => {
    setEditingPosition(null);
    setEditName("");
    setError("");
  };

  const handleDelete = async (positionId: string) => {
    if (!positionId) return;

    setIsDeleting(positionId);
    const success = await removeCustomPosition(positionId);

    if (!success) {
      setError("Failed to delete position");
    }

    setIsDeleting(null);
  };

  if (!isPositionManagementOpen) return null;

  if (!canCreateCustomPositions) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-4xl mb-4">📁</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Folder Not Mounted
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Position management requires a mounted folder to save
              configuration files. Please mount a folder to enable position
              management.
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
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Manage Positions
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
          {/* Default Positions Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Default Positions
            </h4>
            <div className="space-y-2">
              {defaultPositions.map((position) => (
                <div
                  key={position.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {position.name}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                        Default
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      X: {Math.round(position.x)}mm, Y: {Math.round(position.y)}
                      mm, θ: {Math.round(position.heading)}°
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Protected
                    </span>
                    <div className="w-6 h-6 flex items-center justify-center">
                      <svg
                        role="img"
                        aria-label="Protected"
                        className="w-4 h-4 text-gray-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Positions Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Custom Positions ({customPositions.length})
            </h4>
            {customPositions.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 rounded-lg">
                No custom positions created yet.
              </div>
            ) : (
              <div className="space-y-2">
                {customPositions.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex-1">
                      {editingPosition?.id === position.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            placeholder="Position name..."
                          />
                          {error && (
                            <div className="text-xs text-red-600 dark:text-red-400">
                              {error}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleEditSave}
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {position.name}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                              Custom
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            X: {Math.round(position.x)}mm, Y:{" "}
                            {Math.round(position.y)}mm, θ:{" "}
                            {Math.round(position.heading)}°
                          </div>
                        </div>
                      )}
                    </div>

                    {editingPosition?.id !== position.id && (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => handleEditStart(position)}
                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                          title="Edit position name"
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
                          onClick={() => handleDelete(position.id)}
                          disabled={isDeleting === position.id}
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                          title="Delete position"
                        >
                          {isDeleting === position.id ? (
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
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && !editingPosition && (
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
  );
}
