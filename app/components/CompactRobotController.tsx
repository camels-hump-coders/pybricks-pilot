import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
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
import { ManualControls } from "./ManualControls";
import { MotorControls } from "./MotorControls";
import {
  calculatePreviewPosition,
  calculateTrajectoryProjection,
} from "./MovementPreview";
import { PositionControls } from "./PositionControls";
import { ProgramControls } from "./ProgramControls";
import { MissionControls } from "./MissionControls";

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

  // Game mat state
  const {
    controlMode,
    setControlMode,
    currentSplinePath,
    splinePaths,
    enterSplinePathMode,
    exitSplinePathMode,
  } = useJotaiGameMat();

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

      {/* Main Controls */}
      <div className="p-3">
        <div className="space-y-3 sm:space-y-4">
          {/* Position Control Buttons */}
          <PositionControls onResetTelemetry={onResetTelemetry} />

          {/* Control Mode Toggle - Only visible for real robots when hub program is running */}
          <ControlModeToggle
            controlMode={controlMode}
            setControlMode={setControlMode}
            onEnterMissionMode={() => {/* TODO: Enter mission mode */}}
            onExitMissionMode={() => {/* TODO: Exit mission mode */}}
          />

          {controlMode === "program" && (
            <ProgramControls
              onStopProgram={onStopProgram}
              onUploadAndRunFile={onUploadAndRunFile}
            />
          )}

          {/* Manual Controls (Step/Hold modes) - Only visible for virtual robots or real robots when hub program is running */}
          {(controlMode === "incremental" || controlMode === "continuous") &&
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

          {/* Mission Controls - Only visible for virtual robots or real robots when hub program is running */}
          {controlMode === "mission" &&
            (robotType === "virtual" ||
              (robotType === "real" && isProgramRunning)) && (
              <MissionControls />
            )}
        </div>
      </div>
    </div>
  );
}
