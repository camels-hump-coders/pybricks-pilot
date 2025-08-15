interface ProgramControlsProps {
  robotType: "real" | "virtual" | null;
  isFullyConnected: boolean;
  onControlHub: () => void;
  onRunLatestProgram: () => void;
  onStopProgram: () => void;
  programCount: number;
}

export function ProgramControls({
  robotType,
  isFullyConnected,
  onControlHub,
  onRunLatestProgram,
  onStopProgram,
  programCount,
}: ProgramControlsProps) {
  if (robotType !== "real") {
    return null;
  }

  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide">
        Quick Program Control
      </div>
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {isFullyConnected && (
          <button
            onClick={onControlHub}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            title="Open Hub Control Interface"
          >
            🎛️ Hub
          </button>
        )}
        {isFullyConnected && programCount > 0 && (
          <button
            onClick={onRunLatestProgram}
            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            title="Run Latest Program"
          >
            ▶️ Run
          </button>
        )}
        {isFullyConnected && (
          <button
            onClick={onStopProgram}
            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            title="Stop Current Program"
          >
            ⏹️ Stop
          </button>
        )}
      </div>
    </div>
  );
}