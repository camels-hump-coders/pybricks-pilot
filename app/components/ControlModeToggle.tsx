import { useAtomValue } from "jotai";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { missionFeatureEnabledAtom } from "../store/atoms/featureFlags";
import type { ControlMode } from "../store/atoms/gameMat";
import { isProgramRunningAtom } from "../store/atoms/programRunning";

interface ControlModeToggleProps {
  controlMode: ControlMode;
  setControlMode: (mode: ControlMode) => void;
  onEnterMissionMode: () => void;
  onExitMissionMode: () => void;
}

export function ControlModeToggle({
  controlMode,
  setControlMode,
  onEnterMissionMode,
  onExitMissionMode,
}: ControlModeToggleProps) {
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const { robotType, isConnected } = useJotaiRobotConnection();
  const missionFeatureEnabled = useAtomValue(missionFeatureEnabledAtom);
  // Require an active connection plus program running (for real robots)
  const robotControlsEnabled =
    isConnected &&
    (robotType === "virtual" || (robotType === "real" && isProgramRunning));
  const disabledReason = !isConnected
    ? "Connect to a hub to enable controls"
    : robotType === "real" && !isProgramRunning
      ? "Run a program on the hub to enable controls"
      : !robotType
        ? "Select a robot to enable controls"
        : undefined;

  const handleModeChange = (newMode: ControlMode) => {
    if (newMode === "mission" && controlMode !== "mission") {
      onEnterMissionMode();
    } else if (controlMode === "mission" && newMode !== "mission") {
      onExitMissionMode();
    }
    setControlMode(newMode);
  };

  return (
    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 py-3">
      Control Mode
      <div className="grid grid-cols-4 gap-1 mt-1">
        <button
          type="button"
          onClick={() => handleModeChange("program")}
          className={`px-1 py-2 text-xs rounded transition-colors ${
            controlMode === "program"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
          }`}
        >
          {robotType === "real" ? "Program" : "Scoring"}
        </button>
        <button
          type="button"
          disabled={!robotControlsEnabled}
          onClick={() => handleModeChange("incremental")}
          title={!robotControlsEnabled ? disabledReason : undefined}
          className={`px-1 py-2 text-xs rounded transition-colors ${
            controlMode === "incremental"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
          }`}
        >
          Step
        </button>
        <button
          type="button"
          disabled={!robotControlsEnabled}
          onClick={() => handleModeChange("continuous")}
          title={!robotControlsEnabled ? disabledReason : undefined}
          className={`px-1 py-2 text-xs rounded transition-colors ${
            controlMode === "continuous"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
          }`}
        >
          Hold
        </button>
        {missionFeatureEnabled && (
          <button
            type="button"
            disabled={!robotControlsEnabled}
            onClick={() => handleModeChange("mission")}
            title={!robotControlsEnabled ? disabledReason : undefined}
            className={`px-1 py-2 text-xs rounded transition-colors ${
              controlMode === "mission"
                ? "bg-purple-500 text-white"
                : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
            }`}
          >
            Mission
          </button>
        )}
      </div>
      {/* Buttons above are disabled with a tooltip explaining the requirement */}
    </div>
  );
}
