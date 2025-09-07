import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";

export function HubStatusSection() {
  const { programStatus } = useJotaiRobotConnection();
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Hub Status
        </h3>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Last update:{" "}
          {programStatus?.lastStatusUpdate
            ? new Date(programStatus.lastStatusUpdate).toLocaleTimeString()
            : "Never"}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
          className={`p-3 rounded-lg border ${
            programStatus?.statusFlags?.userProgramRunning
              ? "bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700"
              : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {programStatus?.statusFlags?.userProgramRunning ? "▶️" : "⏸️"}
            </span>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Program
              </div>
              <div
                className={`font-medium text-sm ${
                  programStatus?.statusFlags?.userProgramRunning
                    ? "text-green-800 dark:text-green-300"
                    : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {programStatus?.statusFlags?.userProgramRunning
                  ? "Running"
                  : "Stopped"}
              </div>
            </div>
          </div>
        </div>

        <div
          className={`p-3 rounded-lg border ${
            programStatus?.statusFlags?.batteryCritical
              ? "bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700"
              : programStatus?.statusFlags?.batteryLowWarning
                ? "bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-gray-700"
                : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {programStatus?.statusFlags?.batteryCritical
                ? "🔴"
                : programStatus?.statusFlags?.batteryLowWarning
                  ? "🟡"
                  : "🟢"}
            </span>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Battery
              </div>
              <div
                className={`font-medium text-sm ${
                  programStatus?.statusFlags?.batteryCritical
                    ? "text-red-800 dark:text-red-300"
                    : programStatus?.statusFlags?.batteryLowWarning
                      ? "text-yellow-800 dark:text-yellow-300"
                      : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {programStatus?.statusFlags?.batteryCritical
                  ? "Critical"
                  : programStatus?.statusFlags?.batteryLowWarning
                    ? "Low"
                    : "OK"}
              </div>
            </div>
          </div>
        </div>

        <div
          className={`p-3 rounded-lg border ${
            programStatus?.statusFlags?.powerButtonPressed
              ? "bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700"
              : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {programStatus?.statusFlags?.powerButtonPressed ? "⏻" : "🔋"}
            </span>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Power
              </div>
              <div className="font-medium text-sm text-gray-800 dark:text-gray-200">
                {programStatus?.statusFlags?.powerButtonPressed
                  ? "Button pressed"
                  : "Normal"}
              </div>
            </div>
          </div>
        </div>

        {/* Program Time unavailable in ProgramStatus type - removed */}
      </div>
    </div>
  );
}
