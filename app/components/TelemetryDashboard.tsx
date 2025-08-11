import { useState, useEffect } from "react";
import type { ProgramStatus, TelemetryData } from "../services/pybricksHub";
import { matConfigStorage } from "../services/matConfigStorage";
import { EnhancedCompetitionMat } from "./EnhancedCompetitionMat";
import { GameMatEditor } from "./GameMatEditor";
import { GameMatConfigSchema, type GameMatConfig } from "../schemas/GameMatConfig";
import { MapSelector } from "./MapSelector";
import { DrivebaseDisplay } from "./DrivebaseDisplay";
import { IMUDisplay } from "./IMUDisplay";
import { MotorStatus } from "./MotorStatus";
import { ProgramOutputLog } from "./ProgramOutputLog";
import { SensorDisplay } from "./SensorDisplay";
import { CompactRobotController } from "./CompactRobotController";
import { telemetryHistory } from "../services/telemetryHistory";

// Load built-in maps using the same logic as MapSelector
const seasonConfigs = import.meta.glob("../assets/seasons/**/config.json", {
  eager: true,
});
const seasonMats = import.meta.glob("../assets/seasons/**/mat.png", {
  query: "?url",
  eager: true,
});
const seasonRulebooks = import.meta.glob("../assets/seasons/**/rulebook.pdf", {
  query: "?url",
  eager: true,
});

interface BuiltInMap {
  id: string;
  name: string;
  displayName: string;
  config: GameMatConfig;
  imageUrl: string;
  rulebookUrl?: string;
}

const BUILT_IN_MAPS: BuiltInMap[] = [];
for (const [configPath, rawConfig] of Object.entries(seasonConfigs)) {
  try {
    const id = configPath.split("/").at(-2);
    const matPath = configPath.replace("config.json", "mat.png");
    const rulebookPath = configPath.replace("config.json", "rulebook.pdf");
    const imageUrl = seasonMats[matPath]?.default;
    const rulebookUrl = seasonRulebooks[rulebookPath]?.default;
    
    if (!id || !imageUrl) {
      console.warn(`Skipping incomplete season config: ${configPath}`);
      continue;
    }
    
    // Validate config with Zod schema
    const config = GameMatConfigSchema.parse(rawConfig);
    
    BUILT_IN_MAPS.push({
      id,
      name: id,
      displayName: config.displayName || config.name,
      config,
      imageUrl,
      rulebookUrl,
    });
  } catch (error) {
    console.error(`Failed to load season config ${configPath}:`, error);
  }
}

// Get the default unearthed map
const getDefaultUnearthedMap = (): GameMatConfig | null => {
  const unearthedMap = BUILT_IN_MAPS.find(map => map.id === 'unearthed');
  if (unearthedMap) {
    return {
      ...unearthedMap.config,
      imageUrl: unearthedMap.imageUrl,
      rulebookUrl: unearthedMap.rulebookUrl,
    };
  }
  return null;
};

interface TelemetryDashboardProps {
  telemetryData?: TelemetryData | null;
  programStatus?: ProgramStatus;
  isConnected: boolean;
  programOutputLog: string[];
  onClearProgramOutput: () => void;
  onResetTelemetry?: () => void;
  className?: string;
  // Robot control props
  onDriveCommand?: (direction: number, speed: number) => Promise<void>;
  onTurnCommand?: (angle: number, speed: number) => Promise<void>;
  onStopCommand?: () => Promise<void>;
  onContinuousDriveCommand?: (speed: number, turnRate: number) => Promise<void>;
  onCustomCommand?: (command: string) => Promise<void>;
  onMotorCommand?: (motor: string, angle: number, speed: number) => Promise<void>;
  onContinuousMotorCommand?: (motor: string, speed: number) => Promise<void>;
  onMotorStopCommand?: (motor: string) => Promise<void>;
}

export function TelemetryDashboard({
  telemetryData,
  programStatus,
  isConnected,
  programOutputLog,
  onClearProgramOutput,
  onResetTelemetry,
  className = "",
  onDriveCommand,
  onTurnCommand,
  onStopCommand,
  onContinuousDriveCommand,
  onCustomCommand,
  onMotorCommand,
  onContinuousMotorCommand,
  onMotorStopCommand,
}: TelemetryDashboardProps) {
  const [showMatEditor, setShowMatEditor] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [matEditorMode, setMatEditorMode] = useState<'edit' | 'new'>('edit');
  const [customMatConfig, setCustomMatConfig] = useState<GameMatConfig | null>(null);
  const [showScoring, setShowScoring] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  // Load saved config from IndexedDB on mount, or use default
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await matConfigStorage.loadConfig();
        if (config) {
          setCustomMatConfig(config);
          setShowScoring(true);
        } else {
          // Load default unearthed config if no saved config
          const defaultMap = getDefaultUnearthedMap();
          if (defaultMap) {
            handleMapChange(defaultMap);
          }
        }
      } catch (error) {
        console.error("Failed to load mat configuration:", error);
        // Fallback to default unearthed config
        const defaultMap = getDefaultUnearthedMap();
        if (defaultMap) {
          handleMapChange(defaultMap);
        }
      } finally {
        setIsLoadingConfig(false);
      }
    };
    loadConfig();
  }, []);

  const handleSaveMatConfig = async (config: GameMatConfig) => {
    try {
      await matConfigStorage.saveConfig(config);
      setCustomMatConfig(config);
      setShowMatEditor(false);
      setShowScoring(true);
    } catch (error) {
      console.error("Failed to save mat configuration:", error);
      // Still set the config in memory even if storage fails
      setCustomMatConfig(config);
      setShowMatEditor(false);
      setShowScoring(true);
    }
  };

  const handleMapChange = async (config: GameMatConfig | null) => {
    if (config) {
      try {
        await matConfigStorage.saveConfig(config);
        setCustomMatConfig(config);
        setShowScoring(true);
      } catch (error) {
        console.error("Failed to save map configuration:", error);
        // Still set the config in memory even if storage fails
        setCustomMatConfig(config);
        setShowScoring(true);
      }
    } else {
      // Use default unearthed config
      try {
        await matConfigStorage.deleteConfig();
      } catch (error) {
        console.error("Failed to reset to default:", error);
      }
      const defaultMap = getDefaultUnearthedMap();
      if (defaultMap) {
        handleMapChange(defaultMap);
      }
    }
    setCurrentScore(0);
  };

  const handleClearCustomMat = async () => {
    try {
      await matConfigStorage.deleteConfig();
    } catch (error) {
      console.error("Failed to delete mat configuration:", error);
    }
    const defaultMap = getDefaultUnearthedMap();
    if (defaultMap) {
      handleMapChange(defaultMap);
    }
    setShowScoring(true);
    setCurrentScore(0);
  };

  // Automatic recording based on program status
  useEffect(() => {
    if (!programStatus) return;
    
    if (programStatus.running) {
      telemetryHistory.onProgramStart();
    } else {
      telemetryHistory.onProgramStop();
    }
  }, [programStatus?.running]);

  // Handle telemetry reset (mat reset)
  const handleTelemetryReset = () => {
    telemetryHistory.onMatReset();
    onResetTelemetry?.();
  };
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


  return (
    <div className={`space-y-6 ${className}`}>
      {/* Mat Editor Modal */}
      {showMatEditor && (
        <GameMatEditor
          onSave={handleSaveMatConfig}
          onCancel={() => setShowMatEditor(false)}
          initialConfig={matEditorMode === 'edit' ? (customMatConfig || undefined) : undefined}
        />
      )}

      {/* Map Selector Modal */}
      {showMapSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden mx-4">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                Select Game Mat
              </h2>
              <button
                onClick={() => setShowMapSelector(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <span className="text-xl text-gray-500">×</span>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-4rem)]">
              <MapSelector
                currentMap={customMatConfig}
                onMapChange={(config) => {
                  handleMapChange(config);
                  setShowMapSelector(false); // Close modal after selection
                }}
                className="border-0 shadow-none rounded-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Map and Controls Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Competition Mat - Takes up 3/4 of the width */}
        <div className="lg:col-span-3">
          <EnhancedCompetitionMat
            telemetryData={telemetryData || null}
            customMatConfig={customMatConfig}
            showScoring={showScoring}
            onScoreUpdate={setCurrentScore}
            isConnected={isConnected}
            onResetTelemetry={handleTelemetryReset}
          />
        </div>

        {/* Right Sidebar - Robot Controls and Mat Controls */}
        <div className="lg:col-span-1 space-y-4">
          {/* Robot Controls */}
          <CompactRobotController
            onDriveCommand={onDriveCommand}
            onTurnCommand={onTurnCommand}
            onStopCommand={onStopCommand}
            onContinuousDriveCommand={onContinuousDriveCommand}
            onMotorCommand={onMotorCommand}
            onContinuousMotorCommand={onContinuousMotorCommand}
            onMotorStopCommand={onMotorStopCommand}
            telemetryData={telemetryData}
            isConnected={isConnected}
          />

          {/* Mat Controls Panel */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Mat Controls
              </h3>
            </div>
            <div className="p-3 space-y-3">
              {/* Current Mat Info */}
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Current: <span className="font-medium text-gray-800 dark:text-gray-200">
                  {customMatConfig ? customMatConfig.name : "Loading..."}
                </span>
              </div>

              {/* Map Selection/Creation Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowMapSelector(true)}
                  disabled={isLoadingConfig}
                  className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🗺️ Select Map
                </button>
                <button
                  onClick={() => {
                    setMatEditorMode('edit');
                    setShowMatEditor(true);
                  }}
                  disabled={!customMatConfig || isLoadingConfig}
                  className="w-full px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✏️ Edit Mat
                </button>
                <button
                  onClick={() => {
                    setMatEditorMode('new');
                    setShowMatEditor(true);
                  }}
                  className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                >
                  ➕ New Mat
                </button>
              </div>

              {/* Scoring and Mat Actions */}
              {customMatConfig && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  <button
                    onClick={() => setShowScoring(!showScoring)}
                    className={`w-full px-3 py-2 rounded text-sm transition-colors ${
                      showScoring
                        ? "bg-green-500 text-white hover:bg-green-600"
                        : "bg-gray-500 text-white hover:bg-gray-600"
                    }`}
                  >
                    {showScoring ? "🎯 Scoring On" : "🎯 Scoring Off"}
                  </button>
                  
                  {showScoring && (
                    <div className="text-center py-2 bg-gray-50 dark:bg-gray-700 rounded">
                      <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                        Score: {currentScore}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleClearCustomMat}
                    className="w-full px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                  >
                    ❌ Clear Mat
                  </button>

                  {customMatConfig.rulebookUrl && (
                    <a
                      href={customMatConfig.rulebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-3 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm text-center"
                      title="Open rulebook in new tab"
                    >
                      📖 Rulebook
                    </a>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Data Grid Below */}
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
