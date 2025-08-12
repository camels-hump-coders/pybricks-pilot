import { useState, useEffect } from "react";
import { GameMatConfigSchema, type GameMatConfig } from "../schemas/GameMatConfig";
import { matConfigStorage } from "../services/matConfigStorage";

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

interface MapSelectorProps {
  currentMap: GameMatConfig | null;
  onMapChange: (config: GameMatConfig | null) => void;
  className?: string;
}

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

export function MapSelector({
  currentMap,
  onMapChange,
  className = "",
}: MapSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availableMaps] = useState<BuiltInMap[]>(BUILT_IN_MAPS);
  const [customMaps, setCustomMaps] = useState<GameMatConfig[]>([]);
  const [isLoadingCustomMaps, setIsLoadingCustomMaps] = useState(true);

  // Load custom maps from IndexedDB on mount
  useEffect(() => {
    const loadCustomMaps = async () => {
      try {
        // For now, we'll just check if there's a saved custom config
        // In the future, we could extend this to support multiple custom maps
        const savedConfig = await matConfigStorage.loadConfig();
        if (savedConfig) {
          setCustomMaps([savedConfig]);
        }
      } catch (error) {
        console.error("Failed to load custom maps:", error);
      } finally {
        setIsLoadingCustomMaps(false);
      }
    };
    loadCustomMaps();
  }, []);

  const loadBuiltInMap = (mapInfo: BuiltInMap) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      // Pass config with imageUrl and rulebookUrl for loading
      const configWithAssets = {
        ...mapInfo.config,
        imageUrl: mapInfo.imageUrl,
        rulebookUrl: mapInfo.rulebookUrl,
      };
      onMapChange(configWithAssets);
    } catch (error) {
      console.error("Error loading built-in map:", error);
      setLoadError(
        `Failed to load ${mapInfo.displayName}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadCustomMap = (customMap: GameMatConfig) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      onMapChange(customMap);
    } catch (error) {
      console.error("Error loading custom map:", error);
      setLoadError(
        `Failed to load ${customMap.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const text = await file.text();
      const rawConfig = JSON.parse(text);

      // Validate with Zod schema
      const config = GameMatConfigSchema.parse(rawConfig);

      onMapChange(config);
    } catch (error) {
      console.error("Error importing map:", error);
      setLoadError(
        `Failed to import map: ${error instanceof Error ? error.message : "Invalid file format"}`
      );
    } finally {
      setIsLoading(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const getCurrentMapDisplayName = () => {
    if (!currentMap) return "Loading...";

    const builtInMap = availableMaps.find(
      (map) => map.name === currentMap.name
    );
    return builtInMap ? builtInMap.displayName : currentMap.name;
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Game Mat Selection
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Current:{" "}
          <span className="font-medium">{getCurrentMapDisplayName()}</span>
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Built-in Maps */}
        <div>
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
            Official FLL Seasons
          </h4>
          <div className="space-y-2">
            {availableMaps.map((mapInfo) => (
              <button
                key={mapInfo.id}
                onClick={() => loadBuiltInMap(mapInfo)}
                disabled={isLoading}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  currentMap?.name === mapInfo.name
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="font-medium text-gray-800 dark:text-gray-200">
                  {mapInfo.displayName}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Pre-configured with scoring objects and accurate layout
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Maps */}
        {!isLoadingCustomMaps && customMaps.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Custom Maps
            </h4>
            <div className="space-y-2">
              {customMaps.map((customMap) => (
                <button
                  key={customMap.name}
                  onClick={() => loadCustomMap(customMap)}
                  disabled={isLoading}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    currentMap?.name === customMap.name
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="font-medium text-gray-800 dark:text-gray-200">
                    {customMap.name}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Custom map with {customMap.missions?.length || 0} missions
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Map Import */}
        <div>
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
            Import Custom Map
          </h4>
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
            <input
              type="file"
              accept=".json,.tar"
              onChange={handleFileImport}
              disabled={isLoading}
              className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-300 dark:hover:file:bg-blue-900/30"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Import a .json config file or .tar season pack from the Game Mat Editor
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
              Loading map...
            </span>
          </div>
        )}

        {/* Error State */}
        {loadError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex">
              <div className="text-red-400 mr-2">⚠️</div>
              <div className="text-sm text-red-700 dark:text-red-300">
                {loadError}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
