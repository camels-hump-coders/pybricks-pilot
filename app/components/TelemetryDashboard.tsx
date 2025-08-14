import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useCmdKey } from "../hooks/useCmdKey";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import {
  GameMatConfigSchema,
  type GameMatConfig,
} from "../schemas/GameMatConfig";
import { matConfigFileSystem } from "../services/matConfigFileSystem";
import type { ProgramStatus } from "../services/pybricksHub";
import {
  createMatConfigAtom,
  discoverMatConfigsAtom,
  saveMatConfigAtom,
} from "../store/atoms/configFileSystem";
import { hasDirectoryAccessAtom } from "../store/atoms/fileSystem";
import {
  calculateRobotPositionWithDimensions,
  currentScoreAtom,
  movementPreviewAtom,
  setRobotPositionAtom,
} from "../store/atoms/gameMat";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import {
  robotBuilderOpenAtom,
  robotConfigAtom,
  setActiveRobotAtom,
} from "../store/atoms/robotConfigSimplified";
import { CompactRobotController } from "./CompactRobotController";
import { DrivebaseDisplay } from "./DrivebaseDisplay";
import { EnhancedCompetitionMat } from "./EnhancedCompetitionMat";
import { GameMatEditor } from "./GameMatEditor";
import { IMUDisplay } from "./IMUDisplay";
import { MapSelector } from "./MapSelector";
import { MotorStatus } from "./MotorStatus";
import { ProgramOutputLog } from "./ProgramOutputLog";
import { RobotBuilder } from "./RobotBuilder";
import { SensorDisplay } from "./SensorDisplay";

// Load built-in maps using the same logic as MapSelector
const seasonConfigs = import.meta.glob("../assets/seasons/**/config.json", {
  eager: true,
});
const seasonMats = import.meta.glob("../assets/seasons/**/mat.png", {
  query: "?url",
  eager: true,
}) as Record<string, { default: string }>;
const seasonRulebooks = import.meta.glob("../assets/seasons/**/rulebook.pdf", {
  query: "?url",
  eager: true,
}) as Record<string, { default: string }>;

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
  const unearthedMap = BUILT_IN_MAPS.find((map) => map.id === "unearthed");
  if (unearthedMap) {
    return {
      ...unearthedMap.config,
      imageUrl: unearthedMap.imageUrl,
      rulebookUrl: unearthedMap.rulebookUrl,
    };
  }
  return null;
};

// Sub-component for Mat Controls Panel
interface MatControlsPanelProps {
  customMatConfig: GameMatConfig | null;
  isLoadingConfig: boolean;
  showScoring: boolean;
  currentScore: number;
  onMapSelectorOpen: () => void;
  onMatEditorOpen: (mode: "edit" | "new") => void;
  onScoringToggle: () => void;
  onClearMat: () => void;
}

function MatControlsPanel({
  customMatConfig,
  isLoadingConfig,
  showScoring,
  currentScore,
  onMapSelectorOpen,
  onMatEditorOpen,
  onScoringToggle,
  onClearMat,
}: MatControlsPanelProps) {
  // Use Jotai atom directly instead of prop
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
      <div className="p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Mat Controls
        </h3>
      </div>
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
        {/* Current Mat Info */}
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Current:{" "}
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {customMatConfig ? customMatConfig.name : "Loading..."}
          </span>
        </div>

        {/* Map Selection/Creation Buttons */}
        <div className="space-y-2">
          <button
            onClick={onMapSelectorOpen}
            disabled={isLoadingConfig}
            className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🗺️ Select Mat
          </button>

          {hasDirectoryAccess ? (
            <>
              <button
                onClick={() => onMatEditorOpen("edit")}
                disabled={!customMatConfig || isLoadingConfig}
                className="w-full px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  !customMatConfig ? "Select a map first" : "Edit current map"
                }
              >
                ✏️ Edit Mat
              </button>
              <button
                onClick={() => onMatEditorOpen("new")}
                className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
              >
                ➕ New Mat
              </button>
            </>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400">📁</span>
                <div className="text-sm text-yellow-700 dark:text-yellow-300">
                  <div className="font-medium">
                    Mount a directory to create or edit mats
                  </div>
                  <div className="text-xs mt-1 text-yellow-600 dark:text-yellow-400">
                    Mat configurations are saved to{" "}
                    <code className="font-mono">
                      ./config/mats/&lt;id&gt;/mat.json
                    </code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scoring and Mat Actions */}
        {customMatConfig && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <button
              onClick={onScoringToggle}
              className={`w-full px-3 py-2 rounded text-sm transition-colors ${
                showScoring
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-gray-500 text-white hover:bg-gray-600"
              }`}
            >
              {showScoring ? "🎯 Scoring On" : "🎯 Scoring Off"}
            </button>

            <button
              onClick={onClearMat}
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
  );
}

// Sub-component for Robot Controls Section
interface RobotControlsSectionProps {
  onDriveCommand: (direction: number, speed: number) => Promise<void>;
  onTurnCommand: (angle: number, speed: number) => Promise<void>;
  onStopCommand: () => Promise<void>;
  onContinuousDriveCommand: (speed: number, turnRate: number) => Promise<void>;
  onMotorCommand: (
    motor: string,
    angle: number,
    speed: number
  ) => Promise<void>;
  onContinuousMotorCommand: (motor: string, speed: number) => Promise<void>;
  onMotorStopCommand: (motor: string) => Promise<void>;
  telemetryData?: any;
  isConnected: boolean;
  robotType?: "real" | "virtual" | null;
  onStopProgram?: () => Promise<void>;
  onUploadAndRunFile?: (
    file: any,
    content: string,
    availableFiles: any[]
  ) => Promise<void>;
  isUploading?: boolean;
  debugEvents?: any[];
  isCmdKeyPressed: boolean;
  onRobotBuilderOpen: () => void;
  customMatConfig?: any | null; // Add mat config as prop
  onResetTelemetry?: () => Promise<void>; // Add reset telemetry function
}

function RobotControlsSection({
  onDriveCommand,
  onTurnCommand,
  onStopCommand,
  onContinuousDriveCommand,
  onMotorCommand,
  onContinuousMotorCommand,
  onMotorStopCommand,
  telemetryData,
  isConnected,
  robotType,
  onStopProgram,
  onUploadAndRunFile,
  isUploading,
  debugEvents,
  isCmdKeyPressed,
  onRobotBuilderOpen,
  customMatConfig,
  onResetTelemetry,
}: RobotControlsSectionProps) {
  // Use Jotai atoms directly instead of prop drilling
  const [, setMovementPreview] = useAtom(movementPreviewAtom);
  const currentRobotConfig = useAtomValue(robotConfigAtom);
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  return (
    <div className="space-y-4">
      {/* Active Robot Panel with Customize Button */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Active Robot:
        </div>
        <div className="font-medium text-gray-900 dark:text-white text-sm">
          {currentRobotConfig.name}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {currentRobotConfig.dimensions.width}×
          {currentRobotConfig.dimensions.length} studs (
          {currentRobotConfig.dimensions.width * 8}×
          {currentRobotConfig.dimensions.length * 8}mm)
        </div>

        {/* Customize Robot Button/Info */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          {hasDirectoryAccess ? (
            <button
              onClick={onRobotBuilderOpen}
              className="w-full px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
            >
              🧱 Customize Robot
            </button>
          ) : (
            <div className="flex items-start gap-2">
              <span className="text-yellow-600 dark:text-yellow-400 text-xs">
                📁
              </span>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                <div>Mount a directory to customize robot</div>
                <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-500">
                  Configs saved to{" "}
                  <code className="font-mono text-xs">./config/robots/</code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
        // Robot position automatically available via Jotai in CompactRobotController
        onPreviewUpdate={setMovementPreview}
        robotType={robotType}
        onStopProgram={onStopProgram}
        onUploadAndRunFile={onUploadAndRunFile}
        isUploading={isUploading}
        debugEvents={debugEvents}
        isCmdKeyPressed={isCmdKeyPressed}
        customMatConfig={customMatConfig}
        onResetTelemetry={onResetTelemetry}
      />
    </div>
  );
}

// Sub-component for Hub Status Section
interface HubStatusSectionProps {
  programStatus?: ProgramStatus;
}

function HubStatusSection({ programStatus }: HubStatusSectionProps) {
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
        {/* Program Status */}
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

        {/* Battery Status */}
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

        {/* Power Status */}
        <div
          className={`p-3 rounded-lg border ${
            programStatus?.statusFlags?.powerButtonPressed
              ? "bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700"
              : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {programStatus?.statusFlags?.powerButtonPressed ? "⚡" : "🔋"}
            </span>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Power
              </div>
              <div
                className={`font-medium text-sm ${
                  programStatus?.statusFlags?.powerButtonPressed
                    ? "text-yellow-800 dark:text-yellow-300"
                    : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {programStatus?.statusFlags?.powerButtonPressed
                  ? "Button Pressed"
                  : "Normal"}
              </div>
            </div>
          </div>
        </div>

        {/* Bluetooth Status */}
        <div
          className={`p-3 rounded-lg border ${
            programStatus?.statusFlags?.bleAdvertising
              ? "bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700"
              : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {programStatus?.statusFlags?.bleAdvertising ? "📶" : "📴"}
            </span>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Bluetooth
              </div>
              <div
                className={`font-medium text-sm ${
                  programStatus?.statusFlags?.bleAdvertising
                    ? "text-green-800 dark:text-green-300"
                    : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {programStatus?.statusFlags?.bleAdvertising
                  ? "Advertising"
                  : "Connected"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TelemetryDashboard({ className = "" }: { className?: string }) {
  // Use Jotai robot connection hook directly instead of prop drilling
  const robotConnection = useJotaiRobotConnection();
  const {
    telemetryData,
    programStatus,
    isConnected,
    programOutputLog,
    clearProgramOutputLog,
    robotType,
    sendDriveCommand,
    sendTurnCommand,
    sendStopCommand,
    sendContinuousDriveCommand,
    sendMotorCommand,
    sendContinuousMotorCommand,
    sendMotorStopCommand,
    runProgram,
    stopProgram,
    uploadAndRunHubMenu,
    isUploadingProgram,
    debugEvents,
    resetTelemetry,
  } = robotConnection;

  // Get file system data for program list
  const { allPrograms, pythonFiles } = useJotaiFileSystem();

  // Create a smart upload function that uses hub menu when there are numbered programs
  const handleUploadAndRun = async (
    file: any,
    content: string,
    availableFiles: any[]
  ) => {
    // allPrograms already contains numbered programs with programNumber
    // No need to filter since allPrograms is already the numbered programs list
    if (allPrograms.length > 0 && uploadAndRunHubMenu) {
      // Use hub menu upload when there are numbered programs
      console.log(
        "[TelemetryDashboard] Using hub menu upload for",
        allPrograms.length,
        "programs"
      );
      await uploadAndRunHubMenu(allPrograms, pythonFiles);
    } else {
      throw new Error("No upload method available");
    }
  };
  const [showMatEditor, setShowMatEditor] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [matEditorMode, setMatEditorMode] = useState<"edit" | "new">("edit");
  const [customMatConfig, setCustomMatConfig] = useState<GameMatConfig | null>(
    null
  );
  const [showScoring, setShowScoring] = useState(false);
  // Use Jotai for current score instead of local state
  const currentScore = useAtomValue(currentScoreAtom);
  const [robotBuilderOpen, setRobotBuilderOpen] = useAtom(robotBuilderOpenAtom);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const setActiveRobot = useSetAtom(setActiveRobotAtom);
  const currentRobotConfig = useAtomValue(robotConfigAtom);

  // Filesystem-based configuration atoms
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const createMatConfig = useSetAtom(createMatConfigAtom);
  const saveMatConfig = useSetAtom(saveMatConfigAtom);
  const discoverMats = useSetAtom(discoverMatConfigsAtom);

  // Use Jotai atoms for movement preview and robot position
  const [movementPreview, setMovementPreview] = useAtom(movementPreviewAtom);
  const setRobotPosition = useSetAtom(setRobotPositionAtom);

  // Use CMD key detection hook
  const isCmdKeyPressed = useCmdKey();

  // Always start with default unearthed mat, don't auto-load custom configs
  useEffect(() => {
    const loadDefaultMat = () => {
      const defaultMap = getDefaultUnearthedMap();
      if (defaultMap) {
        setCustomMatConfig(defaultMap);
        setShowScoring(true);
      }
      setIsLoadingConfig(false);
    };
    loadDefaultMat();
  }, [setRobotPosition]);

  useEffect(() => {
    if (currentRobotConfig && customMatConfig) {
      // Set robot to bottom-right position using the correct mat dimensions
      const initialPosition = calculateRobotPositionWithDimensions(
        currentRobotConfig,
        "bottom-right",
        customMatConfig.dimensions?.widthMm || 2356,
        customMatConfig.dimensions?.heightMm || 1137
      );
      setRobotPosition(initialPosition);
    }
  }, [currentRobotConfig, customMatConfig, setRobotPosition]);

  const handleSaveMatConfig = async (config: GameMatConfig) => {
    if (!hasDirectoryAccess) {
      console.error("No directory mounted - cannot save mat configuration");
      // Fall back to in-memory only
      setCustomMatConfig(config);
      setShowMatEditor(false);
      setShowScoring(true);
      return;
    }

    try {
      if (matEditorMode === "new") {
        // Create new mat configuration
        const matId = await createMatConfig({ name: config.name, config });
        console.log(`Created new mat configuration with ID: ${matId}`);
      } else {
        // For editing, we need to determine the mat ID
        // For now, generate ID from name (in future, we'd track the current mat ID)
        const matId = matConfigFileSystem.generateMatId(config.name);
        await saveMatConfig({ matId, config });
        console.log(`Saved mat configuration with ID: ${matId}`);
      }

      setCustomMatConfig(config);
      setShowMatEditor(false);
      setShowScoring(true);

      // Refresh mat discovery to show the new/updated mat
      discoverMats();
    } catch (error) {
      console.error("Failed to save mat configuration:", error);
      // Still set the config in memory even if filesystem save fails
      setCustomMatConfig(config);
      setShowMatEditor(false);
      setShowScoring(true);
    }
  };

  const handleMapChange = async (config: GameMatConfig | null) => {
    if (config) {
      // Check if this is a built-in map (has imageUrl from assets) or a custom map
      const isBuiltInMap =
        config.imageUrl && config.imageUrl.includes("/assets/seasons/");

      if (isBuiltInMap) {
        // Built-in maps are not saved to IndexedDB, just used temporarily
        setCustomMatConfig(config);
        setShowScoring(true);
        console.log("Using built-in map:", config.name);
      } else {
        // Custom maps - just set in memory, they're already saved to filesystem via loadMatConfig
        setCustomMatConfig(config);
        setShowScoring(true);
        console.log("Using custom map from filesystem:", config.name);
      }

      // Set robot to bottom-right position using the new mat dimensions
      const initialPosition = calculateRobotPositionWithDimensions(
        currentRobotConfig,
        "bottom-right",
        config.dimensions?.widthMm || 2356,
        config.dimensions?.heightMm || 1137
      );
      setRobotPosition(initialPosition);
    } else {
      // Clear the current map configuration (just in memory, don't delete from filesystem)
      console.log("Clearing current map configuration");
      setCustomMatConfig(null);
      setShowScoring(false);
    }

    // Robot position is automatically set above when mat is changed
  };

  const handleClearCustomMat = async () => {
    // Just clear in-memory state - filesystem configurations are managed elsewhere
    console.log("Clearing custom mat configuration from memory");

    // Always fall back to the default unearthed mat
    const defaultMap = getDefaultUnearthedMap();
    if (defaultMap) {
      setCustomMatConfig(defaultMap);
      setShowScoring(true);

      // Set robot to bottom-right position using the default mat dimensions
      const initialPosition = calculateRobotPositionWithDimensions(
        currentRobotConfig,
        "bottom-right",
        defaultMap.dimensions?.widthMm || 2356,
        defaultMap.dimensions?.heightMm || 1137
      );
      setRobotPosition(initialPosition);
    } else {
      setCustomMatConfig(null);
      setShowScoring(false);
    }
    // Score is automatically reset via Jotai atoms
  };

  // Telemetry reset is now handled within EnhancedCompetitionMat via Jotai atoms

  // Early return if not connected
  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🔌</div>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Not Connected
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
          initialConfig={
            matEditorMode === "edit" ? customMatConfig || undefined : undefined
          }
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

      {/* Competition Mat - Full width on mobile, positioned in grid on desktop */}
      <div className="xl:hidden w-full">
        <EnhancedCompetitionMat
          customMatConfig={customMatConfig}
          showScoring={showScoring}
          isConnected={isConnected}
          controlMode="incremental"
        />
      </div>

      {/* Mobile Layout - Robot Controls below mat on mobile */}
      <div className="xl:hidden space-y-2 sm:space-y-4">
        <RobotControlsSection
          onDriveCommand={sendDriveCommand}
          onTurnCommand={sendTurnCommand}
          onStopCommand={sendStopCommand}
          onContinuousDriveCommand={sendContinuousDriveCommand}
          onMotorCommand={sendMotorCommand}
          onContinuousMotorCommand={sendContinuousMotorCommand}
          onMotorStopCommand={sendMotorStopCommand}
          telemetryData={telemetryData}
          isConnected={isConnected}
          robotType={robotType}
          onStopProgram={stopProgram}
          onUploadAndRunFile={handleUploadAndRun}
          isUploading={isUploadingProgram}
          debugEvents={debugEvents}
          isCmdKeyPressed={isCmdKeyPressed}
          onRobotBuilderOpen={() => setRobotBuilderOpen(true)}
          customMatConfig={customMatConfig}
          onResetTelemetry={resetTelemetry}
        />

        <MatControlsPanel
          customMatConfig={customMatConfig}
          isLoadingConfig={isLoadingConfig}
          showScoring={showScoring}
          currentScore={currentScore}
          onMapSelectorOpen={() => setShowMapSelector(true)}
          onMatEditorOpen={(mode) => {
            setMatEditorMode(mode);
            setShowMatEditor(true);
          }}
          onScoringToggle={() => setShowScoring(!showScoring)}
          onClearMat={handleClearCustomMat}
        />
      </div>

      {/* Desktop Layout - Mat and Controls side by side on large screens */}
      <div className="hidden xl:grid xl:grid-cols-4 gap-4">
        {/* Competition Mat - Takes up 3 columns */}
        <div className="col-span-3">
          <EnhancedCompetitionMat
            customMatConfig={customMatConfig}
            showScoring={showScoring}
            isConnected={isConnected}
            controlMode="incremental"
          />
        </div>

        {/* Right Sidebar - Robot Controls and Mat Controls */}
        <div className="col-span-1 space-y-4">
          <RobotControlsSection
            onDriveCommand={sendDriveCommand}
            onTurnCommand={sendTurnCommand}
            onStopCommand={sendStopCommand}
            onContinuousDriveCommand={sendContinuousDriveCommand}
            onMotorCommand={sendMotorCommand}
            onContinuousMotorCommand={sendContinuousMotorCommand}
            onMotorStopCommand={sendMotorStopCommand}
            telemetryData={telemetryData}
            isConnected={isConnected}
            robotType={robotType}
            onStopProgram={stopProgram}
            onUploadAndRunFile={handleUploadAndRun}
            isUploading={isUploadingProgram}
            debugEvents={debugEvents}
            isCmdKeyPressed={isCmdKeyPressed}
            onRobotBuilderOpen={() => setRobotBuilderOpen(true)}
            customMatConfig={customMatConfig}
            onResetTelemetry={resetTelemetry}
          />

          <MatControlsPanel
            customMatConfig={customMatConfig}
            isLoadingConfig={isLoadingConfig}
            showScoring={showScoring}
            currentScore={currentScore}
            onMapSelectorOpen={() => setShowMapSelector(true)}
            onMatEditorOpen={(mode) => {
              setMatEditorMode(mode);
              setShowMatEditor(true);
            }}
            onScoringToggle={() => setShowScoring(!showScoring)}
            onClearMat={handleClearCustomMat}
          />
        </div>
      </div>

      {/* Telemetry Data Grid Below */}
      {isProgramRunning && (
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
              onClear={clearProgramOutputLog}
            />
          </div>
        </div>
      )}

      {/* No program running state */}
      {isConnected && !isProgramRunning && (
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 text-center">
          <div className="text-yellow-600 dark:text-yellow-400 text-2xl mb-2">
            ⚠️
          </div>
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-300 mb-2">
            Waiting for Data
          </h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            Hub is connected but no program is currently running. Upload and run
            a program to see real-time telemetry and controls.
          </p>
        </div>
      )}

      {/* Hub Status Section */}
      <HubStatusSection programStatus={programStatus} />

      {/* Robot Builder Modal */}
      <RobotBuilder
        isOpen={robotBuilderOpen}
        onClose={() => setRobotBuilderOpen(false)}
        onRobotChange={(config) => {
          // Use the simplified atom to update robot and save preference
          setActiveRobot(config);
        }}
      />
    </div>
  );
}
