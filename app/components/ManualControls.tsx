import type { ControlMode } from "../store/atoms/gameMat";

interface ExecutingCommand {
  type: "drive" | "turn";
  direction: "forward" | "backward" | "left" | "right";
  originalParams: { distance?: number; angle?: number; speed: number };
}

interface ManualControlsProps {
  controlMode: ControlMode;
  distance: number;
  setDistance: (distance: number) => void;
  angle: number;
  setAngle: (angle: number) => void;
  driveSpeed: number;
  setDriveSpeed: (speed: number) => void;
  executingCommand: ExecutingCommand | null;
  onUpdatePreview: (
    type: "drive" | "turn" | null,
    direction: "forward" | "backward" | "left" | "right" | null,
  ) => void;
  onUpdateDualPreview?: (
    type: "drive" | "turn",
    distance?: number,
    angle?: number,
  ) => void;
  onSendStepDrive: (distance: number, speed: number) => void;
  onSendStepTurn: (angle: number, speed: number) => void;
  onStartContinuousDrive: (direction: "forward" | "backward") => void;
  onStopContinuousDrive: () => void;
  onStartContinuousTurn: (direction: "left" | "right") => void;
  onStopContinuousTurn: () => void;
  onSendStop: () => void;
  onStopExecutingCommand: () => void;
  showGridOverlay?: boolean;
  setShowGridOverlay?: (show: boolean) => void;
  showTrajectoryOverlay?: boolean;
  setShowTrajectoryOverlay?: (show: boolean) => void;
}

export function ManualControls({
  controlMode,
  distance,
  setDistance,
  angle,
  setAngle,
  driveSpeed,
  setDriveSpeed,
  executingCommand,
  onUpdatePreview,
  onUpdateDualPreview,
  onSendStepDrive,
  onSendStepTurn,
  onStartContinuousDrive,
  onStopContinuousDrive,
  onStartContinuousTurn,
  onStopContinuousTurn,
  onSendStop,
  onStopExecutingCommand,
  showGridOverlay,
  setShowGridOverlay,
  showTrajectoryOverlay,
  setShowTrajectoryOverlay,
}: ManualControlsProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Settings */}
      <div
        className={`grid gap-2 sm:gap-3 text-xs ${
          controlMode === "incremental" ? "grid-cols-3" : "grid-cols-1"
        }`}
      >
        {controlMode === "incremental" && (
          <>
            <div>
              <label className="block text-gray-600 dark:text-gray-400 mb-1">
                Distance: {distance}mm
              </label>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
                onInput={(e) => {
                  // Update preview in real-time as slider is dragged
                  if (onUpdateDualPreview) {
                    const currentValue = Number(
                      (e.target as HTMLInputElement).value,
                    );
                    onUpdateDualPreview("drive", currentValue, angle);
                  }
                }}
                onMouseEnter={() => {
                  // Show dual drive previews when hovering over distance slider
                  if (onUpdateDualPreview) {
                    onUpdateDualPreview("drive", distance, angle);
                  }
                }}
                onMouseLeave={() => {
                  // Clear preview when leaving slider
                  onUpdatePreview(null, null);
                }}
                className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-gray-600 dark:text-gray-400 mb-1">
                Angle: {angle}°
              </label>
              <input
                type="range"
                min="5"
                max="180"
                step="5"
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value))}
                onInput={(e) => {
                  // Update preview in real-time as slider is dragged
                  if (onUpdateDualPreview) {
                    const currentValue = Number(
                      (e.target as HTMLInputElement).value,
                    );
                    onUpdateDualPreview("turn", distance, currentValue);
                  }
                }}
                onMouseEnter={() => {
                  // Show dual turn previews when hovering over angle slider
                  if (onUpdateDualPreview) {
                    onUpdateDualPreview("turn", distance, angle);
                  }
                }}
                onMouseLeave={() => {
                  // Clear preview when leaving slider
                  onUpdatePreview(null, null);
                }}
                className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </>
        )}
        <div>
          <label className="block text-gray-600 dark:text-gray-400 mb-1">
            Speed: {driveSpeed}%
          </label>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={driveSpeed}
            onChange={(e) => setDriveSpeed(Number(e.target.value))}
            className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Toggle Buttons for Grid and Trajectory Overlay */}
      {controlMode === "incremental" && (
        <div className="flex gap-2 mb-3">
          {/* Grid Overlay Toggle */}
          {setShowGridOverlay && (
            <button
              onClick={() => setShowGridOverlay(!showGridOverlay)}
              className={`px-3 py-2 text-sm rounded transition-colors flex items-center gap-2 ${
                showGridOverlay
                  ? "bg-blue-500 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              }`}
              title="Toggle 100mm grid overlay"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Grid</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              <span className="text-xs">Grid</span>
            </button>
          )}

          {/* Trajectory Overlay Toggle */}
          {setShowTrajectoryOverlay && (
            <button
              onClick={() => setShowTrajectoryOverlay(!showTrajectoryOverlay)}
              className={`px-3 py-2 text-sm rounded transition-colors flex items-center gap-2 ${
                showTrajectoryOverlay
                  ? "bg-purple-500 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              }`}
              title="Toggle trajectory projection overlay"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Ghosts</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
              <span className="text-xs">Ghosts</span>
            </button>
          )}
        </div>
      )}

      {/* Movement Controls - Cross Layout */}
      <div className="grid grid-cols-3 gap-2 mb-2 sm:mb-3">
        {/* Empty cell */}
        <div></div>

        {/* Forward Button */}
        {controlMode === "incremental" ? (
          executingCommand?.type === "drive" &&
          executingCommand?.direction === "forward" ? (
            <button
              onClick={onStopExecutingCommand}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
              title={`Stop forward movement (${executingCommand.originalParams?.distance}mm)`}
            >
              ⏹
            </button>
          ) : (
            <button
              onClick={() => onSendStepDrive(distance, driveSpeed)}
              onMouseEnter={() => onUpdatePreview("drive", "forward")}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors flex items-center justify-center"
              title={`Forward ${distance}mm`}
              disabled={!!executingCommand}
            >
              ↑
            </button>
          )
        ) : (
          <button
            onMouseDown={() => onStartContinuousDrive("forward")}
            onMouseUp={onStopContinuousDrive}
            onMouseLeave={onStopContinuousDrive}
            onTouchStart={() => onStartContinuousDrive("forward")}
            onTouchEnd={onStopContinuousDrive}
            className="px-3 py-3 bg-green-500 text-white text-sm rounded hover:bg-green-600 active:bg-green-700 transition-colors flex items-center justify-center"
            title="Forward (Hold)"
          >
            ↑
          </button>
        )}

        {/* Empty cell */}
        <div></div>

        {/* Left Turn Button */}
        {controlMode === "incremental" ? (
          executingCommand?.type === "turn" &&
          executingCommand?.direction === "left" ? (
            <button
              onClick={onStopExecutingCommand}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
              title={`Stop left turn (${executingCommand.originalParams?.angle}°)`}
            >
              ⏹
            </button>
          ) : (
            <button
              onClick={() => onSendStepTurn(-angle, driveSpeed)}
              onMouseEnter={() => onUpdatePreview("turn", "left")}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 transition-colors flex items-center justify-center"
              title={`Turn ${angle}° left`}
              disabled={!!executingCommand}
            >
              ↶
            </button>
          )
        ) : (
          <button
            onMouseDown={() => onStartContinuousTurn("left")}
            onMouseUp={onStopContinuousTurn}
            onMouseLeave={onStopContinuousTurn}
            onTouchStart={() => onStartContinuousTurn("left")}
            onTouchEnd={onStopContinuousTurn}
            className="px-3 py-3 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 active:bg-blue-700 transition-colors flex items-center justify-center"
            title="Turn left (Hold)"
          >
            ↶
          </button>
        )}

        {/* Stop Button - Center */}
        <button
          onClick={onSendStop}
          className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center"
          title="Stop"
        >
          ⏹
        </button>

        {/* Right Turn Button */}
        {controlMode === "incremental" ? (
          executingCommand?.type === "turn" &&
          executingCommand?.direction === "right" ? (
            <button
              onClick={onStopExecutingCommand}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
              title={`Stop right turn (${executingCommand.originalParams?.angle}°)`}
            >
              ⏹
            </button>
          ) : (
            <button
              onClick={() => onSendStepTurn(angle, driveSpeed)}
              onMouseEnter={() => onUpdatePreview("turn", "right")}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-cyan-600 text-white text-sm rounded hover:bg-cyan-700 transition-colors flex items-center justify-center"
              title={`Turn ${angle}° right`}
              disabled={!!executingCommand}
            >
              ↷
            </button>
          )
        ) : (
          <button
            onMouseDown={() => onStartContinuousTurn("right")}
            onMouseUp={onStopContinuousTurn}
            onMouseLeave={onStopContinuousTurn}
            onTouchStart={() => onStartContinuousTurn("right")}
            onTouchEnd={onStopContinuousTurn}
            className="px-3 py-3 bg-cyan-500 text-white text-sm rounded hover:bg-cyan-600 active:bg-cyan-700 transition-colors flex items-center justify-center"
            title="Turn right (Hold)"
          >
            ↷
          </button>
        )}

        {/* Empty cell */}
        <div></div>

        {/* Backward Button */}
        {controlMode === "incremental" ? (
          executingCommand?.type === "drive" &&
          executingCommand?.direction === "backward" ? (
            <button
              onClick={onStopExecutingCommand}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors flex items-center justify-center animate-pulse"
              title={`Stop backward movement (${executingCommand.originalParams?.distance}mm)`}
            >
              ⏹
            </button>
          ) : (
            <button
              onClick={() => onSendStepDrive(-distance, driveSpeed)}
              onMouseEnter={() => onUpdatePreview("drive", "backward")}
              onMouseLeave={() => onUpdatePreview(null, null)}
              className="px-3 py-3 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors flex items-center justify-center"
              title={`Backward ${distance}mm`}
              disabled={!!executingCommand}
            >
              ↓
            </button>
          )
        ) : (
          <button
            onMouseDown={() => onStartContinuousDrive("backward")}
            onMouseUp={onStopContinuousDrive}
            onMouseLeave={onStopContinuousDrive}
            onTouchStart={() => onStartContinuousDrive("backward")}
            onTouchEnd={onStopContinuousDrive}
            className="px-3 py-3 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 active:bg-orange-700 transition-colors flex items-center justify-center"
            title="Backward (Hold)"
          >
            ↓
          </button>
        )}

        {/* Empty cell */}
        <div></div>
      </div>
    </div>
  );
}
