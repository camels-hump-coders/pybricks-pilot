interface MotorControlsProps {
  controlMode: "incremental" | "continuous";
  availableMotors: string[];
  motorSpeed: number;
  setMotorSpeed: (speed: number) => void;
  motorAngle: number;
  setMotorAngle: (angle: number) => void;
  telemetryData: any;
  onSendMotorCommand: (motorName: string, angle: number, speed: number) => void;
  onStartContinuousMotor: (motorName: string, direction: "ccw" | "cw") => void;
  onStopContinuousMotor: () => void;
}

export function MotorControls({
  controlMode,
  availableMotors,
  motorSpeed,
  setMotorSpeed,
  motorAngle,
  setMotorAngle,
  telemetryData,
  onSendMotorCommand,
  onStartContinuousMotor,
  onStopContinuousMotor,
}: MotorControlsProps) {
  if (availableMotors.length === 0) {
    return null;
  }

  return (
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
                    onSendMotorCommand(motorName, -motorAngle, motorSpeed)
                  }
                  className="px-1 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 transition-colors"
                  title={`${motorName} CCW ${motorAngle}°`}
                >
                  ↶
                </button>
              ) : (
                <button
                  onMouseDown={() => onStartContinuousMotor(motorName, "ccw")}
                  onMouseUp={onStopContinuousMotor}
                  onMouseLeave={onStopContinuousMotor}
                  onTouchStart={() => onStartContinuousMotor(motorName, "ccw")}
                  onTouchEnd={onStopContinuousMotor}
                  className="px-2 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 active:bg-purple-700 transition-colors"
                  title={`${motorName} CCW (Hold)`}
                >
                  ↶
                </button>
              )}
              {controlMode === "incremental" ? (
                <button
                  onClick={() =>
                    onSendMotorCommand(motorName, motorAngle, motorSpeed)
                  }
                  className="px-2 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 transition-colors"
                  title={`${motorName} CW ${motorAngle}°`}
                >
                  ↷
                </button>
              ) : (
                <button
                  onMouseDown={() => onStartContinuousMotor(motorName, "cw")}
                  onMouseUp={onStopContinuousMotor}
                  onMouseLeave={onStopContinuousMotor}
                  onTouchStart={() => onStartContinuousMotor(motorName, "cw")}
                  onTouchEnd={onStopContinuousMotor}
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
  );
}
