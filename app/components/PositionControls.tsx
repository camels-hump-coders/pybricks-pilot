import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { telemetryHistory } from "../services/telemetryHistory";
import { setRobotPositionAtom } from "../store/atoms/gameMat";
import type {
  EdgeBasedPosition,
  NamedPosition,
} from "../store/atoms/positionManagement";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import type { RobotPosition } from "../utils/robotPosition";
import { calculateRobotPositionFromEdges } from "../utils/robotPosition.js";
import { AddPositionDialog } from "./AddPositionDialog";
import { PositionManagementDialog } from "./PositionManagementDialog";
import { PositionSelector } from "./PositionSelector";

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

  const [_positionPreview, setPositionPreview] = useState<RobotPosition | null>(
    null,
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
        customMatConfig,
      );
      setPositionPreview(preview);
    } else {
      setPositionPreview(null);
    }
  }, [isSettingPosition, edgePositionSettings, robotConfig, customMatConfig]);

  // Helper function to apply a named position
  const applyNamedPosition = async (position: NamedPosition) => {
    try {
      if (onResetTelemetry) {
        await onResetTelemetry(false);
      }

      const robotPosition: RobotPosition = {
        x: position.x,
        y: position.y,
        heading: position.heading,
      };

      setRobotPosition(robotPosition);

      // Save as last position settings for reset functionality
      // Convert back to edge-based settings if it's a default position
      if (position.id === "bottom-left") {
        setLastPositionSettings({
          side: "left",
          fromBottom: 0,
          fromSide: 0,
          heading: 0,
        });
      } else if (position.id === "bottom-right") {
        setLastPositionSettings({
          side: "right",
          fromBottom: 0,
          fromSide: 0,
          heading: 0,
        });
      } else {
        // For custom positions, approximate edge-based settings
        setLastPositionSettings({
          side:
            position.x < (customMatConfig?.dimensions?.widthMm || 2362) / 2
              ? "left"
              : "right",
          fromBottom: position.y,
          fromSide:
            position.x < (customMatConfig?.dimensions?.widthMm || 2362) / 2
              ? position.x
              : (customMatConfig?.dimensions?.widthMm || 2362) - position.x,
          heading: position.heading,
        });
      }

      setIsSettingPosition(false);
    } catch (error) {
      console.error("Failed to apply named position:", error);
      // Continue with position setting even if telemetry path start fails
      const robotPosition: RobotPosition = {
        x: position.x,
        y: position.y,
        heading: position.heading,
      };
      setRobotPosition(robotPosition);
      setIsSettingPosition(false);
    }

    // Start a new telemetry path (preserving history)
    telemetryHistory.startNewPath();
  };

  // Helper function to get current edge-based settings for adding new positions
  const getCurrentEdgePositionForNewPosition = ():
    | EdgeBasedPosition
    | undefined => {
    if (isSettingPosition) {
      return {
        side: edgePositionSettings.side,
        fromBottom: edgePositionSettings.fromBottom,
        fromSide: edgePositionSettings.fromSide,
        heading: edgePositionSettings.heading,
      };
    }
    return undefined;
  };

  return (
    <div className="space-y-2">
      {/* Named Position Selector */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Select Position
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <PositionSelector
              onPositionSelected={(position) => {
                applyNamedPosition(position);
              }}
              showManagementButton={true}
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                if (onResetTelemetry) {
                  await onResetTelemetry(false);
                }

                // Reset to the last applied position, defaulting to bottom-left with 0 offset
                const resetPosition = calculateRobotPositionFromEdges(
                  lastPositionSettings.side,
                  lastPositionSettings.fromBottom,
                  lastPositionSettings.fromSide,
                  lastPositionSettings.heading,
                  robotConfig,
                  customMatConfig,
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
                  customMatConfig,
                );
                setRobotPosition(resetPosition);
                setIsSettingPosition(false);
              }

              // Fully reset telemetry history and start fresh
              telemetryHistory.onMatReset();
            }}
            className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Add Position Dialog */}
      <AddPositionDialog
        initialPosition={getCurrentEdgePositionForNewPosition()}
      />

      {/* Position Management Dialog */}
      <PositionManagementDialog />
    </div>
  );
}
