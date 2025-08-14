import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useUploadProgress } from "../hooks/useUploadProgress";
import type { DebugEvent } from "../services/pybricksHub";
import { telemetryHistory } from "../services/telemetryHistory";
import { robotPositionAtom } from "../store/atoms/gameMat";
import { robotConfigAtom } from "../store/atoms/robotConfig";
import { HubMenuInterface } from "./HubMenuInterface";
import {
  calculatePreviewPosition,
  calculateTrajectoryProjection,
} from "./MovementPreview";

type ControlMode = "incremental" | "continuous";

interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top edge, positive = downward)
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
}

interface CompactRobotControllerProps {
  onDriveCommand?: (direction: number, speed: number) => Promise<void>;
  onTurnCommand?: (angle: number, speed: number) => Promise<void>;
  onStopCommand?: () => Promise<void>;
  onContinuousDriveCommand?: (speed: number, turnRate: number) => Promise<void>;
  onMotorCommand?: (
    motor: string,
    angle: number,
    speed: number
  ) => Promise<void>;
  onContinuousMotorCommand?: (motor: string, speed: number) => Promise<void>;
  onMotorStopCommand?: (motor: string) => Promise<void>;
  telemetryData?: any;
  isConnected: boolean;
  className?: string;
  // Robot position now comes from Jotai atoms
  robotType?: "real" | "virtual" | null;
  onPreviewUpdate?: (preview: {
    type: "drive" | "turn" | null;
    direction: "forward" | "backward" | "left" | "right" | null;
    positions: {
      primary: RobotPosition | null;
      secondary: RobotPosition | null;
    };
    trajectoryProjection?: {
      nextMoveEnd: RobotPosition | null;
      boardEndProjection: RobotPosition | null;
      trajectoryPath: RobotPosition[];
    };
    secondaryTrajectoryProjection?: {
      nextMoveEnd: RobotPosition | null;
      boardEndProjection: RobotPosition | null;
      trajectoryPath: RobotPosition[];
    };
  }) => void;
  onRunProgram?: () => Promise<void>;
  onStopProgram?: () => Promise<void>;
  onUploadAndRunFile?: (
    file: any,
    content: string,
    availableFiles: any[]
  ) => Promise<void>;
  isUploading?: boolean;
  debugEvents?: DebugEvent[];
  isCmdKeyPressed?: boolean;
}

export function CompactRobotController({
  onDriveCommand,
  onTurnCommand,
  onStopCommand,
  onContinuousDriveCommand,
  onMotorCommand,
  onContinuousMotorCommand,
  onMotorStopCommand,
  telemetryData,
  isConnected,
  className = "",
  robotType,
  onPreviewUpdate,
  onRunProgram,
  onStopProgram,
  onUploadAndRunFile,
  isUploading,
  debugEvents = [],
  isCmdKeyPressed,
}: CompactRobotControllerProps) {
  // Get current robot position from Jotai
  const currentRobotPosition = useAtomValue(robotPositionAtom);
  const robotConfig = useAtomValue(robotConfigAtom);

  // Upload progress from centralized hook
  const { uploadProgress } = useUploadProgress(debugEvents);

  // Get perpendicular preview from Jotai
  const { perpendicularPreview, setPerpendicularPreview } = useJotaiGameMat();
  const [controlMode, setControlMode] = useState<ControlMode>("incremental");
  const [driveSpeed, setDriveSpeed] = useState(50);
  const [distance, setDistance] = useState(100);
  const [angle, setAngle] = useState(45);
  const [motorSpeed, setMotorSpeed] = useState(100);
  const [motorAngle, setMotorAngle] = useState(90);
  const [activeMotor, setActiveMotor] = useState<string | null>(null);

  // Command execution tracking for dynamic stop buttons
  const [executingCommand, setExecutingCommand] = useState<{
    type: "drive" | "turn" | null;
    direction: "forward" | "backward" | "left" | "right" | null;
    originalParams?: { distance?: number; angle?: number; speed?: number };
  } | null>(null);

  // Preview state
  const [hoveredControl, setHoveredControl] = useState<{
    type: "drive" | "turn" | null;
    direction: "forward" | "backward" | "left" | "right" | null;
  } | null>(null);

  // Slider hover state for dual previews
  const [hoveredSlider, setHoveredSlider] = useState<
    "distance" | "angle" | null
  >(null);

  const commandChainRef = useRef<Promise<any>>(Promise.resolve());

  // Effect to handle preview state when executingCommand changes
  useEffect(() => {
    if (executingCommand && hoveredControl) {
      // Command started: show perpendicular preview for stop button
      updateStopButtonPreview(true);
    } else if (!executingCommand && hoveredControl) {
      // Command completed: update preview to show next step from current robot position
      // Use the last known hovered control state
      const { type, direction } = hoveredControl;
      if (onPreviewUpdate && currentRobotPosition && type && direction) {
        const previewPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          type,
          direction,
          robotConfig
        );

        const trajectoryProjection = calculateTrajectoryProjection(
          currentRobotPosition,
          distance,
          angle,
          type,
          direction,
          2356,
          1137,
          robotConfig
        );

        onPreviewUpdate({
          type,
          direction,
          positions: {
            primary: previewPosition,
            secondary: null,
          },
          trajectoryProjection,
        });

        setPerpendicularPreview({
          show: false,
          activeMovementType: null,
          hoveredButtonType: null,
          hoveredDirection: null,
          distance,
          angle,
        });
      }
    } else if (!executingCommand) {
      // Command completed and no hover: clear all previews
      updateStopButtonPreview(false);
    }
  }, [executingCommand]); // Only depend on executingCommand to avoid infinite loop

  // Check if we have both connection and telemetry data (meaning control code is loaded)
  const hasControlCode = isConnected && telemetryData?.motors;
  const isFullyConnected = hasControlCode;

  // Get non-drive motors from telemetry data
  const availableMotors = telemetryData?.motors
    ? Object.keys(telemetryData.motors).filter(
        (name) => !["left", "right"].includes(name)
      )
    : [];

  // Get shared program state
  const { programCount, allPrograms } = useJotaiFileSystem();

  return (
    <div
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm ${className}`}
    >
      <div className="p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Robot Controls
            </h3>
            {/* Connection Status Indicator */}
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isFullyConnected
                    ? "bg-green-500"
                    : isConnected
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isFullyConnected
                  ? "Ready"
                  : isConnected
                    ? "Waiting for robot program to run..."
                    : "Disconnected"}
                {telemetryHistory.isRecordingActive() && (
                  <span className="ml-1 text-red-500">● Rec</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Program Controls - Only show for real robots */}
      {robotType === "real" && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide">
            Quick Program Control
          </div>
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            <button
              onClick={() => {
                if (onRunProgram) {
                  onRunProgram().catch(console.error);
                }
              }}
              disabled={!onRunProgram}
              className="px-3 py-3 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              title="Run Program"
            >
              ▶️ Run
            </button>
            <button
              onClick={() => {
                if (onStopProgram) {
                  onStopProgram().catch(console.error);
                }
              }}
              disabled={!onStopProgram}
              className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              title="Stop Program"
            >
              ⏹️ Stop
            </button>
            {programCount > 0 && (
              <button
                onClick={async () => {
                  if (onUploadAndRunFile && allPrograms.length > 0) {
                    // Upload the first program as a placeholder for now
                    // TODO: Replace with multi-program upload when hub menu is implemented
                    const firstProgram = allPrograms[0];
                    try {
                      const content = await firstProgram.handle
                        .getFile()
                        .then((f) => f.text());
                      await onUploadAndRunFile(
                        firstProgram,
                        content,
                        allPrograms
                      );
                    } catch (error) {
                      console.error(
                        "Failed to upload and run programs:",
                        error
                      );
                    }
                  }
                }}
                disabled={!isConnected || programCount === 0}
                className="w-full px-3 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
                title={
                  programCount === 0
                    ? "Add programs using the # button in Program Manager"
                    : "Upload & Run Program Menu"
                }
              >
                🚀 Up&Run
              </button>
            )}
          </div>

          {/* Active Program Display */}
          {uploadProgress.isVisible && (
            <div className="mt-2 text-xs">
              <div className="mt-1">
                <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
                  <span>
                    {uploadProgress.total > 0 ? "Uploading..." : "Preparing..."}
                  </span>
                  {uploadProgress.total > 0 && (
                    <span>
                      {uploadProgress.current}/{uploadProgress.total}
                    </span>
                  )}
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1">
                  {uploadProgress.total > 0 ? (
                    <div
                      className="bg-blue-500 dark:bg-blue-400 h-1 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min((uploadProgress.current / uploadProgress.total) * 100, 100)}%`,
                      }}
                    ></div>
                  ) : (
                    <div className="bg-blue-500 dark:bg-blue-400 h-1 rounded-full animate-pulse w-full"></div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hub Menu Interface - Compact selector for hub menu programs */}
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Hub Menu Remote
            </div>
            <HubMenuInterface />
          </div>
        </div>
      )}

      <div
        className={`p-3 space-y-4 relative ${!isFullyConnected ? "opacity-50" : ""}`}
      >
        {/* Disabled Overlay */}
        {!isFullyConnected && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center z-10 rounded">
            <div className="text-center">
              <div className="text-2xl mb-2">{!isConnected ? "🔌" : "⏳"}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                {!isConnected ? "Connect Hub" : "Loading Control Code..."}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {!isConnected
                  ? "Pair and connect your robot hub"
                  : "Upload a program with robot controls"}
              </div>
            </div>
          </div>
        )}

        {/* Drive Controls */}
        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide">
            Drive Base
          </div>

          {/* Control Mode Toggle */}
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-md p-1">
              <button
                onClick={() => setControlMode("incremental")}
                className={`px-3 py-2 text-sm rounded transition-colors ${
                  controlMode === "incremental"
                    ? "bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                }`}
              >
                Step
              </button>
              <button
                onClick={() => setControlMode("continuous")}
                className={`px-3 py-2 text-sm rounded transition-colors ${
                  controlMode === "continuous"
                    ? "bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                }`}
              >
                Hold
              </button>
            </div>

            {/* CMD Key Status */}
            {isCmdKeyPressed && (
              <div className="px-2 py-1 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded border border-orange-300 dark:border-orange-700">
                ⌘ CMD Key Active
              </div>
            )}
          </div>

          {/* Compact sliders */}
          <div
            className={`grid gap-1 sm:gap-2 mb-2 sm:mb-3 text-xs ${
              controlMode === "incremental" ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <div>
              <label className="block text-gray-600 dark:text-gray-400 mb-1">
                Speed: {driveSpeed}%
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={driveSpeed}
                onChange={(e) => setDriveSpeed(Number(e.target.value))}
                className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            {controlMode === "incremental" && (
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">
                  Dist: {distance}mm
                </label>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={distance}
                  onChange={(e) => setDistance(Number(e.target.value))}
                  onInput={(e) => {
                    // Update preview in real-time as slider is dragged
                    if (
                      hoveredSlider === "distance" &&
                      onPreviewUpdate &&
                      currentRobotPosition
                    ) {
                      const currentValue = Number(
                        (e.target as HTMLInputElement).value
                      );
                      const forwardPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        currentValue,
                        angle,
                        "drive",
                        "forward",
                        robotConfig
                      );
                      const backwardPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        currentValue,
                        angle,
                        "drive",
                        "backward",
                        robotConfig
                      );

                      // Calculate trajectory projections for both directions
                      const forwardTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        currentValue,
                        angle,
                        "drive",
                        "forward",
                        2356,
                        1137,
                        robotConfig
                      );
                      const backwardTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        currentValue,
                        angle,
                        "drive",
                        "backward",
                        2356,
                        1137,
                        robotConfig
                      );

                      onPreviewUpdate({
                        type: "drive",
                        direction: "forward",
                        positions: {
                          primary: forwardPosition,
                          secondary: backwardPosition,
                        },
                        trajectoryProjection: forwardTrajectory,
                        // Add secondary trajectory for backward movement
                        secondaryTrajectoryProjection: backwardTrajectory,
                      });
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredSlider("distance");
                    // Show dual drive previews when hovering over distance slider
                    if (onPreviewUpdate && currentRobotPosition) {
                      const forwardPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        distance,
                        angle,
                        "drive",
                        "forward",
                        robotConfig
                      );
                      const backwardPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        distance,
                        angle,
                        "drive",
                        "backward",
                        robotConfig
                      );

                      // Calculate trajectory projections for both directions
                      const forwardTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        distance,
                        angle,
                        "drive",
                        "forward",
                        2356,
                        1137,
                        robotConfig
                      );
                      const backwardTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        distance,
                        angle,
                        "drive",
                        "backward",
                        2356,
                        1137,
                        robotConfig
                      );

                      onPreviewUpdate({
                        type: "drive",
                        direction: "forward",
                        positions: {
                          primary: forwardPosition,
                          secondary: backwardPosition,
                        },
                        trajectoryProjection: forwardTrajectory,
                        secondaryTrajectoryProjection: backwardTrajectory,
                      });

                      // Don't show perpendicular previews for slider hovers
                      setPerpendicularPreview({
                        show: false,
                        activeMovementType: null,
                        hoveredButtonType: null,
                        hoveredDirection: null,
                        distance,
                        angle,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredSlider(null);
                    // Clear preview when leaving slider
                    if (onPreviewUpdate) {
                      onPreviewUpdate({
                        type: null,
                        direction: null,
                        positions: { primary: null, secondary: null },
                        trajectoryProjection: undefined,
                        secondaryTrajectoryProjection: undefined,
                      });
                    }
                    // Clear perpendicular preview
                    setPerpendicularPreview({
                      show: false,
                      activeMovementType: null,
                      hoveredButtonType: null,
                      hoveredDirection: null,
                      distance,
                      angle,
                    });
                  }}
                  className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}
            {controlMode === "incremental" && (
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">
                  Angle: {angle}°
                </label>
                <input
                  type="range"
                  min="1"
                  max="180"
                  step="1"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  onInput={(e) => {
                    // Update preview in real-time as slider is dragged
                    if (
                      hoveredSlider === "angle" &&
                      onPreviewUpdate &&
                      currentRobotPosition
                    ) {
                      const currentValue = Number(
                        (e.target as HTMLInputElement).value
                      );
                      const leftPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        distance,
                        currentValue,
                        "turn",
                        "left",
                        robotConfig
                      );
                      const rightPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        distance,
                        currentValue,
                        "turn",
                        "right",
                        robotConfig
                      );

                      // Calculate trajectory projections for both directions
                      const leftTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        distance,
                        currentValue,
                        "turn",
                        "left",
                        2356,
                        1137,
                        robotConfig
                      );
                      const rightTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        distance,
                        currentValue,
                        "turn",
                        "right",
                        2356,
                        1137,
                        robotConfig
                      );

                      onPreviewUpdate({
                        type: "turn",
                        direction: "left",
                        positions: {
                          primary: leftPosition,
                          secondary: rightPosition,
                        },
                        trajectoryProjection: leftTrajectory,
                        secondaryTrajectoryProjection: rightTrajectory,
                      });
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredSlider("angle");
                    // Show dual turn previews when hovering over angle slider
                    if (onPreviewUpdate && currentRobotPosition) {
                      const leftPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        distance,
                        angle,
                        "turn",
                        "left",
                        robotConfig
                      );
                      const rightPosition = calculatePreviewPosition(
                        currentRobotPosition,
                        distance,
                        angle,
                        "turn",
                        "right",
                        robotConfig
                      );

                      // Calculate trajectory projections for both directions
                      const leftTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        distance,
                        angle,
                        "turn",
                        "left",
                        2356,
                        1137,
                        robotConfig
                      );
                      const rightTrajectory = calculateTrajectoryProjection(
                        currentRobotPosition,
                        distance,
                        angle,
                        "turn",
                        "right",
                        2356,
                        1137,
                        robotConfig
                      );

                      onPreviewUpdate({
                        type: "turn",
                        direction: "left",
                        positions: {
                          primary: leftPosition,
                          secondary: rightPosition,
                        },
                        trajectoryProjection: leftTrajectory,
                        secondaryTrajectoryProjection: rightTrajectory,
                      });

                      // Don't show perpendicular previews for slider hovers
                      setPerpendicularPreview({
                        show: false,
                        activeMovementType: null,
                        hoveredButtonType: null,
                        hoveredDirection: null,
                        distance,
                        angle,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredSlider(null);
                    // Clear preview when leaving slider
                    if (onPreviewUpdate) {
                      onPreviewUpdate({
                        type: null,
                        direction: null,
                        positions: { primary: null, secondary: null },
                        trajectoryProjection: undefined,
                        secondaryTrajectoryProjection: undefined,
                      });
                    }
                    // Clear perpendicular preview
                    setPerpendicularPreview({
                      show: false,
                      activeMovementType: null,
                      hoveredButtonType: null,
                      hoveredDirection: null,
                      distance,
                      angle,
                    });
                  }}
                  className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Movement buttons - compact grid */}
          <div className="grid grid-cols-3 gap-2 mb-2 sm:mb-3">
            <div></div>
            {controlMode === "incremental" ? (
              executingCommand?.type === "drive" &&
              executingCommand?.direction === "forward" ? (
                <button
                  onClick={stopExecutingCommand}
                  onMouseEnter={() => updateStopButtonPreview(true)}
                  onMouseLeave={() => updateStopButtonPreview(false)}
                  className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
                  title={`Stop forward movement (${executingCommand.originalParams?.distance}mm)`}
                >
                  ⏹
                </button>
              ) : (
                <button
                  onClick={() => sendStepDrive(distance, driveSpeed)}
                  onMouseEnter={() => updatePreview("drive", "forward")}
                  onMouseLeave={() => updatePreview(null, null)}
                  className="px-3 py-3 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors flex items-center justify-center"
                  title={`Forward ${distance}mm`}
                  disabled={!!executingCommand}
                >
                  ↑
                </button>
              )
            ) : (
              <button
                onMouseDown={() => startContinuousDrive("forward")}
                onMouseUp={stopContinuousDrive}
                onMouseEnter={() => updateContinuousButtonPreview(true)}
                onMouseLeave={() => {
                  updateContinuousButtonPreview(false);
                  stopContinuousDrive();
                }}
                onTouchStart={() => startContinuousDrive("forward")}
                onTouchEnd={stopContinuousDrive}
                className="px-3 py-3 bg-green-500 text-white text-sm rounded hover:bg-green-600 active:bg-green-700 transition-colors flex items-center justify-center"
                title="Forward (Hold)"
              >
                ↑
              </button>
            )}
            <div></div>

            {controlMode === "incremental" ? (
              executingCommand?.type === "turn" &&
              executingCommand?.direction === "left" ? (
                <button
                  onClick={stopExecutingCommand}
                  onMouseEnter={() => updateStopButtonPreview(true)}
                  onMouseLeave={() => updateStopButtonPreview(false)}
                  className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
                  title={`Stop left turn (${executingCommand.originalParams?.angle}°)`}
                >
                  ⏹
                </button>
              ) : (
                <button
                  onClick={() => sendStepTurn(-angle, driveSpeed)}
                  onMouseEnter={() => updatePreview("turn", "left")}
                  onMouseLeave={() => updatePreview(null, null)}
                  className="px-3 py-3 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 transition-colors flex items-center justify-center"
                  title={`Turn ${angle}° left`}
                  disabled={!!executingCommand}
                >
                  ↶
                </button>
              )
            ) : (
              <button
                onMouseDown={() => startContinuousTurn("left")}
                onMouseUp={stopContinuousTurn}
                onMouseEnter={() => updateContinuousButtonPreview(true)}
                onMouseLeave={() => {
                  updateContinuousButtonPreview(false);
                  stopContinuousTurn();
                }}
                onTouchStart={() => startContinuousTurn("left")}
                onTouchEnd={stopContinuousTurn}
                className="px-3 py-3 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 active:bg-blue-700 transition-colors flex items-center justify-center"
                title="Turn left (Hold)"
              >
                ↶
              </button>
            )}
            <button
              onClick={() => sendStop()}
              onMouseEnter={() => {
                // Show perpendicular previews when hovering over stop button
                setPerpendicularPreview({
                  show: true,
                  activeMovementType: null,
                  hoveredButtonType: "drive", // Show both drive and turn options
                  hoveredDirection: "forward",
                  distance,
                  angle,
                });
              }}
              onMouseLeave={() => {
                // Clear perpendicular previews when leaving stop button
                setPerpendicularPreview({
                  show: false,
                  activeMovementType: null,
                  hoveredButtonType: null,
                  hoveredDirection: null,
                  distance,
                  angle,
                });
              }}
              className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center"
              title="Stop"
            >
              ⏹
            </button>
            {controlMode === "incremental" ? (
              executingCommand?.type === "turn" &&
              executingCommand?.direction === "right" ? (
                <button
                  onClick={stopExecutingCommand}
                  onMouseEnter={() => updateStopButtonPreview(true)}
                  onMouseLeave={() => updateStopButtonPreview(false)}
                  className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
                  title={`Stop right turn (${executingCommand.originalParams?.angle}°)`}
                >
                  ⏹
                </button>
              ) : (
                <button
                  onClick={() => sendStepTurn(angle, driveSpeed)}
                  onMouseEnter={() => updatePreview("turn", "right")}
                  onMouseLeave={() => updatePreview(null, null)}
                  className="px-3 py-3 bg-cyan-600 text-white text-sm rounded hover:bg-cyan-700 transition-colors flex items-center justify-center"
                  title={`Turn ${angle}° right`}
                  disabled={!!executingCommand}
                >
                  ↷
                </button>
              )
            ) : (
              <button
                onMouseDown={() => startContinuousTurn("right")}
                onMouseUp={stopContinuousTurn}
                onMouseEnter={() => updateContinuousButtonPreview(true)}
                onMouseLeave={() => {
                  updateContinuousButtonPreview(false);
                  stopContinuousTurn();
                }}
                onTouchStart={() => startContinuousTurn("right")}
                onTouchEnd={stopContinuousTurn}
                className="px-3 py-3 bg-cyan-500 text-white text-sm rounded hover:bg-cyan-600 active:bg-cyan-700 transition-colors flex items-center justify-center"
                title="Turn right (Hold)"
              >
                ↷
              </button>
            )}

            <div></div>
            {controlMode === "incremental" ? (
              executingCommand?.type === "drive" &&
              executingCommand?.direction === "backward" ? (
                <button
                  onClick={stopExecutingCommand}
                  onMouseEnter={() => updateStopButtonPreview(true)}
                  onMouseLeave={() => updateStopButtonPreview(false)}
                  className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
                  title={`Stop backward movement (${executingCommand.originalParams?.distance}mm)`}
                >
                  ⏹
                </button>
              ) : (
                <button
                  onClick={() => sendStepDrive(-distance, driveSpeed)}
                  onMouseEnter={() => updatePreview("drive", "backward")}
                  onMouseLeave={() => updatePreview(null, null)}
                  className="px-3 py-3 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors flex items-center justify-center"
                  title={`Backward ${distance}mm`}
                  disabled={!!executingCommand}
                >
                  ↓
                </button>
              )
            ) : (
              <button
                onMouseDown={() => startContinuousDrive("backward")}
                onMouseUp={stopContinuousDrive}
                onMouseEnter={() => updateContinuousButtonPreview(true)}
                onMouseLeave={() => {
                  updateContinuousButtonPreview(false);
                  stopContinuousDrive();
                }}
                onTouchStart={() => startContinuousDrive("backward")}
                onTouchEnd={stopContinuousDrive}
                className="px-3 py-3 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 active:bg-orange-700 transition-colors flex items-center justify-center"
                title="Backward (Hold)"
              >
                ↓
              </button>
            )}
            <div></div>
          </div>
        </div>

        {/* Non-Drive Motor Controls */}
        {availableMotors.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide border-t border-gray-200 dark:border-gray-700 pt-2 sm:pt-3">
              Motors ({availableMotors.length})
            </div>

            {/* Motor settings */}
            <div
              className={`grid gap-1 sm:gap-2 mb-2 sm:mb-3 text-xs ${
                controlMode === "incremental" ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">
                  Speed: {motorSpeed}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={motorSpeed}
                  onChange={(e) => setMotorSpeed(Number(e.target.value))}
                  className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              {controlMode === "incremental" && (
                <div>
                  <label className="block text-gray-600 dark:text-gray-400 mb-1">
                    Angle: {motorAngle}°
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="360"
                    step="5"
                    value={motorAngle}
                    onChange={(e) => setMotorAngle(Number(e.target.value))}
                    className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Motor buttons */}
            <div className="grid grid-cols-2 gap-1">
              {availableMotors.slice(0, 6).map((motorName) => (
                <div key={motorName} className="space-y-1">
                  <div className="text-xs text-gray-600 dark:text-gray-400 text-center font-medium">
                    {motorName.toUpperCase()}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {controlMode === "incremental" ? (
                      <button
                        onClick={() =>
                          sendMotorCommand(motorName, -motorAngle, motorSpeed)
                        }
                        className="px-1 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 transition-colors"
                        title={`${motorName} CCW ${motorAngle}°`}
                      >
                        ↶
                      </button>
                    ) : (
                      <button
                        onMouseDown={() =>
                          startContinuousMotor(motorName, "ccw")
                        }
                        onMouseUp={stopContinuousMotor}
                        onMouseLeave={stopContinuousMotor}
                        onTouchStart={() =>
                          startContinuousMotor(motorName, "ccw")
                        }
                        onTouchEnd={stopContinuousMotor}
                        className="px-2 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 active:bg-purple-700 transition-colors"
                        title={`${motorName} CCW (Hold)`}
                      >
                        ↶
                      </button>
                    )}
                    {controlMode === "incremental" ? (
                      <button
                        onClick={() =>
                          sendMotorCommand(motorName, motorAngle, motorSpeed)
                        }
                        className="px-2 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 transition-colors"
                        title={`${motorName} CW ${motorAngle}°`}
                      >
                        ↷
                      </button>
                    ) : (
                      <button
                        onMouseDown={() =>
                          startContinuousMotor(motorName, "cw")
                        }
                        onMouseUp={stopContinuousMotor}
                        onMouseLeave={stopContinuousMotor}
                        onTouchStart={() =>
                          startContinuousMotor(motorName, "cw")
                        }
                        onTouchEnd={stopContinuousMotor}
                        className="px-2 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 active:bg-purple-700 transition-colors"
                        title={`${motorName} CW (Hold)`}
                      >
                        ↷
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Motor status display */}
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-1 text-xs">
                {availableMotors.slice(0, 4).map((motorName) => {
                  const motor = telemetryData?.motors?.[motorName];
                  return (
                    <div key={motorName} className="text-center">
                      <div className="text-gray-500 dark:text-gray-400">
                        {motorName}
                      </div>
                      <div className="font-mono text-gray-800 dark:text-gray-200">
                        {motor ? `${Math.round(motor.angle)}°` : "--"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Helper functions for continuous control
  function queueCommand(commandFn: () => Promise<any>) {
    // Prevent command execution if not fully connected
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return Promise.resolve();
    }

    const currentPromise = commandChainRef.current;
    const newPromise = currentPromise.finally(async () => {
      try {
        await commandFn();
      } catch (error) {
        // Silently handle command errors to prevent console spam
        console.warn("Robot command failed:", error);
      }
    });
    commandChainRef.current = newPromise;
    return newPromise;
  }

  function sendContinuousMovement(driveSpeed: number, turnRate: number) {
    return queueCommand(async () => {
      await onContinuousDriveCommand?.(driveSpeed, turnRate);
    });
  }

  // Helper functions for step-mode commands with execution tracking
  async function sendStepDrive(distance: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }

    const direction = distance > 0 ? "forward" : "backward";
    setExecutingCommand({
      type: "drive",
      direction,
      originalParams: { distance: Math.abs(distance), speed },
    });

    try {
      await onDriveCommand?.(distance, speed);
    } finally {
      setExecutingCommand(null);
    }
  }

  async function sendStepTurn(angle: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }

    const direction = angle > 0 ? "right" : "left";
    setExecutingCommand({
      type: "turn",
      direction,
      originalParams: { angle: Math.abs(angle), speed },
    });

    try {
      await onTurnCommand?.(angle, speed);
    } finally {
      setExecutingCommand(null);
    }
  }

  function stopExecutingCommand() {
    if (executingCommand) {
      sendStop();
      setExecutingCommand(null);
    }
  }

  function sendStop() {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }
    onStopCommand?.();
  }

  function sendMotorCommand(motorName: string, angle: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }
    onMotorCommand?.(motorName, angle, speed);
  }

  function sendStopCommand() {
    return queueCommand(() => onStopCommand?.() || Promise.resolve());
  }

  function startContinuousDrive(direction: "forward" | "backward") {
    if (controlMode !== "continuous") return;
    const speed = direction === "forward" ? driveSpeed * 10 : -driveSpeed * 10;
    sendContinuousMovement(speed, 0);
  }

  function stopContinuousDrive() {
    sendStopCommand();
  }

  function startContinuousTurn(direction: "left" | "right") {
    if (controlMode !== "continuous") return;
    const turnRate =
      direction === "left" ? -driveSpeed * 3.6 : driveSpeed * 3.6;
    sendContinuousMovement(0, turnRate);
  }

  function stopContinuousTurn() {
    sendStopCommand();
  }

  function startContinuousMotor(motorName: string, direction: "ccw" | "cw") {
    if (controlMode !== "continuous") return;
    setActiveMotor(motorName);
    const speed = direction === "ccw" ? -motorSpeed * 10 : motorSpeed * 10;
    queueCommand(async () => {
      await onContinuousMotorCommand?.(motorName, speed);
    });
  }

  function stopContinuousMotor() {
    if (activeMotor) {
      queueCommand(async () => {
        await onMotorStopCommand?.(activeMotor);
      });
      setActiveMotor(null);
    }
  }

  // Stop button preview function that behaves like the central stop button
  function updateStopButtonPreview(show: boolean) {
    if (show && executingCommand?.originalParams) {
      const originalDistance =
        executingCommand.originalParams.distance || distance;
      const originalAngle = executingCommand.originalParams.angle || angle;

      // Show perpendicular previews just like the central stop button
      setPerpendicularPreview({
        show: true,
        activeMovementType: null,
        hoveredButtonType: "drive", // Show both drive and turn options
        hoveredDirection: "forward",
        distance: originalDistance,
        angle: originalAngle,
      });
    } else {
      // Clear perpendicular previews when leaving stop button
      setPerpendicularPreview({
        show: false,
        activeMovementType: null,
        hoveredButtonType: null,
        hoveredDirection: null,
        distance,
        angle,
      });
    }
  }

  // Continuous mode preview function that shows perpendicular preview
  function updateContinuousButtonPreview(show: boolean) {
    if (show) {
      // Show perpendicular previews for continuous mode buttons
      setPerpendicularPreview({
        show: true,
        activeMovementType: null,
        hoveredButtonType: "drive", // Show both drive and turn options
        hoveredDirection: "forward",
        distance,
        angle,
      });
    } else {
      // Clear perpendicular previews when leaving button
      setPerpendicularPreview({
        show: false,
        activeMovementType: null,
        hoveredButtonType: null,
        hoveredDirection: null,
        distance,
        angle,
      });
    }
  }

  // Preview update function
  function updatePreview(
    type: "drive" | "turn" | null,
    direction: "forward" | "backward" | "left" | "right" | null
  ) {
    setHoveredControl({ type, direction });

    if (onPreviewUpdate && currentRobotPosition && type && direction) {
      const previewPosition = calculatePreviewPosition(
        currentRobotPosition,
        distance,
        angle,
        type,
        direction,
        robotConfig
      );

      // Calculate trajectory projection
      const trajectoryProjection = calculateTrajectoryProjection(
        currentRobotPosition,
        distance,
        angle,
        type,
        direction,
        2356,
        1137,
        robotConfig
      );

      // Button hovers only show single preview for that direction
      // Dual previews are only shown when hovering over sliders
      onPreviewUpdate({
        type,
        direction,
        positions: {
          primary: previewPosition,
          secondary: null,
        },
        trajectoryProjection,
      });

      // Don't show perpendicular previews for regular movement button hovers
      setPerpendicularPreview({
        show: false,
        activeMovementType: null,
        hoveredButtonType: null,
        hoveredDirection: null,
        distance,
        angle,
      });
    } else if (onPreviewUpdate) {
      onPreviewUpdate({
        type: null,
        direction: null,
        positions: { primary: null, secondary: null },
        trajectoryProjection: undefined,
        secondaryTrajectoryProjection: undefined,
      });

      // Clear perpendicular preview
      setPerpendicularPreview({
        show: false,
        activeMovementType: null,
        hoveredButtonType: null,
        hoveredDirection: null,
        distance,
        angle,
      });
    }
  }
}
