import { useRef, useState } from "react";

type ControlMode = "incremental" | "continuous";

interface RobotControllerProps {
  onDriveCommand: (direction: number, speed: number) => Promise<void>;
  onTurnCommand: (angle: number, speed: number) => Promise<void>;
  onStopCommand: () => Promise<void>;
  onContinuousDriveCommand: (speed: number, turnRate: number) => Promise<void>;
  onCustomCommand: (command: string) => Promise<void>;
  isConnected: boolean;
  className?: string;
}

export function RobotController({
  onDriveCommand,
  onTurnCommand,
  onStopCommand,
  onContinuousDriveCommand,
  onCustomCommand,
  isConnected,
  className = "",
}: RobotControllerProps) {
  const [controlMode, setControlMode] = useState<ControlMode>("incremental");
  const [speed, setSpeed] = useState(50);
  const [acceleration, setAcceleration] = useState(500);
  const [turnSpeed, setTurnSpeed] = useState(50);
  const [turnAcceleration, setTurnAcceleration] = useState(500);
  const [distance, setDistance] = useState(100);
  const [angle, setAngle] = useState(90);
  const [customCommand, setCustomCommand] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Track active continuous controls and command chain
  const commandChainRef = useRef<Promise<any>>(Promise.resolve());

  const handleDriveForward = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDriveCommand(distance, speed);
  };

  const handleDriveBackward = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDriveCommand(-distance, speed);
  };

  const handleTurnLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTurnCommand(-angle, speed);
  };

  const handleTurnRight = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTurnCommand(angle, speed);
  };

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onStopCommand();
  };

  // Continuous control handlers

  // Queue a command in the promise chain
  const queueCommand = (commandFn: () => Promise<any>) => {
    const currentPromise = commandChainRef.current;
    const newPromise = currentPromise.finally(async () => {
      try {
        await commandFn();
      } catch (error) {
        // Silently handle command errors
      }
    });
    commandChainRef.current = newPromise;
    return newPromise;
  };

  const sendContinuousMovement = (driveSpeed: number, turnRate: number) => {
    return queueCommand(async () => {
      await onContinuousDriveCommand(driveSpeed, turnRate);
    });
  };

  const sendStopCommand = () => {
    return queueCommand(() => onStopCommand());
  };

  const startContinuousDrive = (direction: "forward" | "backward") => {
    if (controlMode !== "continuous") return;

    const driveSpeed = direction === "forward" ? speed * 10 : -speed * 10;
    const turnRate = 0;

    // Send initial command - the chaining will handle continuous commands
    sendContinuousMovement(driveSpeed, turnRate);
  };

  const stopContinuousDrive = () => {
    sendStopCommand();
  };

  const startContinuousTurn = (direction: "left" | "right") => {
    if (controlMode !== "continuous") return;

    const turnRate = direction === "left" ? -turnSpeed * 3.6 : turnSpeed * 3.6;
    const driveSpeed = 0;

    // Send initial command - the chaining will handle continuous commands
    sendContinuousMovement(driveSpeed, turnRate);
  };

  const stopContinuousTurn = () => {
    sendStopCommand();
  };

  const handleCustomSubmit = () => {
    try {
      // Validate JSON format first
      JSON.parse(customCommand);
      onCustomCommand(customCommand);
    } catch (error) {
      console.error("Invalid JSON command:", error);
    }
  };

  if (!isConnected) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center ${className}`}>
        <div className="text-gray-400 dark:text-gray-500 text-4xl mb-2">🎮</div>
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300 mb-2">
          Controller Disabled
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Connect to a hub to control your robot
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Robot Controller
          </h3>
          <div className="flex items-center gap-2">
            {/* Control Mode Selector */}
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

            <button
              onClick={() => setIsCustomMode(!isCustomMode)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                isCustomMode
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              Custom
            </button>
            <button
              onClick={handleStop}
              className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-800 transition-colors disabled:opacity-50"
            >
              🛑 STOP
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {!isCustomMode ? (
          <>
            {/* Control parameters */}
            <div className="space-y-4">
              {/* Drive controls */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Drive Settings
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Drive Speed ({speed}%)
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Drive Accel ({acceleration}mm/s²)
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="100"
                      value={acceleration}
                      onChange={(e) => setAcceleration(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  {controlMode === "incremental" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Distance ({distance}mm)
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="500"
                        value={distance}
                        onChange={(e) => setDistance(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Turn controls */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Turn Settings
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Turn Speed ({turnSpeed}%)
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={turnSpeed}
                      onChange={(e) => setTurnSpeed(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Turn Accel ({turnAcceleration}°/s²)
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="100"
                      value={turnAcceleration}
                      onChange={(e) =>
                        setTurnAcceleration(Number(e.target.value))
                      }
                      className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  {controlMode === "incremental" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Turn Angle ({angle}°)
                      </label>
                      <input
                        type="range"
                        min="15"
                        max="180"
                        value={angle}
                        onChange={(e) => setAngle(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Directional controls */}
            <div className="flex flex-col items-center space-y-4">
              {controlMode === "incremental" ? (
                <>
                  <button
                    onClick={handleDriveForward}
                    className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                  >
                    ↑ Forward {distance}mm
                  </button>

                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleTurnLeft}
                      className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                    >
                      ← Turn {angle}°
                    </button>

                    <button
                      onClick={handleStop}
                      className="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 font-medium"
                    >
                      ⬜ STOP
                    </button>

                    <button
                      onClick={handleTurnRight}
                      className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                    >
                      Turn {angle}° →
                    </button>
                  </div>

                  <button
                    onClick={handleDriveBackward}
                    className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                  >
                    ↓ Backward {distance}mm
                  </button>
                </>
              ) : (
                <>
                  <button
                    onMouseDown={() => startContinuousDrive("forward")}
                    onMouseUp={stopContinuousDrive}
                    onMouseLeave={stopContinuousDrive}
                    onTouchStart={() => startContinuousDrive("forward")}
                    onTouchEnd={stopContinuousDrive}
                    className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 active:bg-green-700 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                  >
                    ↑ Forward (Hold)
                  </button>

                  <div className="flex items-center space-x-4">
                    <button
                      onMouseDown={() => startContinuousTurn("left")}
                      onMouseUp={stopContinuousTurn}
                      onMouseLeave={stopContinuousTurn}
                      onTouchStart={() => startContinuousTurn("left")}
                      onTouchEnd={stopContinuousTurn}
                      className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                    >
                      ← Turn Left
                    </button>

                    <button
                      onClick={handleStop}
                      className="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 font-medium"
                    >
                      ⬜ STOP
                    </button>

                    <button
                      onMouseDown={() => startContinuousTurn("right")}
                      onMouseUp={stopContinuousTurn}
                      onMouseLeave={stopContinuousTurn}
                      onTouchStart={() => startContinuousTurn("right")}
                      onTouchEnd={stopContinuousTurn}
                      className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                    >
                      Turn Right →
                    </button>
                  </div>

                  <button
                    onMouseDown={() => startContinuousDrive("backward")}
                    onMouseUp={stopContinuousDrive}
                    onMouseLeave={stopContinuousDrive}
                    onTouchStart={() => startContinuousDrive("backward")}
                    onTouchEnd={stopContinuousDrive}
                    className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 active:bg-orange-700 transition-colors disabled:opacity-50 font-medium flex items-center gap-2"
                  >
                    ↓ Backward (Hold)
                  </button>
                </>
              )}
            </div>

            {/* Quick actions */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Quick Actions
              </h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDriveCommand(360, 30);
                  }}
                  className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Square (360mm)
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTurnCommand(360, 30);
                  }}
                  className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Spin 360°
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCustomCommand(
                      JSON.stringify({ action: "dance", duration: 5000 })
                    );
                  }}
                  className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Dance 💃
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Custom command mode */
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Custom Command (JSON)
              </label>
              <textarea
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder={`{
  "action": "custom_move",
  "parameters": {
    "left_speed": 50,
    "right_speed": -50,
    "duration": 2000
  }
}`}
                className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <button
              onClick={handleCustomSubmit}
              disabled={!customCommand.trim()}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium"
            >
              Send Custom Command
            </button>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              <p className="font-medium mb-1">Example commands:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <code>{`{"action": "beep", "frequency": 440, "duration": 1000}`}</code>
                </li>
                <li>
                  <code>{`{"action": "led", "color": [255, 0, 0]}`}</code>
                </li>
                <li>
                  <code>{`{"action": "motor", "port": "A", "speed": 100}`}</code>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
