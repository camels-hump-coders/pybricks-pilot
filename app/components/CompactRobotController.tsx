import { useAtomValue } from "jotai";
import { useRef, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useUploadProgress } from "../hooks/useUploadProgress";
import { telemetryHistory } from "../services/telemetryHistory";
import {
  robotPositionAtom,
} from "../store/atoms/gameMat";
import { isUploadingProgramAtom } from "../store/atoms/hubConnection";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { ControlModeToggle } from "./ControlModeToggle";
import { HubMenuInterface } from "./HubMenuInterface";
import { ManualControls } from "./ManualControls";
import { MotorControls } from "./MotorControls";
import {
  calculatePreviewPosition,
  calculateTrajectoryProjection,
} from "./MovementPreview";
import { ProgramControls } from "./ProgramControls";
import { SplineControls } from "./SplineControls";

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
  telemetryData,
  isConnected,
  className = "",
  robotType = "real",
  onPreviewUpdate,
}: CompactRobotControllerProps) {
  // State
  const [distance, setDistance] = useState(100);
  const [angle, setAngle] = useState(45);
  const [driveSpeed, setDriveSpeed] = useState(30);
  const [motorSpeed, setMotorSpeed] = useState(50);
  const [motorAngle, setMotorAngle] = useState(90);
  const [executingCommand, setExecutingCommand] = useState<ExecutingCommand | null>(null);
  const [activeMotor, setActiveMotor] = useState<string | null>(null);
  const [hubMenuOpen, setHubMenuOpen] = useState(false);

  // Refs
  const commandChainRef = useRef<Promise<void>>(Promise.resolve());

  // Atoms
  const robotConfig = useAtomValue(robotConfigAtom);
  const currentRobotPosition = useAtomValue(robotPositionAtom);
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const isUploadingProgram = useAtomValue(isUploadingProgramAtom);

  // Game mat state
  const {
    controlMode,
    setControlMode,
    currentSplinePath,
    splinePaths,
    enterSplinePathMode,
    exitSplinePathMode,
  } = useJotaiGameMat();

  // Upload progress (for UI display)
  const { uploadProgress } = useUploadProgress();
  // For virtual robots, manual controls should work when connected regardless of program status
  // For real robots, manual controls work when connected but no user program is running
  const isFullyConnected = isConnected && !isUploadingProgram && 
    (robotType === "virtual" || !isProgramRunning);

  // Available motors (exclude drivebase motors)
  const availableMotors = telemetryData?.motors
    ? Object.keys(telemetryData.motors).filter(
        (name) => !["left", "right"].includes(name)
      )
    : [];

  // Get shared program state
  const { programCount } = useJotaiFileSystem();

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
    } else if (onPreviewUpdate) {
      onPreviewUpdate({
        type: null,
        direction: null,
        positions: { primary: null, secondary: null },
        trajectoryProjection: undefined,
        secondaryTrajectoryProjection: undefined,
      });
    }
  }

  // Spline path execution handler
  const handleExecutePath = async (path: any) => {
    const { executeSplinePath } = await import("../utils/splinePathCommands");
    
    const executeCommands = async (commands: any[]) => {
      for (const cmd of commands) {
        if (cmd.action === "turn" && onTurnCommand) {
          await onTurnCommand(cmd.angle, cmd.speed);
        } else if (cmd.action === "drive" && onDriveCommand) {
          await onDriveCommand(cmd.distance, cmd.speed);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    
    await executeSplinePath(path, executeCommands);
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

      {/* Program Controls */}
      <ProgramControls
        robotType={robotType}
        isFullyConnected={isFullyConnected}
        onControlHub={() => setHubMenuOpen(true)}
        onRunLatestProgram={() => {
          // Implementation for running latest program
        }}
        onStopProgram={() => {
          // Implementation for stopping program
        }}
        programCount={programCount}
      />

      {/* Main Controls */}
      <div className="p-3">
        <div className="space-y-3 sm:space-y-4">
          {/* Control Mode Toggle */}
          <ControlModeToggle
            controlMode={controlMode}
            setControlMode={setControlMode}
            onEnterSplineMode={() => enterSplinePathMode()}
            onExitSplineMode={exitSplinePathMode}
          />

          {/* Manual Controls (Step/Hold modes) */}
          {controlMode !== "spline" && (
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
                onSendStepDrive={sendStepDrive}
                onSendStepTurn={sendStepTurn}
                onStartContinuousDrive={startContinuousDrive}
                onStopContinuousDrive={stopContinuousDrive}
                onStartContinuousTurn={startContinuousTurn}
                onStopContinuousTurn={stopContinuousTurn}
                onSendStop={sendStop}
                onStopExecutingCommand={stopExecutingCommand}
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

          {/* Spline Controls */}
          {controlMode === "spline" && (
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