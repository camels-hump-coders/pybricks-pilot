import type { ProgramStatus, TelemetryData } from "../services/pybricksHub";
import { CompetitionMat } from "./CompetitionMat";
import { DrivebaseDisplay } from "./DrivebaseDisplay";
import { IMUDisplay } from "./IMUDisplay";
import { MotorStatus } from "./MotorStatus";
import { ProgramOutputLog } from "./ProgramOutputLog";
import { SensorDisplay } from "./SensorDisplay";

interface TelemetryDashboardProps {
  telemetryData?: TelemetryData | null;
  programStatus?: ProgramStatus;
  isConnected: boolean;
  programOutputLog: string[];
  onClearProgramOutput: () => void;
  onResetTelemetry?: () => void;
  className?: string;
}

export function TelemetryDashboard({
  telemetryData,
  programStatus,
  isConnected,
  programOutputLog,
  onClearProgramOutput,
  onResetTelemetry,
  className = "",
}: TelemetryDashboardProps) {
  if (!isConnected) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center ${className}`}>
        <div className="text-gray-400 dark:text-gray-500 text-4xl mb-2">📶</div>
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300 mb-2">
          No Hub Connected
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Connect to a Pybricks hub to view telemetry data
        </p>
      </div>
    );
  }

  const lastUpdate = telemetryData?.timestamp
    ? new Date(telemetryData.timestamp).toLocaleTimeString()
    : "Never";

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Competition Mat - Full Width */}
      <CompetitionMat
        telemetryData={telemetryData}
        isConnected={isConnected}
        onResetTelemetry={onResetTelemetry}
      />

      {/* Main telemetry grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Motors and sensors column */}
        <div className="space-y-6">
          <MotorStatus motorData={telemetryData?.motors} />
          <SensorDisplay sensorData={telemetryData?.sensors} />
          <DrivebaseDisplay drivebaseData={telemetryData?.drivebase} />
        </div>

        {/* Hub data column */}
        <div className="space-y-6">
          <IMUDisplay hubData={telemetryData?.hub} />
          
          {/* Program Output Log */}
          <ProgramOutputLog
            outputLog={programOutputLog}
            onClear={onClearProgramOutput}
          />

          {/* Additional data display */}
          {false && telemetryData && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Raw Data</h4>
              <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded overflow-x-auto">
                {JSON.stringify(telemetryData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* No data state */}
      {isConnected && !telemetryData && (
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 text-center">
          <div className="text-yellow-600 dark:text-yellow-400 text-2xl mb-2">⚠️</div>
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-300 mb-2">
            Waiting for Data
          </h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            Hub is connected but no telemetry data is being received. Make sure
            your program is sending telemetry data.
          </p>
        </div>
      )}

      {/* Hub Status Section */}
      {programStatus?.statusFlags && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Hub Status</h3>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Last update:{" "}
              {programStatus.lastStatusUpdate
                ? new Date(programStatus.lastStatusUpdate).toLocaleTimeString()
                : "Never"}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Program Status */}
            <div
              className={`p-3 rounded-lg border ${
                programStatus.statusFlags.userProgramRunning
                  ? "bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700"
                  : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {programStatus.statusFlags.userProgramRunning ? "▶️" : "⏸️"}
                </span>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Program</div>
                  <div
                    className={`font-medium text-sm ${
                      programStatus.statusFlags.userProgramRunning
                        ? "text-green-800 dark:text-green-300"
                        : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {programStatus.statusFlags.userProgramRunning
                      ? "Running"
                      : "Stopped"}
                  </div>
                </div>
              </div>
            </div>

            {/* Battery Status */}
            <div
              className={`p-3 rounded-lg border ${
                programStatus.statusFlags.batteryCritical
                  ? "bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700"
                  : programStatus.statusFlags.batteryLowWarning
                    ? "bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700"
                    : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🔋</span>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Battery</div>
                  <div
                    className={`font-medium text-sm ${
                      programStatus.statusFlags.batteryCritical
                        ? "text-red-800 dark:text-red-300"
                        : programStatus.statusFlags.batteryLowWarning
                          ? "text-yellow-800 dark:text-yellow-300"
                          : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {programStatus.statusFlags.batteryCritical
                      ? "Critical"
                      : programStatus.statusFlags.batteryLowWarning
                        ? "Low"
                        : "OK"}
                  </div>
                </div>
              </div>
            </div>

            {/* BLE Status */}
            <div
              className={`p-3 rounded-lg border ${
                programStatus.statusFlags.bleAdvertising
                  ? "bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700"
                  : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">📡</span>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Bluetooth</div>
                  <div
                    className={`font-medium text-sm ${
                      programStatus.statusFlags.bleAdvertising
                        ? "text-blue-800 dark:text-blue-300"
                        : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {programStatus.statusFlags.bleAdvertising
                      ? "Advertising"
                      : "Connected"}
                  </div>
                </div>
              </div>
            </div>

            {/* Power Status */}
            <div
              className={`p-3 rounded-lg border ${
                programStatus.statusFlags.shutdownPending
                  ? "bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700"
                  : programStatus.statusFlags.powerButtonPressed
                    ? "bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700"
                    : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Power</div>
                  <div
                    className={`font-medium text-sm ${
                      programStatus.statusFlags.shutdownPending
                        ? "text-red-800 dark:text-red-300"
                        : programStatus.statusFlags.powerButtonPressed
                          ? "text-yellow-800 dark:text-yellow-300"
                          : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {programStatus.statusFlags.shutdownPending
                      ? "Shutting Down"
                      : programStatus.statusFlags.powerButtonPressed
                        ? "Button Pressed"
                        : "Normal"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional status info */}
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">Raw Status Code:</span>
              <span className="font-mono bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                0x
                {programStatus.rawStatusCode
                  ?.toString(16)
                  .padStart(2, "0")
                  .toUpperCase()}{" "}
                ({programStatus.rawStatusCode})
              </span>
            </div>
            {programStatus.statusFlags.batteryHighCurrent && (
              <div className="mt-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900 p-2 rounded">
                ⚠️ High current draw detected - check for motor stalls
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
