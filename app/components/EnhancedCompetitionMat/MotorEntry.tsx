interface MotorData {
  angle: number;
  speed: number;
  load?: number;
  error?: string;
}

interface MotorEntryProps {
  name: string;
  motor: MotorData;
}

export function MotorEntry({ name, motor }: MotorEntryProps) {
  return (
    <div className="ml-2 mb-1">
      <span className="text-green-300 font-medium">{name}:</span>
      <div className="ml-2 text-xs">
        <div className="flex justify-between">
          <span>Angle:</span>
          <span>{Math.round(motor.angle)}°</span>
        </div>
        <div className="flex justify-between">
          <span>Speed:</span>
          <span>{Math.round(motor.speed)}°/s</span>
        </div>
        {motor.load !== undefined && (
          <div className="flex justify-between">
            <span>Load:</span>
            <span
              className={
                motor.load > 80
                  ? "text-red-300"
                  : motor.load > 50
                    ? "text-yellow-300"
                    : "text-green-300"
              }
            >
              {Math.round(motor.load)}%
            </span>
          </div>
        )}
        {motor.error && (
          <div className="text-red-300 text-xs">Error: {motor.error}</div>
        )}
        {Math.abs(motor.speed) < 1 && Math.abs(motor.load || 0) > 20 && (
          <div className="text-orange-300 text-xs">⚠ Stalled</div>
        )}
      </div>
    </div>
  );
}
