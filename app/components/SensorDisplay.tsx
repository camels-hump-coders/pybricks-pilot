import type { TelemetryData } from "../services/pybricksHub";

type SensorData = NonNullable<TelemetryData["sensors"]>[string];

interface SensorDisplayProps {
  sensorData?: TelemetryData["sensors"];
  className?: string;
}

export function SensorDisplay({
  sensorData,
  className = "",
}: SensorDisplayProps) {
  if (!sensorData || Object.keys(sensorData).length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          Sensors
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No sensor data available
        </p>
      </div>
    );
  }

  const getSensorIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "color":
        return "🎨";
      case "distance":
      case "ultrasonic":
        return "📏";
      case "touch":
        return "👆";
      case "gyro":
        return "🔄";
      case "light":
        return "💡";
      default:
        return "📊";
    }
  };

  const formatSensorValue = (data: SensorData) => {
    if (data.error) return `Error: ${data.error}`;

    switch (data.type.toLowerCase()) {
      case "color":
        if (data.color !== undefined) {
          if (typeof data.color === "string") return data.color.toUpperCase();
          if (Array.isArray(data.color)) return `RGB(${data.color.join(", ")})`;
          return String(data.color);
        }
        return "Unknown";
      case "ultrasonic":
        return data.distance !== undefined ? `${data.distance} mm` : "No data";
      case "force":
        if (data.pressed !== undefined) {
          return data.pressed ? `Pressed (${data.force || 0}N)` : "Released";
        }
        return data.force !== undefined ? `${data.force}N` : "No data";
      case "rotation":
        if (data.angle !== undefined) {
          return `${data.angle}° (${data.speed || 0}°/s)`;
        }
        return "No data";
      case "generic":
        return data.value ? String(data.value) : "No data";
      default:
        if (data.value !== undefined) {
          if (typeof data.value === "object") {
            return JSON.stringify(data.value);
          }
          return String(data.value);
        }
        return "No data";
    }
  };

  const getSensorColorClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "color":
        return "border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900";
      case "distance":
      case "ultrasonic":
        return "border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900";
      case "touch":
        return "border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900";
      case "gyro":
        return "border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900";
      case "light":
        return "border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900";
      default:
        return "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800";
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
        Sensors
      </h3>
      <div className="grid gap-3">
        {Object.entries(sensorData).map(([name, data]) => (
          <div
            key={name}
            className={`rounded-lg border-2 p-3 ${data.error ? "border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900" : getSensorColorClass(data.type)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{getSensorIcon(data.type)}</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {name.charAt(0).toUpperCase() + name.slice(1)} Sensor
                </span>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 px-2 py-1 rounded-full">
                {data.type.charAt(0).toUpperCase() + data.type.slice(1)}
              </span>
            </div>

            <div className="text-center">
              <div
                className={`text-lg font-mono font-bold ${data.error ? "text-red-800 dark:text-red-300" : "text-gray-800 dark:text-gray-200"}`}
              >
                {formatSensorValue(data)}
              </div>

              {/* Additional sensor data display */}
              {!data.error && data.type.toLowerCase() === "color" && (
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {data.reflection !== undefined && (
                    <div>Reflection: {data.reflection}%</div>
                  )}
                  {data.ambient !== undefined && (
                    <div>Ambient: {data.ambient}%</div>
                  )}
                </div>
              )}
            </div>

            {/* Special visualizations for certain sensor types */}
            {data.type.toLowerCase() === "color" &&
              typeof data.value === "object" &&
              Array.isArray(data.value) && (
                <div className="mt-2 flex justify-center">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-600 shadow-sm"
                    style={{
                      backgroundColor: `rgb(${data.value[0] || 0}, ${data.value[1] || 0}, ${data.value[2] || 0})`,
                    }}
                  ></div>
                </div>
              )}

            {data.type.toLowerCase() === "ultrasonic" &&
              data.distance !== undefined && (
                <div className="mt-2">
                  <div className="w-full bg-white dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(5, Math.min(100, (data.distance / 200) * 100))}%`,
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
                    <span>0</span>
                    <span>200mm</span>
                  </div>
                </div>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
