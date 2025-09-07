import { useEffect, useRef, useState } from "react";

interface CalibrationPanelProps {
  currentWheelDiameter: number; // mm
  currentAxleTrack: number; // mm
  onApplyWheelDiameter: (newDiameter: number) => void;
  onApplyAxleTrack?: (newAxleTrack: number) => void;
  onRerunCalibrate?: () => void;
  onOpenRobotBuilder: () => void;
}

export function CalibrationPanel({
  currentWheelDiameter,
  currentAxleTrack,
  onApplyWheelDiameter,
  onApplyAxleTrack,
  onRerunCalibrate,
  onOpenRobotBuilder,
}: CalibrationPanelProps) {
  const [wheelInput, setWheelInput] = useState<string>(String(Math.round(currentWheelDiameter)));
  const [trackInput, setTrackInput] = useState<string>(String(Math.round(currentAxleTrack)));

  // Stable refs to handlers to avoid re-running debounced effects on every parent re-render
  const wheelApplyRef = useRef(onApplyWheelDiameter);
  useEffect(() => {
    wheelApplyRef.current = onApplyWheelDiameter;
  }, [onApplyWheelDiameter]);

  const trackApplyRef = useRef(onApplyAxleTrack);
  useEffect(() => {
    trackApplyRef.current = onApplyAxleTrack;
  }, [onApplyAxleTrack]);

  // Keep inputs synced with props
  useEffect(() => {
    const next = String(Math.round(currentWheelDiameter));
    setWheelInput((prev) => (prev === next ? prev : next));
  }, [currentWheelDiameter]);
  useEffect(() => {
    const next = String(Math.round(currentAxleTrack));
    setTrackInput((prev) => (prev === next ? prev : next));
  }, [currentAxleTrack]);

  // Debounce live apply
  useEffect(() => {
    const t = setTimeout(() => {
      const v = Number(wheelInput);
      if (!Number.isNaN(v) && v > 0) wheelApplyRef.current(v);
    }, 400);
    return () => clearTimeout(t);
  }, [wheelInput]);

  useEffect(() => {
    if (!trackApplyRef.current) return;
    const t = setTimeout(() => {
      const v = Number(trackInput);
      if (!Number.isNaN(v) && v > 0 && trackApplyRef.current) trackApplyRef.current(v);
    }, 400);
    return () => clearTimeout(t);
  }, [trackInput]);

  return (
    <div className="mt-3 p-2 border border-gray-200 dark:border-gray-700 rounded">
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
        Calibration Settings
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {/* Wheel Diameter */}
        <div className="space-y-1">
          <label className="block text-[11px] text-gray-500 dark:text-gray-400">
            Wheel diameter (mm)
          </label>
          <input
            type="number"
            value={wheelInput}
            onChange={(e) => setWheelInput(e.target.value)}
            className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            min={10}
            step={1}
          />
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Live-saves to active robot
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenRobotBuilder}
              className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded"
            >
              Open Robot Builder
            </button>
            {onRerunCalibrate && (
              <button
                type="button"
                onClick={onRerunCalibrate}
                className="px-2 py-1 bg-amber-600 text-white rounded"
                title="Upload and run the calibration program again"
              >
                Rerun Calibrate
              </button>
            )}
          </div>
        </div>
        {/* Axle Track */}
        <div className="space-y-1">
          <label className="block text-[11px] text-gray-500 dark:text-gray-400">
            Axle track (mm)
          </label>
          <input
            type="number"
            value={trackInput}
            onChange={(e) => setTrackInput(e.target.value)}
            className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            min={50}
            step={1}
          />
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Live-saves to active robot
          </div>
        </div>
      </div>
    </div>
  );
}
