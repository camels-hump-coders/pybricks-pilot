import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import type { RobotConfig } from "../schemas/RobotConfig";
import {
  calculateCenterOfRotation,
  DEFAULT_ROBOT_CONFIG,
  studsToMm,
} from "../schemas/RobotConfig";
import {
  availableRobotConfigsAtom,
  createRobotConfigAtom,
  deleteRobotConfigAtom,
  discoverRobotConfigsAtom,
  duplicateRobotConfigAtom,
  loadRobotConfigAtom,
  saveRobotConfigAtom,
} from "../store/atoms/configFileSystem";
import { hasDirectoryAccessAtom } from "../store/atoms/fileSystem";

interface RobotBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onRobotChange: (config: RobotConfig) => void;
  initialConfig?: RobotConfig;
}

export function RobotBuilder({
  isOpen,
  onClose,
  onRobotChange,
  initialConfig,
}: RobotBuilderProps) {
  const [config, setConfig] = useState<RobotConfig>(
    initialConfig || DEFAULT_ROBOT_CONFIG,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { stableDirectoryAccess } = useJotaiFileSystem();

  // Use filesystem-based configuration atoms
  const savedConfigs = useAtomValue(availableRobotConfigsAtom);
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  const discoverRobots = useSetAtom(discoverRobotConfigsAtom);
  const saveRobotConfig = useSetAtom(saveRobotConfigAtom);
  const createRobotConfig = useSetAtom(createRobotConfigAtom);
  const deleteRobotConfig = useSetAtom(deleteRobotConfigAtom);
  const duplicateRobotConfig = useSetAtom(duplicateRobotConfigAtom);
  const loadRobotConfig = useSetAtom(loadRobotConfigAtom);

  // Load saved configurations
  useEffect(() => {
    discoverRobots();
  }, [discoverRobots]);

  // Discover robot configurations when directory changes
  useEffect(() => {
    if (stableDirectoryAccess) {
      discoverRobots();
    }
  }, [stableDirectoryAccess, discoverRobots]);

  // Automatically recalculate center of rotation when robot dimensions or wheel positions change
  useEffect(() => {
    const updatedCenterOfRotation = calculateCenterOfRotation(config);
    if (
      config.centerOfRotation.distanceFromLeftEdge !==
        updatedCenterOfRotation.distanceFromLeftEdge ||
      config.centerOfRotation.distanceFromTop !==
        updatedCenterOfRotation.distanceFromTop
    ) {
      setConfig((prev) => ({
        ...prev,
        centerOfRotation: updatedCenterOfRotation,
      }));
    }
  }, [
    config.dimensions.width,
    config.dimensions.length,
    config.wheels.left.distanceFromEdge,
    config.wheels.left.distanceFromTop,
  ]);

  // loadSavedConfigs and loadFromWorkingDirectory are no longer needed
  // as we use filesystem-based atoms that automatically discover configurations

  const saveConfig = async () => {
    setIsLoading(true);
    setError(null);

    if (!hasDirectoryAccess && config.id !== "default") {
      setError(
        "No directory mounted - cannot save custom robot configurations",
      );
      setIsLoading(false);
      return;
    }

    try {
      let activeRobotConfig = config;

      if (config.id === "default") {
        // Cannot save over default robot - need to create new one
        const newRobotId = await createRobotConfig({
          name: `${config.name} (Custom)`,
          config: {
            ...config,
            name: `${config.name} (Custom)`,
          },
        });
        console.log(`Created new robot configuration with ID: ${newRobotId}`);

        // Create the config object with the new ID for activation
        activeRobotConfig = {
          ...config,
          id: newRobotId,
          name: `${config.name} (Custom)`,
        };
      } else {
        // Save existing custom robot
        await saveRobotConfig({ robotId: config.id, config });
        console.log(`Saved robot configuration with ID: ${config.id}`);
      }

      // Refresh robot discovery to show the new/updated robot
      discoverRobots();

      // Notify parent of change with the correct robot ID
      onRobotChange(activeRobotConfig);

      // Close the modal on successful save
      onClose();
    } catch (error) {
      setError(`Failed to save configuration: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConfig = async (configId: string) => {
    try {
      const loadedConfig = await loadRobotConfig(configId);
      if (loadedConfig) {
        setConfig(loadedConfig);
        onRobotChange(loadedConfig);
      }
    } catch (error) {
      setError(`Failed to load configuration: ${error}`);
    }
  };

  const duplicateConfig = async () => {
    if (!hasDirectoryAccess) {
      setError("No directory mounted - cannot duplicate robot configurations");
      return;
    }

    try {
      const newName =
        config.name === "Default FLL Robot"
          ? "Custom Robot"
          : `${config.name} (Copy)`;
      const newRobotId = await duplicateRobotConfig({
        originalId: config.id,
        newName,
      });

      // Load the duplicated config
      const duplicated = await loadRobotConfig(newRobotId);
      if (duplicated) {
        setConfig(duplicated);
      }

      // Refresh robot discovery
      discoverRobots();
    } catch (error) {
      setError(`Failed to duplicate configuration: ${error}`);
    }
  };

  const deleteConfig = async () => {
    if (config.isDefault) {
      setError("Cannot delete default configuration");
      return;
    }

    if (!hasDirectoryAccess) {
      setError("No directory mounted - cannot delete robot configurations");
      return;
    }

    try {
      await deleteRobotConfig(config.id);

      // Switch to default robot after deletion
      const defaultConfig = await loadRobotConfig("default");
      if (defaultConfig) {
        setConfig(defaultConfig);
        onRobotChange(defaultConfig);
      }

      // Refresh robot discovery
      discoverRobots();
    } catch (error) {
      setError(`Failed to delete configuration: ${error}`);
    }
  };

  const handleDimensionChange = (
    dimension: "width" | "length",
    value: number,
  ) => {
    const clampedValue = Math.max(1, Math.min(50, value));
    setConfig((prev) => ({
      ...prev,
      dimensions: {
        ...prev.dimensions,
        [dimension]: clampedValue,
      },
    }));
  };

  const handleWheelChange = (
    property: "distanceFromEdge" | "distanceFromTop" | "diameter" | "width",
    value: number,
  ) => {
    setConfig((prev) => ({
      ...prev,
      wheels: {
        left: { ...prev.wheels.left, [property]: value },
        right: { ...prev.wheels.right, [property]: value },
      },
    }));
  };

  const handleAppearanceChange = (
    property: keyof RobotConfig["appearance"],
    value: any,
  ) => {
    setConfig((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        [property]: value,
      },
    }));
  };

  // Simple robot preview component
  const RobotPreview = () => {
    const scale = 3; // pixels per stud
    const robotWidth = config.dimensions.width * scale;
    const robotHeight = config.dimensions.length * scale;

    return (
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Robot Preview
        </h4>
        <div
          className="relative"
          style={{ width: robotWidth, height: robotHeight }}
        >
          {/* Robot body */}
          <div
            className="absolute border-2 border-gray-600 bg-white dark:bg-gray-700"
            style={{
              width: robotWidth,
              height: robotHeight,
              backgroundColor: config.appearance.primaryColor,
            }}
          />

          {/* Direction arrow */}
          <div
            className="absolute top-2 left-1/2 transform -translate-x-1/2"
            style={{ color: config.appearance.secondaryColor }}
          >
            ▲
          </div>

          {/* Left wheel */}
          <div
            className="absolute bg-gray-800 rounded-full border-2 border-gray-600"
            style={{
              width: (config.wheels.left.width * scale) / 4,
              height: (config.wheels.left.width * scale) / 4,
              left: config.wheels.left.distanceFromEdge * scale,
              top: config.wheels.left.distanceFromTop * scale, // Y=0 at top, Y+ down
              transform: "translate(-50%, -50%)",
            }}
          />

          {/* Right wheel */}
          <div
            className="absolute bg-gray-800 rounded-full border-2 border-gray-600"
            style={{
              width: (config.wheels.right.width * scale) / 4,
              height: (config.wheels.right.width * scale) / 4,
              left:
                (config.dimensions.width -
                  config.wheels.right.distanceFromEdge) *
                scale,
              top: config.wheels.right.distanceFromTop * scale, // Y=0 at top, Y+ down
              transform: "translate(-50%, -50%)",
            }}
          />

          {/* Center of rotation indicator (auto-calculated) */}
          <div
            className="absolute w-2 h-2 bg-red-500 rounded-full"
            style={{
              left: (config.dimensions.width / 2) * scale,
              top: config.wheels.left.distanceFromTop * scale, // Y=0 at top, Y+ down
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>

        {/* Measurements */}
        <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>
            Width: {config.dimensions.width} studs (
            {studsToMm(config.dimensions.width)}mm)
          </div>
          <div>
            Length: {config.dimensions.length} studs (
            {studsToMm(config.dimensions.length)}mm)
          </div>
          <div>
            Wheel distance from top: {config.wheels.left.distanceFromTop} studs
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Robot Builder
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={duplicateConfig}
              disabled={isLoading || !hasDirectoryAccess}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              title={
                !hasDirectoryAccess
                  ? "Mount a directory to duplicate robots"
                  : ""
              }
            >
              Duplicate
            </button>
            <button
              onClick={saveConfig}
              disabled={
                isLoading || (!hasDirectoryAccess && config.id !== "default")
              }
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              title={
                !hasDirectoryAccess && config.id !== "default"
                  ? "Mount a directory to save custom robots"
                  : ""
              }
            >
              {isLoading ? "Saving..." : "Save"}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label="Close robot builder"
            >
              Close
            </button>
          </div>
        </div>

        {/* Warning if no directory is mounted */}
        {!hasDirectoryAccess && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <span>⚠️</span>
              <span className="text-sm">
                No directory mounted - You can view the default robot but cannot
                save custom configurations. Mount a directory to save robots to{" "}
                <code className="font-mono text-xs">./config/robots/</code>
              </span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded mx-4 mt-2">
            {error}
          </div>
        )}

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* Left Panel - Robot Properties */}
          <div className="w-full lg:w-80 border-r border-gray-200 dark:border-gray-700 p-4 space-y-6 overflow-y-auto max-h-96 lg:max-h-none">
            {/* Robot Properties */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Robot Properties
              </h3>

              {/* Robot Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Robot Name
                </label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Enter robot name"
                  disabled={config.isDefault}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                />
                {config.isDefault && (
                  <div className="text-xs text-gray-500 mt-1">
                    Default robot cannot be renamed. Use Duplicate to create a
                    custom robot.
                  </div>
                )}
              </div>

              {/* Dimensions */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Width (studs)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={config.dimensions.width}
                    onChange={(e) =>
                      handleDimensionChange(
                        "width",
                        parseInt(e.target.value, 10),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="text-xs text-gray-500">
                    {studsToMm(config.dimensions.width)}mm (
                    {config.dimensions.width} studs)
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Length (studs)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={config.dimensions.length}
                    onChange={(e) =>
                      handleDimensionChange(
                        "length",
                        parseInt(e.target.value, 10),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="text-xs text-gray-500">
                    {studsToMm(config.dimensions.length)}mm (
                    {config.dimensions.length} studs)
                  </div>
                </div>
              </div>

              {/* Wheel Positions */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Wheel Positions (studs from robot edges)
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400">
                      Wheel Distance from Left/Right Edge
                    </label>
                    <input
                      type="number"
                      value={config.wheels.left.distanceFromEdge}
                      onChange={(e) =>
                        handleWheelChange(
                          "distanceFromEdge",
                          parseFloat(e.target.value),
                        )
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      {config.wheels.left.distanceFromEdge} studs from
                      left/right edge
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400">
                      Wheel Distance from Top Edge
                    </label>
                    <input
                      type="number"
                      value={config.wheels.left.distanceFromTop}
                      onChange={(e) =>
                        handleWheelChange(
                          "distanceFromTop",
                          parseFloat(e.target.value),
                        )
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      {config.wheels.left.distanceFromTop} studs from top edge
                    </div>
                  </div>
                </div>
              </div>

              {/* Appearance */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Appearance
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400">
                      Primary Color
                    </label>
                    <input
                      type="color"
                      value={config.appearance.primaryColor}
                      onChange={(e) =>
                        handleAppearanceChange("primaryColor", e.target.value)
                      }
                      className="w-full h-8 rounded border border-gray-300 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400">
                      Wheel Color
                    </label>
                    <input
                      type="color"
                      value={config.appearance.wheelColor}
                      onChange={(e) =>
                        handleAppearanceChange("wheelColor", e.target.value)
                      }
                      className="w-full h-8 rounded border border-gray-300 dark:border-gray-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Panel - Robot Preview */}
          <div className="flex-1 p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {config.name}
              </h3>
              <div className="text-sm text-gray-500">
                {studsToMm(config.dimensions.width)}mm ×{" "}
                {studsToMm(config.dimensions.length)}mm
                <br />
                <span className="text-xs">
                  ({config.dimensions.width} × {config.dimensions.length} studs)
                </span>
              </div>
            </div>

            <RobotPreview />
          </div>

          {/* Right Panel - Saved Configurations */}
          <div className="w-full lg:w-80 border-l border-gray-200 dark:border-gray-700 p-4 overflow-y-auto min-h-0 max-h-96 lg:max-h-none">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-300 mb-3">
              Saved Robots
            </h3>

            <div className="space-y-2">
              {savedConfigs.map((savedConfig) => (
                <div
                  key={savedConfig.id}
                  className={`p-3 rounded border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    savedConfig.id === config.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                  onClick={() => loadConfig(savedConfig.id)}
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {savedConfig.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {studsToMm(savedConfig.dimensions.width)}mm ×{" "}
                    {studsToMm(savedConfig.dimensions.length)}mm
                    <br />
                    <span className="text-xs">
                      ({savedConfig.dimensions.width} ×{" "}
                      {savedConfig.dimensions.length} studs)
                    </span>
                  </div>
                  {savedConfig.isDefault && (
                    <span className="inline-block px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded mt-1">
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>

            {!config.isDefault && (
              <button
                onClick={deleteConfig}
                className="w-full mt-4 px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete Current Robot
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
