import { useState, useEffect } from "react";
import { usePositionManager } from "../hooks/usePositionManager";
import { useAtomValue } from "jotai";
import { coordinateUtilsAtom } from "../store/atoms/canvasState";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { customMatConfigAtom } from "../store/atoms/gameMat";
import { calculateRobotPositionFromEdges } from "../utils/robotPosition";
import { RadialHeadingSelector } from "./RadialHeadingSelector";
import type { EdgeBasedPosition } from "../store/atoms/positionManagement";
import type { RobotPosition } from "../utils/robotPosition";

interface AddPositionDialogProps {
  initialPosition?: EdgeBasedPosition;
}

/**
 * Dialog for adding new custom positions using edge-based positioning
 */
export function AddPositionDialog({ initialPosition }: AddPositionDialogProps) {
  const {
    isAddPositionDialogOpen,
    setIsAddPositionDialogOpen,
    addCustomPosition,
    canCreateCustomPositions,
  } = usePositionManager();

  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const robotConfig = useAtomValue(robotConfigAtom);
  const customMatConfig = useAtomValue(customMatConfigAtom);

  const [name, setName] = useState("");
  const [edgePositionSettings, setEdgePositionSettings] = useState<EdgeBasedPosition>({
    side: initialPosition?.side ?? "left",
    fromBottom: initialPosition?.fromBottom ?? 100,
    fromSide: initialPosition?.fromSide ?? 50,
    heading: initialPosition?.heading ?? 0,
  });

  const [positionPreview, setPositionPreview] = useState<RobotPosition | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isAddPositionDialogOpen) {
      setName("");
      setEdgePositionSettings({
        side: initialPosition?.side ?? "left",
        fromBottom: initialPosition?.fromBottom ?? 100,
        fromSide: initialPosition?.fromSide ?? 50,
        heading: initialPosition?.heading ?? 0,
      });
      setError("");
      setIsLoading(false);
    }
  }, [isAddPositionDialogOpen, initialPosition]);

  // Update position preview when edge settings change
  useEffect(() => {
    if (isAddPositionDialogOpen && robotConfig) {
      const preview = calculateRobotPositionFromEdges(
        edgePositionSettings.side,
        edgePositionSettings.fromBottom,
        edgePositionSettings.fromSide,
        edgePositionSettings.heading,
        robotConfig,
        customMatConfig
      );
      setPositionPreview(preview);
    } else {
      setPositionPreview(null);
    }
  }, [isAddPositionDialogOpen, edgePositionSettings, robotConfig, customMatConfig]);

  const handleClose = () => {
    setIsAddPositionDialogOpen(false);
  };

  const validateForm = (): string | null => {
    if (!name.trim()) {
      return "Position name is required";
    }

    if (name.trim().length < 2) {
      return "Position name must be at least 2 characters";
    }

    if (edgePositionSettings.fromBottom < 0 || edgePositionSettings.fromBottom > 1000) {
      return "Distance from bottom must be between 0 and 1000mm";
    }

    if (edgePositionSettings.fromSide < 0 || edgePositionSettings.fromSide > 2000) {
      return "Distance from side must be between 0 and 2000mm";
    }

    if (edgePositionSettings.heading < -180 || edgePositionSettings.heading > 180) {
      return "Heading must be between -180 and 180 degrees";
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!positionPreview) {
      setError("Unable to calculate position preview");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const newPosition = await addCustomPosition(
        name.trim(),
        positionPreview.x,
        positionPreview.y,
        positionPreview.heading
      );

      if (newPosition) {
        handleClose();
      } else {
        setError("Failed to create position");
      }
    } catch (err) {
      setError("Failed to create position");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAddPositionDialogOpen) return null;

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
              Custom positions require a mounted folder to save configuration files. 
              Please mount a folder to enable custom position management.
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
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Add New Position
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Position Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Position Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter position name..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              disabled={isLoading}
            />
          </div>

          {/* Edge-based Position Settings */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-3">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              🎯 Position Robot by Edges
            </div>

            {/* Side Selection */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  setEdgePositionSettings((prev) => ({
                    ...prev,
                    side: "left",
                  }))
                }
                disabled={isLoading}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  edgePositionSettings.side === "left"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                ← Left Side
              </button>
              <button
                onClick={() =>
                  setEdgePositionSettings((prev) => ({
                    ...prev,
                    side: "right",
                  }))
                }
                disabled={isLoading}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  edgePositionSettings.side === "right"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Right Side →
              </button>
            </div>

            {/* Distance Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From Bottom (mm)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={edgePositionSettings.fromBottom}
                  onChange={(e) =>
                    setEdgePositionSettings((prev) => ({
                      ...prev,
                      fromBottom: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  disabled={isLoading}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From {edgePositionSettings.side === "left" ? "Left" : "Right"} (mm)
                </label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  value={edgePositionSettings.fromSide}
                  onChange={(e) =>
                    setEdgePositionSettings((prev) => ({
                      ...prev,
                      fromSide: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  disabled={isLoading}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Heading Selector */}
            <div className="flex justify-center pt-2">
              <RadialHeadingSelector
                heading={edgePositionSettings.heading}
                onChange={(heading) =>
                  setEdgePositionSettings((prev) => ({
                    ...prev,
                    heading,
                  }))
                }
                size={100}
              />
            </div>

            {/* Position Preview */}
            {positionPreview && (
              <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded">
                Preview: ({Math.round(positionPreview.x)}mm, {Math.round(positionPreview.y)}mm, {Math.round(positionPreview.heading)}°)
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || !positionPreview}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                "Save Position"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}