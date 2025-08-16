import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useUploadProgress } from "../hooks/useUploadProgress";
import { telemetryHistory } from "../services/telemetryHistory";
import {
  perpendicularPreviewAtom,
  robotPositionAtom,
  showGridOverlayAtom,
  showTrajectoryOverlayAtom,
} from "../store/atoms/gameMat";
import { isUploadingProgramAtom } from "../store/atoms/hubConnection";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { type RobotPosition } from "../utils/robotPosition";
import { ControlModeToggle } from "./ControlModeToggle";
import { HubMenuInterface } from "./HubMenuInterface";
import { ManualControls } from "./ManualControls";
import { MotorControls } from "./MotorControls";
import {
  calculatePreviewPosition,
  calculateTrajectoryProjection,
} from "./MovementPreview";
import { PositionControls } from "./PositionControls";
import { SplineControls } from "./SplineControls";

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
  onExecuteCommandSequence?: (commands: any[]) => Promise<void>;
  telemetryData?: any;
  isConnected: boolean;
  className?: string;
  // Robot position now comes from Jotai atoms
  robotType?: "real" | "virtual" | null;
  onResetTelemetry?: (startNewPath?: boolean) => Promise<void>;
  // Program control props
  onStopProgram?: () => Promise<void>;
  onUploadAndRunFile?: (
    file: any,
    content: string,
    allPrograms: any[]
  ) => Promise<void>;
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
  onPerpendicularPreviewUpdate?: (preview: {
    show: boolean;
    hoveredButtonType?: "drive" | "turn";
    direction?: "forward" | "backward" | "left" | "right";
    positions?: RobotPosition[];
    trajectories?: RobotPosition[][];
  }) => void;
}

interface ExecutingCommand {
  type: "drive" | "turn";
  direction: "forward" | "backward" | "left" | "right";
  originalParams: { distance?: number; angle?: number; speed: number };
}

export function CompactRobotController({
  onDriveCommand,
  onTurnCommand,
  onStopCommand,
  onContinuousDriveCommand,
  onMotorCommand,
  onContinuousMotorCommand,
  onMotorStopCommand,
  onExecuteCommandSequence,
  telemetryData,
  isConnected,
  className = "",
  robotType = "real",
  onResetTelemetry,
  onStopProgram,
  onUploadAndRunFile,
  onPreviewUpdate,
}: CompactRobotControllerProps) {
  // State
  const [distance, setDistance] = useState(100);
  const [angle, setAngle] = useState(45);
  const [driveSpeed, setDriveSpeed] = useState(50);
  const [motorSpeed, setMotorSpeed] = useState(50);
  const [motorAngle, setMotorAngle] = useState(45);
  const [executingCommand, setExecutingCommand] =
    useState<ExecutingCommand | null>(null);
  const [activeMotor, setActiveMotor] = useState<string | null>(null);
  const [hubMenuOpen, setHubMenuOpen] = useState(false);

  // Refs
  const commandChainRef = useRef<Promise<void>>(Promise.resolve());

  // Atoms
  const robotConfig = useAtomValue(robotConfigAtom);
  const currentRobotPosition = useAtomValue(robotPositionAtom);
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const isUploadingProgram = useAtomValue(isUploadingProgramAtom);
  const [showGridOverlay, setShowGridOverlay] = useAtom(showGridOverlayAtom);
  const [showTrajectoryOverlay, setShowTrajectoryOverlay] = useAtom(
    showTrajectoryOverlayAtom
  );
  const [perpendicularPreview, setPerpendicularPreview] = useAtom(
    perpendicularPreviewAtom
  );

  const [positionPreview, setPositionPreview] = useState<RobotPosition | null>(
    null
  );

  // Game mat state
  const {
    controlMode,
    setControlMode,
    currentSplinePath,
    splinePaths,
    enterSplinePathMode,
    exitSplinePathMode,
    customMatConfig,
  } = useJotaiGameMat();

  // Upload progress (for UI display)
  const { uploadProgress } = useUploadProgress();

  // Effect to initialize trajectory overlay when enabled
  useEffect(() => {
    if (showTrajectoryOverlay) {
      // Just enable the trajectory overlay - let the distance/angle effect handle the ghosts
    }
  }, [showTrajectoryOverlay]); // Only depend on the toggle, not position or config

  // Effect to update trajectory overlay ghosts when distance/angle changes
  useEffect(() => {
    // Only apply trajectory overlay when in Step mode (incremental) AND the toggle is enabled
    if (
      showTrajectoryOverlay &&
      controlMode === "incremental" &&
      currentRobotPosition &&
      robotConfig
    ) {
      // Only update if there are no hover ghosts currently
      setPerpendicularPreview((prev) => {
        const hasHoverGhosts = prev.ghosts.some((g: any) => g.isHover);
        if (hasHoverGhosts) {
          // Don't update trajectory ghosts if there are hover ghosts
          return prev;
        }

        // Recalculate trajectory overlay ghosts with new distance/angle
        const ghosts = [];

        // Forward drive position (green)
        const forwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig
        );
        if (forwardPosition) {
          ghosts.push({
            position: forwardPosition,
            type: "drive" as const,
            direction: "forward" as const,
            color: "#10b981", // green-500
            label: `↑ ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        // Backward drive position (orange)
        const backwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "drive",
          "backward",
          robotConfig
        );
        if (backwardPosition) {
          ghosts.push({
            position: backwardPosition,
            type: "drive" as const,
            direction: "backward" as const,
            color: "#f97316", // orange-500
            label: `↓ ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        // Left turn position (purple) - show turn + distance for trajectory overlay
        const leftTurnPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "turn",
          "left",
          robotConfig
        );
        const leftTurnThenForward = calculatePreviewPosition(
          leftTurnPosition || currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig
        );
        if (leftTurnThenForward) {
          ghosts.push({
            position: leftTurnThenForward,
            type: "turn" as const,
            direction: "left" as const,
            color: "#a855f7", // purple-500
            label: `↶ ${angle}° + ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        // Right turn position (cyan) - show turn + distance for trajectory overlay
        const rightTurnPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "turn",
          "right",
          robotConfig
        );
        const rightTurnThenForward = calculatePreviewPosition(
          rightTurnPosition || currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig
        );
        if (rightTurnThenForward) {
          ghosts.push({
            position: rightTurnThenForward,
            type: "turn" as const,
            direction: "right" as const,
            color: "#06b6d4", // cyan-600
            label: `↷ ${angle}° + ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        return {
          show: true,
          ghosts: ghosts,
          distance: distance,
          angle: angle,
        };
      });
    }
  }, [
    distance,
    angle,
    showTrajectoryOverlay,
    controlMode,
    currentRobotPosition,
    robotConfig,
  ]);

  // Separate effect to clear trajectory overlay when disabled OR when not in Step mode
  useEffect(() => {
    if (!showTrajectoryOverlay || controlMode !== "incremental") {
      // Only clear if the current ghosts are trajectory overlay ghosts
      setPerpendicularPreview((prev) => {
        // If all current ghosts are trajectory overlay ghosts, clear them
        const hasOnlyTrajectoryGhosts = prev.ghosts.every(
          (ghost) => (ghost as any).isTrajectoryOverlay
        );
        if (hasOnlyTrajectoryGhosts && prev.ghosts.length > 0) {
          return {
            show: false,
            ghosts: [],
            distance: distance,
            angle: angle,
          };
        }
        return prev; // Don't change if there are hover ghosts
      });
    }
  }, [showTrajectoryOverlay, controlMode, distance, angle]);

  // Get shared program state
  const { programCount, allPrograms } = useJotaiFileSystem();

  // For virtual robots, manual controls should work when connected regardless of program status
  // For real robots, manual controls work when connected and hub menu program is running
  const isFullyConnected =
    isConnected &&
    !isUploadingProgram &&
    (robotType === "virtual" || isProgramRunning);

  // Available motors (exclude drivebase motors)
  const availableMotors = telemetryData?.motors
    ? Object.keys(telemetryData.motors).filter(
        (name) => !["left", "right"].includes(name)
      )
    : [];

  // Helper functions for continuous control
  function queueCommand(commandFn: () => Promise<any>) {
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

  function updateDualPreview(
    type: "drive" | "turn",
    overrideDistance?: number,
    overrideAngle?: number
  ) {
    if (onPreviewUpdate && currentRobotPosition) {
      const currentDistance = overrideDistance ?? distance;
      const currentAngle = overrideAngle ?? angle;

      if (type === "drive") {
        // Show both forward and backward previews for drive
        const forwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "forward",
          robotConfig
        );
        const backwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "backward",
          robotConfig
        );

        // Calculate trajectory projections for both directions
        const forwardTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "forward",
          2356,
          1137,
          robotConfig
        );
        const backwardTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
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
      } else if (type === "turn") {
        // Show both left and right turn previews
        const leftPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "left",
          robotConfig
        );
        const rightPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "right",
          robotConfig
        );

        // Calculate trajectory projections for both directions
        const leftTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "left",
          2356,
          1137,
          robotConfig
        );
        const rightTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
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
    }
  }

  function updatePreview(
    type: "drive" | "turn" | null,
    direction: "forward" | "backward" | "left" | "right" | null
  ) {
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

      // Also update perpendicular preview for hover effect - always show to draw attention
      let ghostPosition = previewPosition;

      // For turn previews, just show the turn (no forward movement)

      const hoverGhost = {
        position: ghostPosition,
        type: type as "drive" | "turn",
        direction: direction as "forward" | "backward" | "left" | "right",
        color:
          type === "drive"
            ? direction === "forward"
              ? "#10b981"
              : "#f97316" // green for forward, orange for backward
            : direction === "left"
              ? "#a855f7"
              : "#06b6d4", // purple for left, cyan for right
        label:
          type === "drive"
            ? `${direction === "forward" ? "↑" : "↓"} ${distance}mm`
            : `${direction === "left" ? "↶" : "↷"} ${angle}°`,
        isHover: true, // Mark this as a hover ghost for bolder rendering
      };

      // If trajectory overlay is on AND in Step mode, add the hover ghost to existing ghosts
      // Otherwise, just show the hover ghost
      if (showTrajectoryOverlay && controlMode === "incremental") {
        // Keep existing ghosts and add hover ghost with higher opacity
        const newPreview = {
          show: true,
          ghosts: [
            ...perpendicularPreview.ghosts.filter(
              (g: any) =>
                // Remove any previous hover ghost (identified by isHover flag)
                // Don't remove trajectory overlay ghosts, we want both turn ghosts visible
                !g.isHover
            ),
            hoverGhost,
          ],
          distance: distance,
          angle: angle,
        };
        setPerpendicularPreview(newPreview);
      } else {
        const newPreview = {
          show: true,
          ghosts: [hoverGhost],
          distance: distance,
          angle: angle,
        };
        setPerpendicularPreview(newPreview);
      }
    } else if (onPreviewUpdate) {
      onPreviewUpdate({
        type: null,
        direction: null,
        positions: { primary: null, secondary: null },
        trajectoryProjection: undefined,
        secondaryTrajectoryProjection: undefined,
      });

      // Clear hover ghost on mouse leave
      if (showTrajectoryOverlay) {
        // Keep the trajectory overlay ghosts, just remove hover ghosts
        setPerpendicularPreview((prev) => ({
          ...prev,
          ghosts: prev.ghosts.filter((g: any) => !g.isHover),
        }));
      } else {
        // Clear all ghosts when not hovering and trajectory overlay is off
        setPerpendicularPreview({
          show: false,
          ghosts: [],
          distance: distance,
          angle: angle,
        });
      }
    }
  }

  // Spline path execution handler
  const handleExecutePath = async (path: any) => {
    console.log("Execute spline path", path);
    console.log(
      "onExecuteCommandSequence available:",
      !!onExecuteCommandSequence
    );
    console.log("isFullyConnected:", isFullyConnected);
    console.log("robotType:", robotType);

    const { executeSplinePath } = await import("../utils/splinePathCommands");

    const executeCommands = async (commands: any[]) => {
      console.log("executeCommands called with:", commands);
      console.log("Commands details:", JSON.stringify(commands, null, 2));

      if (onExecuteCommandSequence) {
        // Use command sequence for proper stop behavior handling
        console.log("Executing command sequence:", commands);
        try {
          await onExecuteCommandSequence(commands);
        } catch (error) {
          console.error("Command sequence failed:", error);
          // Fallback to individual commands on GATT error
          console.log("Falling back to individual commands due to error");
          for (const cmd of commands) {
            try {
              if (cmd.action === "turn" && onTurnCommand) {
                console.log("Executing individual turn:", cmd);
                await onTurnCommand(cmd.angle, cmd.speed);
              } else if (cmd.action === "drive" && onDriveCommand) {
                console.log("Executing individual drive:", cmd);
                await onDriveCommand(cmd.distance, cmd.speed);
              }
              await new Promise((resolve) => setTimeout(resolve, 500)); // Longer delay for individual commands
            } catch (individualError) {
              console.error("Individual command failed:", cmd, individualError);
            }
          }
        }
      } else {
        // Fallback to individual commands
        console.log("Fallback to individual commands:", commands);
        for (const cmd of commands) {
          if (cmd.action === "turn" && onTurnCommand) {
            await onTurnCommand(cmd.angle, cmd.speed);
          } else if (cmd.action === "drive" && onDriveCommand) {
            await onDriveCommand(cmd.distance, cmd.speed);
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    };

    try {
      await executeSplinePath(path, executeCommands);
      console.log("executeSplinePath completed");
    } catch (error) {
      console.error("executeSplinePath failed:", error);
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm ${className}`}
    >
      {/* Header */}
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
            {/* Stop button - only when program is running */}
            {isProgramRunning && (
              <button
                onClick={() => {
                  if (onStopProgram) {
                    onStopProgram().catch(console.error);
                  }
                }}
                disabled={!onStopProgram}
                className="px-2 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                title="Stop Program"
              >
                ⏹️ Stop
              </button>
            )}

            {/* Up&Run button - always visible when there are programs */}
            {programCount > 0 && (
              <button
                onClick={async () => {
                  if (onUploadAndRunFile && allPrograms.length > 0) {
                    // If program is running, this will stop it and re-upload
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
                className="w-full px-2 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
                title={
                  programCount === 0
                    ? "Add programs using the # button in Program Manager"
                    : isProgramRunning
                      ? "Stop current program and upload & run new program"
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
          {/* Hub Menu Interface - Only show when menu program is running */}
          {isProgramRunning && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Hub Menu Remote
              </div>
              <HubMenuInterface />
            </div>
          )}
        </div>
      )}

      {/* Main Controls */}
      <div className="p-3">
        <div className="space-y-3 sm:space-y-4">
          {/* Position Control Buttons */}
          <PositionControls onResetTelemetry={onResetTelemetry} />

          {/* Control Mode Toggle - Only visible for real robots when hub program is running */}
          {(robotType === "virtual" ||
            (robotType === "real" && isProgramRunning)) && (
            <ControlModeToggle
              controlMode={controlMode}
              setControlMode={setControlMode}
              onEnterSplineMode={() => enterSplinePathMode()}
              onExitSplineMode={exitSplinePathMode}
            />
          )}

          {/* Manual Controls (Step/Hold modes) - Only visible for virtual robots or real robots when hub program is running */}
          {controlMode !== "spline" &&
            (robotType === "virtual" ||
              (robotType === "real" && isProgramRunning)) && (
              <div>
                <ManualControls
                  controlMode={controlMode}
                  distance={distance}
                  setDistance={setDistance}
                  angle={angle}
                  setAngle={setAngle}
                  driveSpeed={driveSpeed}
                  setDriveSpeed={setDriveSpeed}
                  executingCommand={executingCommand}
                  isFullyConnected={isFullyConnected}
                  onUpdatePreview={updatePreview}
                  onUpdateDualPreview={updateDualPreview}
                  onSendStepDrive={sendStepDrive}
                  onSendStepTurn={sendStepTurn}
                  onStartContinuousDrive={startContinuousDrive}
                  onStopContinuousDrive={stopContinuousDrive}
                  onStartContinuousTurn={startContinuousTurn}
                  onStopContinuousTurn={stopContinuousTurn}
                  onSendStop={sendStop}
                  onStopExecutingCommand={stopExecutingCommand}
                  showGridOverlay={showGridOverlay}
                  setShowGridOverlay={setShowGridOverlay}
                  showTrajectoryOverlay={showTrajectoryOverlay}
                  setShowTrajectoryOverlay={setShowTrajectoryOverlay}
                />

                {/* Motor Controls */}
                <MotorControls
                  controlMode={controlMode}
                  availableMotors={availableMotors}
                  motorSpeed={motorSpeed}
                  setMotorSpeed={setMotorSpeed}
                  motorAngle={motorAngle}
                  setMotorAngle={setMotorAngle}
                  telemetryData={telemetryData}
                  onSendMotorCommand={sendMotorCommand}
                  onStartContinuousMotor={startContinuousMotor}
                  onStopContinuousMotor={stopContinuousMotor}
                />
              </div>
            )}

          {/* Spline Controls - Only visible for virtual robots or real robots when hub program is running */}
          {controlMode === "spline" &&
            (robotType === "virtual" ||
              (robotType === "real" && isProgramRunning)) && (
              <SplineControls
                currentSplinePath={currentSplinePath}
                splinePaths={splinePaths}
                onExecutePath={handleExecutePath}
                onExitSplineMode={exitSplinePathMode}
              />
            )}
        </div>
      </div>

      {/* Hub Menu Interface */}
      {hubMenuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Hub Control</h3>
              <button
                onClick={() => setHubMenuOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <HubMenuInterface />
          </div>
        </div>
      )}
    </div>
  );
}
