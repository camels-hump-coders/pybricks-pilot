import type { Point } from "../../schemas/GameMatConfig";
import { CalibrationPointButtons } from "./CalibrationPointButtons";

interface CalibrationPoints {
  xAxis: { first: Point | null; second: Point | null };
  yAxis: { first: Point | null; second: Point | null };
}

interface CurrentCalibrationPoint {
  axis: "xAxis" | "yAxis";
  point: "first" | "second";
}

interface CalibrationPanelProps {
  calibrationPoints: CalibrationPoints;
  currentCalibrationPoint: CurrentCalibrationPoint | null;
  calculatedDimensions: { widthMm: number; heightMm: number } | null;
  onSetCurrentCalibrationPoint: (point: CurrentCalibrationPoint) => void;
  onCalibrationComplete: () => void;
  onResetCalibration: () => void;
}

export function CalibrationPanel({
  calibrationPoints,
  currentCalibrationPoint,
  calculatedDimensions,
  onSetCurrentCalibrationPoint,
  onCalibrationComplete,
  onResetCalibration,
}: CalibrationPanelProps) {
  return (
    <div>
      <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
        Calibrate Mat Dimensions
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Click on two points on the X-axis and two points on the Y-axis
        that represent 100mm distances. This will allow us to
        automatically calculate the mat's actual dimensions.
      </p>
      
      <CalibrationPointButtons
        calibrationPoints={calibrationPoints}
        currentCalibrationPoint={currentCalibrationPoint}
        onSetCurrentCalibrationPoint={onSetCurrentCalibrationPoint}
        onCalibrationComplete={onCalibrationComplete}
        onResetCalibration={onResetCalibration}
        calculatedDimensions={calculatedDimensions}
      />
    </div>
  );
}