import { type TelemetryPoint } from "../../services/telemetryHistory";
import { MotorEntry } from "./MotorEntry";
import { SensorEntry } from "./SensorEntry";

interface TelemetryTooltipProps {
  hoveredPoint: TelemetryPoint;
  tooltipPosition: { x: number; y: number };
  selectedPathPoints: TelemetryPoint[];
}

export function TelemetryTooltip({ 
  hoveredPoint, 
  tooltipPosition, 
  selectedPathPoints 
}: TelemetryTooltipProps) {
  const calculateRelativeTime = () => {
    // Calculate relative time from first point in selected path
    if (selectedPathPoints.length > 0) {
      const firstPointTime = selectedPathPoints[0].timestamp;
      const relativeTime =
        (hoveredPoint.timestamp - firstPointTime) / 1000;
      return `${relativeTime.toFixed(1)}s`;
    }
    return "0.0s";
  };

  return (
    <div
      className="fixed z-50 bg-black bg-opacity-90 text-white text-xs rounded-lg p-3 pointer-events-none max-w-xs"
      style={{
        left: `${tooltipPosition.x + 10}px`,
        top: `${tooltipPosition.y - 10}px`,
        transform: "translateY(-100%)",
      }}
    >
      <div className="space-y-1">
        <div className="font-semibold text-yellow-300 border-b border-gray-600 pb-1 mb-2">
          Telemetry Point
        </div>
        <div>
          <span className="text-gray-300">Time:</span>
          <span className="ml-2">{calculateRelativeTime()}</span>
        </div>
        <div>
          <span className="text-gray-300">Position:</span>
          <span className="ml-2">
            {Math.round(hoveredPoint.x)}, {Math.round(hoveredPoint.y)}mm
          </span>
        </div>
        <div>
          <span className="text-gray-300">Heading:</span>
          <span className="ml-2">{Math.round(hoveredPoint.heading)}°</span>
        </div>
        {hoveredPoint.data.drivebase && (
          <div>
            <span className="text-gray-300">Speed:</span>
            <span className="ml-2">
              {Math.round(
                hoveredPoint.data.drivebase.state?.drive_speed || 0
              )}
              mm/s
            </span>
          </div>
        )}
        {hoveredPoint.data.motors &&
          Object.keys(hoveredPoint.data.motors).length > 0 && (
            <>
              <div className="border-t border-gray-600 pt-2 mt-2">
                <div className="text-gray-300 font-medium mb-1">
                  Motors:
                </div>
                {Object.entries(hoveredPoint.data.motors)
                  .filter(
                    ([name]) =>
                      !["left", "right"].includes(name.toLowerCase())
                  )
                  .map(([name, motor]) => (
                    <MotorEntry
                      key={name}
                      name={name}
                      motor={motor}
                    />
                  ))}
              </div>
            </>
          )}
        {hoveredPoint.data.sensors &&
          Object.keys(hoveredPoint.data.sensors).length > 0 && (
            <>
              <div className="border-t border-gray-600 pt-2 mt-2">
                <div className="text-gray-300 font-medium mb-1">
                  Sensors:
                </div>
                {Object.entries(hoveredPoint.data.sensors).map(
                  ([name, data]) => (
                    <SensorEntry
                      key={name}
                      name={name}
                      data={data}
                      hoveredPoint={hoveredPoint}
                    />
                  )
                )}
              </div>
            </>
          )}
      </div>
    </div>
  );
}