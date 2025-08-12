import { useRef, useState } from "react";
import { telemetryHistory } from "../services/telemetryHistory";

type ControlMode = "incremental" | "continuous";

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
}: CompactRobotControllerProps) {
  const [controlMode, setControlMode] = useState<ControlMode>("incremental");
  const [driveSpeed, setDriveSpeed] = useState(50);
  const [distance, setDistance] = useState(100);
  const [angle, setAngle] = useState(90);
  const [motorSpeed, setMotorSpeed] = useState(100);
  const [motorAngle, setMotorAngle] = useState(90);
  const [activeMotor, setActiveMotor] = useState<string | null>(null);

  const commandChainRef = useRef<Promise<any>>(Promise.resolve());

  // Check if we have both connection and telemetry data (meaning control code is loaded)
  const hasControlCode = isConnected && telemetryData?.motors;
  const isFullyConnected = hasControlCode;

  // Get non-drive motors from telemetry data
  const availableMotors = telemetryData?.motors
    ? Object.keys(telemetryData.motors).filter(
        (name) => !["left", "right"].includes(name)
      )
    : [];

  return (
    <div
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm ${className}`}
    >
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
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
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Drive Base
          </div>

          {/* Control Mode Toggle */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-md p-1">
              <button
                onClick={() => setControlMode("incremental")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  controlMode === "incremental"
                    ? "bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                }`}
              >
                Step
              </button>
              <button
                onClick={() => setControlMode("continuous")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  controlMode === "continuous"
                    ? "bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                }`}
              >
                Hold
              </button>
            </div>
          </div>

          {/* Compact sliders */}
          <div
            className={`grid gap-2 mb-3 text-xs ${
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
                  min="50"
                  max="500"
                  step="50"
                  value={distance}
                  onChange={(e) => setDistance(Number(e.target.value))}
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
                  min="5"
                  max="180"
                  step="5"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Movement buttons - compact grid */}
          <div className="grid grid-cols-3 gap-1">
            <div></div>
            {controlMode === "incremental" ? (
              <button
                onClick={() => sendStepDrive(distance, driveSpeed)}
                className="px-2 py-2 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors flex items-center justify-center"
                title={`Forward ${distance}mm`}
              >
                ↑
              </button>
            ) : (
              <button
                onMouseDown={() => startContinuousDrive("forward")}
                onMouseUp={stopContinuousDrive}
                onMouseLeave={stopContinuousDrive}
                onTouchStart={() => startContinuousDrive("forward")}
                onTouchEnd={stopContinuousDrive}
                className="px-2 py-2 bg-green-500 text-white text-xs rounded hover:bg-green-600 active:bg-green-700 transition-colors flex items-center justify-center"
                title="Forward (Hold)"
              >
                ↑
              </button>
            )}
            <div></div>

            {controlMode === "incremental" ? (
              <button
                onClick={() => sendStepTurn(-angle, driveSpeed)}
                className="px-2 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex items-center justify-center"
                title={`Turn ${angle}° left`}
              >
                ↶
              </button>
            ) : (
              <button
                onMouseDown={() => startContinuousTurn("left")}
                onMouseUp={stopContinuousTurn}
                onMouseLeave={stopContinuousTurn}
                onTouchStart={() => startContinuousTurn("left")}
                onTouchEnd={stopContinuousTurn}
                className="px-2 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 active:bg-blue-700 transition-colors flex items-center justify-center"
                title="Turn left (Hold)"
              >
                ↶
              </button>
            )}
            <button
              onClick={() => sendStop()}
              className="px-2 py-2 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors flex items-center justify-center"
              title="Stop"
            >
              ⏹
            </button>
            {controlMode === "incremental" ? (
              <button
                onClick={() => sendStepTurn(angle, driveSpeed)}
                className="px-2 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex items-center justify-center"
                title={`Turn ${angle}° right`}
              >
                ↷
              </button>
            ) : (
              <button
                onMouseDown={() => startContinuousTurn("right")}
                onMouseUp={stopContinuousTurn}
                onMouseLeave={stopContinuousTurn}
                onTouchStart={() => startContinuousTurn("right")}
                onTouchEnd={stopContinuousTurn}
                className="px-2 py-2 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 active:bg-blue-700 transition-colors flex items-center justify-center"
                title="Turn right (Hold)"
              >
                ↷
              </button>
            )}

            <div></div>
            {controlMode === "incremental" ? (
              <button
                onClick={() => sendStepDrive(-distance, driveSpeed)}
                className="px-2 py-2 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 transition-colors flex items-center justify-center"
                title={`Backward ${distance}mm`}
              >
                ↓
              </button>
            ) : (
              <button
                onMouseDown={() => startContinuousDrive("backward")}
                onMouseUp={stopContinuousDrive}
                onMouseLeave={stopContinuousDrive}
                onTouchStart={() => startContinuousDrive("backward")}
                onTouchEnd={stopContinuousDrive}
                className="px-2 py-2 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 active:bg-orange-700 transition-colors flex items-center justify-center"
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
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide border-t border-gray-200 dark:border-gray-700 pt-3">
              Motors ({availableMotors.length})
            </div>

            {/* Motor settings */}
            <div
              className={`grid gap-2 mb-3 text-xs ${
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
                        className="px-1 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 active:bg-purple-700 transition-colors"
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
                        className="px-1 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 transition-colors"
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
                        className="px-1 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 active:bg-purple-700 transition-colors"
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

  // Helper functions for step-mode commands
  function sendStepDrive(distance: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }
    onDriveCommand?.(distance, speed);
  }

  function sendStepTurn(angle: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }
    onTurnCommand?.(angle, speed);
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
}
