import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import {
  type GameMatConfig,
  GameMatConfigSchema,
} from "../schemas/GameMatConfig";
import { matConfigFileSystem } from "../services/matConfigFileSystem";
// Removed unused imports
import {
  createMatConfigAtom,
  discoverMatConfigsAtom,
  saveMatConfigAtom,
} from "../store/atoms/configFileSystem";
import { hasDirectoryAccessAtom } from "../store/atoms/fileSystem";
import {
  calculateRobotPositionWithDimensions,
  movementPreviewAtom,
  setRobotPositionAtom,
} from "../store/atoms/gameMat";
import {
  isMatConfigLoadingAtom,
  matEditorModeAtom,
  showMapSelectorAtom,
  showMatEditorAtom,
  showScoringAtom,
} from "../store/atoms/matUIState";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import {
  robotBuilderOpenAtom,
  robotConfigAtom,
  setActiveRobotAtom,
} from "../store/atoms/robotConfigSimplified";
import type { PythonFile } from "../types/fileSystem";
import { ActiveRobotPanel } from "./ActiveRobotPanel";
// CompactRobotController is consumed via RobotControlsSection
import { DrivebaseDisplay } from "./DrivebaseDisplay";
import { EnhancedCompetitionMat } from "./EnhancedCompetitionMat";
import { GameMatEditor } from "./GameMatEditor";
import { HubStatusSection } from "./HubStatusSection";
import { IMUDisplay } from "./IMUDisplay";
import { MapSelector } from "./MapSelector";
import { MatControlsPanel } from "./MatControlsPanel";
import { MotorStatus } from "./MotorStatus";
import { ProgramOutputLog } from "./ProgramOutputLog";
import { RobotBuilder } from "./RobotBuilder";
import { RobotControlsSection } from "./RobotControlsSection";
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

// Inline panel components moved to their own files

// Inline panel components moved to their own files

// Inline panel components moved to their own files

// Inline panel components moved to their own files

export function TelemetryDashboard({ className = "" }: { className?: string }) {
  // Use Jotai robot connection hook directly instead of prop drilling
  const robotConnection = useJotaiRobotConnection();
  const {
    telemetryData,
    isConnected,
    programOutputLog,
    clearProgramOutputLog,
    // Unused in this component: motors/program controls handled elsewhere
    uploadAndRunHubMenu,
  } = robotConnection;

  // Get file system data for program list
  const { allPrograms, pythonFiles, stableDirectoryHandle } =
    useJotaiFileSystem();

  // Create a smart upload function that uses hub menu when there are numbered programs
  const handleUploadAndRun = async (
    _file: PythonFile,
    _content: string,
    _availableFiles: PythonFile[],
  ) => {
    // allPrograms already contains numbered programs with programNumber
    // No need to filter since allPrograms is already the numbered programs list
    if (allPrograms.length > 0 && uploadAndRunHubMenu) {
      // Use hub menu upload when there are numbered programs
      console.log(
        "[TelemetryDashboard] Using hub menu upload for",
        allPrograms.length,
        "programs",
      );
      await uploadAndRunHubMenu(allPrograms, pythonFiles);
    } else {
      throw new Error("No upload method available");
    }
  };
  // Global UI atoms for map and editor dialogs
  const [showMatEditor, setShowMatEditor] = useAtom(showMatEditorAtom);
  const [showMapSelector, setShowMapSelector] = useAtom(showMapSelectorAtom);
  const [matEditorMode, setMatEditorMode] = useAtom(matEditorModeAtom);
  // Use Jotai for custom mat config instead of local state
  const { customMatConfig, setCustomMatConfig } = useJotaiGameMat();
  const [showScoring, setShowScoring] = useAtom(showScoringAtom);
  // Use Jotai for current score instead of local state
  // currentScore used inside MatControlsPanel via atom
  const [robotBuilderOpen, setRobotBuilderOpen] = useAtom(robotBuilderOpenAtom);
  const [_isLoadingConfig, setIsLoadingConfig] = useAtom(isMatConfigLoadingAtom);
  const setActiveRobot = useSetAtom(setActiveRobotAtom);
  const currentRobotConfig = useAtomValue(robotConfigAtom);

  // Filesystem-based configuration atoms
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const createMatConfig = useSetAtom(createMatConfigAtom);
  const saveMatConfig = useSetAtom(saveMatConfigAtom);
  const discoverMats = useSetAtom(discoverMatConfigsAtom);

  // Use Jotai atoms for movement preview and robot position
  const [_movementPreview, _setMovementPreview] = useAtom(movementPreviewAtom);
  const setRobotPosition = useSetAtom(setRobotPositionAtom);

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
  }, [setCustomMatConfig, setShowScoring, setIsLoadingConfig]);

  useEffect(() => {
    if (currentRobotConfig && customMatConfig) {
      // Set robot to bottom-right position using the correct mat dimensions
      const initialPosition = calculateRobotPositionWithDimensions(
        currentRobotConfig,
        "bottom-right",
        customMatConfig.dimensions?.widthMm || 2356,
        customMatConfig.dimensions?.heightMm || 1137,
      );
      setRobotPosition(initialPosition);
    }
  }, [currentRobotConfig, customMatConfig, setRobotPosition]);

  const handleSaveMatConfig = async (
    config: GameMatConfig,
    imageFile?: File,
  ) => {
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

        // If we have an image file, save it as well
        if (imageFile && stableDirectoryHandle) {
          try {
            // Save the image file to the mat's directory
            await matConfigFileSystem.saveMatImage(
              stableDirectoryHandle,
              matId,
              imageFile,
            );
            console.log(`Saved mat image for mat: ${matId}`);
          } catch (imageError) {
            console.warn(
              "Failed to save mat image, but config was saved:",
              imageError,
            );
          }
        }
      } else {
        // For editing, we need to determine the mat ID
        // For now, generate ID from name (in future, we'd track the current mat ID)
        const matId = matConfigFileSystem.generateMatId(config.name);
        await saveMatConfig({ matId, config });
        console.log(`Saved mat configuration with ID: ${matId}`);

        // If we have an image file, update it as well
        if (imageFile && stableDirectoryHandle) {
          try {
            // Save the updated image file to the mat's directory
            await matConfigFileSystem.saveMatImage(
              stableDirectoryHandle,
              matId,
              imageFile,
            );
            console.log(`Updated mat image for mat: ${matId}`);
          } catch (imageError) {
            console.warn(
              "Failed to update mat image, but config was saved:",
              imageError,
            );
          }
        }
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
      const isBuiltInMap = config.imageUrl?.includes("/assets/seasons/");

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
        config.dimensions?.heightMm || 1137,
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
        defaultMap.dimensions?.heightMm || 1137,
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
                type="button"
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
        <EnhancedCompetitionMat />
      </div>

      {/* Mobile Layout - Robot Controls below mat on mobile */}
      <div className="xl:hidden space-y-2 sm:space-y-4">
        <RobotControlsSection onUploadAndRunFile={handleUploadAndRun} />

        <MatControlsPanel onClearMat={handleClearCustomMat} />

        {/* Active Robot moved below Mat Controls */}
        <ActiveRobotPanel
          onRobotBuilderOpen={() => setRobotBuilderOpen(true)}
        />
      </div>

      {/* Desktop Layout - Mat and Controls side by side on large screens */}
      <div className="hidden xl:grid xl:grid-cols-4 gap-4">
        {/* Competition Mat - Takes up 3 columns */}
        <div className="col-span-3">
          <EnhancedCompetitionMat />
        </div>

        {/* Right Sidebar - Robot Controls and Mat Controls */}
        <div className="col-span-1 space-y-4">
          <RobotControlsSection onUploadAndRunFile={handleUploadAndRun} />

          <MatControlsPanel onClearMat={handleClearCustomMat} />

          {/* Active Robot moved below Mat Controls */}
          <ActiveRobotPanel
            onRobotBuilderOpen={() => setRobotBuilderOpen(true)}
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
      <HubStatusSection />

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
