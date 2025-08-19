import type { Point } from "../../schemas/GameMatConfig";

interface CalibrationPoints {
  xAxis: { first: Point | null; second: Point | null };
  yAxis: { first: Point | null; second: Point | null };
}

interface CurrentCalibrationPoint {
  axis: "xAxis" | "yAxis";
  point: "first" | "second";
}

interface CalibrationPointButtonsProps {
  calibrationPoints: CalibrationPoints;
  currentCalibrationPoint: CurrentCalibrationPoint | null;
  onSetCurrentCalibrationPoint: (point: CurrentCalibrationPoint) => void;
  onCalibrationComplete: () => void;
  onResetCalibration: () => void;
  calculatedDimensions: { widthMm: number; heightMm: number } | null;
}

export function CalibrationPointButtons({
  calibrationPoints,
  currentCalibrationPoint,
  onSetCurrentCalibrationPoint,
  onCalibrationComplete,
  onResetCalibration,
  calculatedDimensions,
}: CalibrationPointButtonsProps) {
  const allPointsSet = 
    calibrationPoints.xAxis.first &&
    calibrationPoints.xAxis.second &&
    calibrationPoints.yAxis.first &&
    calibrationPoints.yAxis.second;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
          X-Axis (Horizontal) - 100mm reference
        </h4>
        <div className="space-y-2">
          <button
            onClick={() =>
              onSetCurrentCalibrationPoint({
                axis: "xAxis",
                point: "first",
              })
            }
            className={`w-full text-left px-3 py-2 rounded ${
              currentCalibrationPoint?.axis === "xAxis" &&
              currentCalibrationPoint?.point === "first"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            First Point {calibrationPoints.xAxis.first ? "✓" : ""}
          </button>
          <button
            onClick={() =>
              onSetCurrentCalibrationPoint({
                axis: "xAxis",
                point: "second",
              })
            }
            className={`w-full text-left px-3 py-2 rounded ${
              currentCalibrationPoint?.axis === "xAxis" &&
              currentCalibrationPoint?.point === "second"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Second Point {calibrationPoints.xAxis.second ? "✓" : ""}
          </button>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Y-Axis (Vertical) - 100mm reference
        </h4>
        <div className="space-y-2">
          <button
            onClick={() =>
              onSetCurrentCalibrationPoint({
                axis: "yAxis",
                point: "first",
              })
            }
            className={`w-full text-left px-3 py-2 rounded ${
              currentCalibrationPoint?.axis === "yAxis" &&
              currentCalibrationPoint?.point === "first"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            First Point {calibrationPoints.yAxis.first ? "✓" : ""}
          </button>
          <button
            onClick={() =>
              onSetCurrentCalibrationPoint({
                axis: "yAxis",
                point: "second",
              })
            }
            className={`w-full text-left px-3 py-2 rounded ${
              currentCalibrationPoint?.axis === "yAxis" &&
              currentCalibrationPoint?.point === "second"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Second Point {calibrationPoints.yAxis.second ? "✓" : ""}
          </button>
        </div>
      </div>

      {currentCalibrationPoint && (
        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Click on the mat to set{" "}
            {currentCalibrationPoint.axis === "xAxis" ? "X" : "Y"}
            -axis point{" "}
            {currentCalibrationPoint.point === "first" ? "1" : "2"}
          </p>
        </div>
      )}

      {allPointsSet && (
        <div className="space-y-2">
          <button
            onClick={onCalibrationComplete}
            className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Calculate Dimensions & Continue
          </button>
          <button
            onClick={onResetCalibration}
            className="w-full px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Reset Calibration
          </button>
        </div>
      )}

      {calculatedDimensions && (
        <div className="mt-4 p-3 bg-green-100 dark:bg-green-900 rounded">
          <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            Calculated Dimensions
          </h4>
          <p className="text-sm text-green-700 dark:text-green-200">
            Width: {calculatedDimensions.widthMm.toFixed(2)}mm
          </p>
          <p className="text-sm text-green-700 dark:text-green-200">
            Height: {calculatedDimensions.heightMm.toFixed(2)}mm
          </p>
        </div>
      )}
    </div>
  );
}