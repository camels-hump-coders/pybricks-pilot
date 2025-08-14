import type { TelemetryData } from "../services/pybricksHub";

interface TelemetryTooltipProps {
  telemetry: TelemetryData;
  position: { x: number; y: number };
  timestamp?: number;
}

export function TelemetryTooltip({ telemetry, position, timestamp }: TelemetryTooltipProps) {
  const formatTime = (ms: number): string => {
    const date = new Date(ms);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3
    });
  };

  return (
    <div
      className="fixed z-50 bg-black bg-opacity-90 text-white text-xs rounded-lg p-3 pointer-events-none max-w-xs shadow-xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -120%)"
      }}
    >
      {timestamp && (
        <div className="mb-2 pb-2 border-b border-gray-600">
          <div className="font-semibold text-yellow-300">
            {formatTime(timestamp)}
          </div>
        </div>
      )}

      {/* Drivebase Info */}
      {telemetry.drivebase && (
        <div className="mb-2">
          <div className="font-semibold text-blue-300 mb-1">Drivebase</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>Distance: {telemetry.drivebase.distance?.toFixed(1)}mm</div>
            <div>Angle: {telemetry.drivebase.angle?.toFixed(1)}°</div>
            {telemetry.drivebase.state && (
              <>
                <div>Speed: {telemetry.drivebase.state.drive_speed?.toFixed(0)}mm/s</div>
                <div>Turn: {telemetry.drivebase.state.turn_rate?.toFixed(0)}°/s</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Motors Info */}
      {telemetry.motors && Object.keys(telemetry.motors).length > 0 && (
        <div className="mb-2">
          <div className="font-semibold text-green-300 mb-1">Motors</div>
          <div className="space-y-1">
            {Object.entries(telemetry.motors).map(([name, motor]) => (
              <div key={name} className="flex justify-between">
                <span className="text-gray-400">{name}:</span>
                <span>
                  {motor.angle?.toFixed(0)}° @ {motor.speed?.toFixed(0)}°/s
                  {motor.load !== undefined && ` (${motor.load.toFixed(0)}%)`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sensors Info */}
      {telemetry.sensors && Object.keys(telemetry.sensors).length > 0 && (
        <div className="mb-2">
          <div className="font-semibold text-orange-300 mb-1">Sensors</div>
          <div className="space-y-1">
            {Object.entries(telemetry.sensors).map(([name, sensor]) => {
              if (sensor.type === "color") {
                return (
                  <div key={name} className="flex justify-between">
                    <span className="text-gray-400">{name}:</span>
                    <span>
                      {sensor.color}
                      {sensor.reflection !== undefined && ` (${sensor.reflection}%)`}
                    </span>
                  </div>
                );
              } else if (sensor.type === "ultrasonic") {
                return (
                  <div key={name} className="flex justify-between">
                    <span className="text-gray-400">{name}:</span>
                    <span>{sensor.distance?.toFixed(0)}mm</span>
                  </div>
                );
              } else if (sensor.type === "force") {
                return (
                  <div key={name} className="flex justify-between">
                    <span className="text-gray-400">{name}:</span>
                    <span>
                      {sensor.force?.toFixed(1)}N
                      {sensor.pressed && " (pressed)"}
                    </span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}

      {/* Hub Info */}
      {telemetry.hub && (
        <div>
          <div className="font-semibold text-purple-300 mb-1">Hub</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {telemetry.hub.battery && (
              <>
                <div>Battery: {(telemetry.hub.battery.voltage / 1000).toFixed(1)}V</div>
                <div>Current: {telemetry.hub.battery.current?.toFixed(0)}mA</div>
              </>
            )}
            {telemetry.hub.imu && (
              <>
                <div>Heading: {telemetry.hub.imu.heading?.toFixed(1)}°</div>
                {telemetry.hub.imu.acceleration && (
                  <div>
                    Accel: {telemetry.hub.imu.acceleration[0]?.toFixed(0)},
                    {telemetry.hub.imu.acceleration[1]?.toFixed(0)},
                    {telemetry.hub.imu.acceleration[2]?.toFixed(0)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}