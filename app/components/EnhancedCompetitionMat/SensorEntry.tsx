import {
  type TelemetryPoint,
  telemetryHistory,
} from "../../services/telemetryHistory";

interface SensorData {
  color?: string | number; // Pybricks Color enum (can be string like "Color.RED" or number)
  distance?: number;
  reflection?: number;
  force?: number;
}

interface SensorEntryProps {
  name: string;
  data: SensorData;
  hoveredPoint: TelemetryPoint;
}

export function SensorEntry({ name, data, hoveredPoint }: SensorEntryProps) {
  return (
    <div className="ml-2">
      <span className="text-blue-300 font-medium">{name}:</span>
      {data.color && (
        <div className="ml-2 flex items-center gap-2">
          <span>Color:</span>
          <div
            className="w-4 h-4 rounded border border-white/30 inline-block"
            style={{
              backgroundColor: telemetryHistory.getColorForPoint(
                hoveredPoint,
                "colorSensor",
              ),
            }}
          ></div>
          <span>{data.color.toString().replace("Color.", "")}</span>
        </div>
      )}
      {data.distance !== undefined && (
        <div className="ml-2">Distance: {Math.round(data.distance)}mm</div>
      )}
      {data.reflection !== undefined && (
        <div className="ml-2">Reflection: {Math.round(data.reflection)}%</div>
      )}
      {data.force !== undefined && (
        <div className="ml-2">Force: {data.force.toFixed(1)}N</div>
      )}
    </div>
  );
}
