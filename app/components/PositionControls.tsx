import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { telemetryHistory } from "../services/telemetryHistory";
import { setRobotPositionAtom } from "../store/atoms/gameMat";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import type { RobotPosition } from "../utils/robotPosition";
import { calculateRobotPositionFromEdges } from "../utils/robotPosition.js";
import { RadialHeadingSelector } from "./RadialHeadingSelector.js";

interface PositionControlsProps {
  onResetTelemetry?: (startNewPath?: boolean) => Promise<void>;
}

export function PositionControls({ onResetTelemetry }: PositionControlsProps) {
  const robotConfig = useAtomValue(robotConfigAtom);
  const { customMatConfig } = useJotaiGameMat();
  const setRobotPosition = useSetAtom(setRobotPositionAtom);

  const [isSettingPosition, setIsSettingPosition] = useState(false);
  const [edgePositionSettings, setEdgePositionSettings] = useState({
    side: "right" as "left" | "right",
    fromBottom: 100, // mm from bottom edge
    fromSide: 50, // mm from side edge
    heading: 0, // degrees (0 = north/forward, 90 = east/right, 180 = south/backward, 270 = west/left)
  });

  const [positionPreview, setPositionPreview] = useState<RobotPosition | null>(
    null
  );

  // Track last applied position for reset functionality
  const [lastPositionSettings, setLastPositionSettings] = useState({
    side: "right" as "left" | "right", // Default to bottom-right
    fromBottom: 0, // Default to 0 edge offset
    fromSide: 0,
    heading: 0, // Default to forward facing
  });

  // Update position preview when edge settings change
  useEffect(() => {
    if (isSettingPosition) {
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
  }, [isSettingPosition, edgePositionSettings, robotConfig, customMatConfig]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => setIsSettingPosition(!isSettingPosition)}
          className={`px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isSettingPosition
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {isSettingPosition ? "✕ Cancel" : "📍 Set Pos"}
        </button>
        <button
          onClick={async () => {
            try {
              if (onResetTelemetry) {
                await onResetTelemetry(false);
              }

              // Reset to the last applied position, defaulting to bottom-right with 0 offset
              const resetPosition = calculateRobotPositionFromEdges(
                lastPositionSettings.side,
                lastPositionSettings.fromBottom,
                lastPositionSettings.fromSide,
                lastPositionSettings.heading,
                robotConfig,
                customMatConfig
              );
              setRobotPosition(resetPosition);
              setIsSettingPosition(false);

              // Update UI to show the reset position settings
              setEdgePositionSettings({
                side: lastPositionSettings.side,
                fromBottom: lastPositionSettings.fromBottom,
                fromSide: lastPositionSettings.fromSide,
                heading: lastPositionSettings.heading,
              });
            } catch (error) {
              console.error("Failed to reset robot position:", error);
              // Continue with position reset even if telemetry path start fails
              const resetPosition = calculateRobotPositionFromEdges(
                lastPositionSettings.side,
                lastPositionSettings.fromBottom,
                lastPositionSettings.fromSide,
                lastPositionSettings.heading,
                robotConfig,
                customMatConfig
              );
              setRobotPosition(resetPosition);
              setIsSettingPosition(false);
            }

            // Start a new telemetry path (preserving history)
            telemetryHistory.startNewPath();
          }}
          className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🔄 Reset
        </button>
      </div>

      {/* Edge-based position settings - only visible when setting position */}
      {isSettingPosition && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-3">
          <div className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
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
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                From {edgePositionSettings.side === "left" ? "Left" : "Right"}{" "}
                (mm)
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

          {/* Apply Position Button */}
          <button
            onClick={async () => {
              if (positionPreview) {
                try {
                  if (onResetTelemetry) {
                    await onResetTelemetry(false);
                  }

                  setRobotPosition(positionPreview);
                  // Save the current settings as the last position for reset
                  setLastPositionSettings({
                    side: edgePositionSettings.side,
                    fromBottom: edgePositionSettings.fromBottom,
                    fromSide: edgePositionSettings.fromSide,
                    heading: edgePositionSettings.heading,
                  });
                } catch (error) {
                  console.error(
                    "Failed to start new telemetry path before setting position:",
                    error
                  );
                  // Continue with position setting even if telemetry path start fails
                  setRobotPosition(positionPreview);
                  setLastPositionSettings({
                    side: edgePositionSettings.side,
                    fromBottom: edgePositionSettings.fromBottom,
                    fromSide: edgePositionSettings.fromSide,
                    heading: edgePositionSettings.heading,
                  });
                }
                telemetryHistory.startNewPath();
              }
              setIsSettingPosition(false);
            }}
            className="w-full px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
          >
            ✓ Apply Position{" "}
            {positionPreview &&
              `(${Math.round(positionPreview.x)}mm, ${Math.round(positionPreview.y)}mm)`}
          </button>

          {/* Quick-Set Buttons - Instantly apply position with telemetry reset */}
          <div className="flex gap-1">
            <button
              onClick={async () => {
                // Quick-set to bottom left position
                try {
                  if (onResetTelemetry) {
                    await onResetTelemetry(false);
                  }

                  const bottomLeftPosition = calculateRobotPositionFromEdges(
                    "left",
                    0,
                    0,
                    0,
                    robotConfig,
                    customMatConfig
                  );
                  setRobotPosition(bottomLeftPosition);
                  // Save the position settings for reset button
                  setLastPositionSettings({
                    side: "left",
                    fromBottom: 0,
                    fromSide: 0,
                    heading: 0,
                  });

                  // Close the position setting interface
                  setIsSettingPosition(false);
                } catch (error) {
                  console.error("Failed to set bottom left position:", error);
                  // Continue with position setting even if telemetry path start fails
                  const bottomLeftPosition = calculateRobotPositionFromEdges(
                    "left",
                    0,
                    0,
                    0,
                    robotConfig,
                    customMatConfig
                  );
                  setRobotPosition(bottomLeftPosition);
                  setLastPositionSettings({
                    side: "left",
                    fromBottom: 0,
                    fromSide: 0,
                    heading: 0,
                  });
                  setIsSettingPosition(false);
                }

                // Start a new telemetry path (preserving history)
                telemetryHistory.startNewPath();
              }}
              className="flex-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
            >
              ↙️ Bottom Left
            </button>
            <button
              onClick={async () => {
                // Quick-set to bottom right position
                try {
                  if (onResetTelemetry) {
                    await onResetTelemetry(false);
                  }

                  const bottomRightPosition = calculateRobotPositionFromEdges(
                    "right",
                    0,
                    0,
                    0,
                    robotConfig,
                    customMatConfig
                  );
                  setRobotPosition(bottomRightPosition);
                  // Save the position settings for reset button
                  setLastPositionSettings({
                    side: "right",
                    fromBottom: 0,
                    fromSide: 0,
                    heading: 0,
                  });

                  // Close the position setting interface
                  setIsSettingPosition(false);
                } catch (error) {
                  console.error("Failed to set bottom right position:", error);
                  // Continue with position setting even if telemetry path start fails
                  const bottomRightPosition = calculateRobotPositionFromEdges(
                    "right",
                    0,
                    0,
                    0,
                    robotConfig,
                    customMatConfig
                  );
                  setRobotPosition(bottomRightPosition);
                  setLastPositionSettings({
                    side: "right",
                    fromBottom: 0,
                    fromSide: 0,
                    heading: 0,
                  });
                  setIsSettingPosition(false);
                }

                // Start a new telemetry path (preserving history)
                telemetryHistory.startNewPath();
              }}
              className="flex-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
            >
              ↘️ Bottom Right
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
