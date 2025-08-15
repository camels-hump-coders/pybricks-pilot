interface ControlModeToggleProps {
  controlMode: "incremental" | "continuous" | "spline";
  setControlMode: (mode: "incremental" | "continuous" | "spline") => void;
  onEnterSplineMode: () => void;
  onExitSplineMode: () => void;
}

export function ControlModeToggle({
  controlMode,
  setControlMode,
  onEnterSplineMode,
  onExitSplineMode,
}: ControlModeToggleProps) {
  const handleModeChange = (newMode: "incremental" | "continuous" | "spline") => {
    if (newMode === "spline" && controlMode !== "spline") {
      onEnterSplineMode();
    } else if (controlMode === "spline" && newMode !== "spline") {
      onExitSplineMode();
    }
    setControlMode(newMode);
  };

  return (
    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide">
      Control Mode
      <div className="grid grid-cols-3 gap-1 mt-1">
        <button
          onClick={() => handleModeChange("incremental")}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            controlMode === "incremental"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
          }`}
        >
          Step
        </button>
        <button
          onClick={() => handleModeChange("continuous")}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            controlMode === "continuous"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
          }`}
        >
          Hold
        </button>
        <button
          onClick={() => handleModeChange("spline")}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            controlMode === "spline"
              ? "bg-purple-500 text-white"
              : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
          }`}
        >
          Spline
        </button>
      </div>
    </div>
  );
}