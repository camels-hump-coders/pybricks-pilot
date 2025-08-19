interface MotorData {
  angle: number;
  speed: number;
  load?: number;
  error?: string;
}

interface MotorStatusProps {
  motorData?: { [name: string]: MotorData };
  className?: string;
}

export function MotorStatus({ motorData, className = "" }: MotorStatusProps) {
  if (!motorData || Object.keys(motorData).length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          Motors
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No motor data available
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
        Motors
      </h3>
      <div className="grid gap-3">
        {Object.entries(motorData).map(([name, data]) => (
          <div
            key={name}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {name.charAt(0).toUpperCase() + name.slice(1)} Motor
              </span>
              <div className="flex items-center gap-1">
                <div
                  className={`w-2 h-2 rounded-full ${
                    data.error
                      ? "bg-red-500"
                      : Math.abs(data.speed) > 5
                        ? "bg-green-500"
                        : "bg-gray-300"
                  }`}
                ></div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {data.error
                    ? "Error"
                    : Math.abs(data.speed) > 5
                      ? "Active"
                      : "Idle"}
                </span>
              </div>
            </div>

            {data.error ? (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                Error: {data.error}
              </div>
            ) : (
              <div
                className={`grid gap-2 text-sm ${data.load !== undefined ? "grid-cols-3" : "grid-cols-2"}`}
              >
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Speed
                  </div>
                  <div className="font-mono font-medium text-gray-800 dark:text-gray-200">
                    {data.speed.toFixed(0)} °/s
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Angle
                  </div>
                  <div className="font-mono font-medium text-gray-800 dark:text-gray-200">
                    {data.angle.toFixed(0)}°
                  </div>
                </div>
                {data.load !== undefined && (
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Load
                    </div>
                    <div className="font-mono font-medium text-gray-800 dark:text-gray-200">
                      {data.load.toFixed(0)}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Visual speed indicator */}
            <div className="mt-2">
              <div className="flex items-center justify-center h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    data.speed > 0
                      ? "bg-blue-500"
                      : data.speed < 0
                        ? "bg-red-500"
                        : "bg-gray-400 dark:bg-gray-500"
                  }`}
                  style={{
                    width: `${Math.abs(data.speed / 10)}%`,
                    maxWidth: "100%",
                  }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
