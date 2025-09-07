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

// Simple robot preview component
const RobotPreview = ({ config }: { config: RobotConfig }) => {
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
              (config.dimensions.width - config.wheels.right.distanceFromEdge) *
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

export function RobotBuilder({
  isOpen,
  onClose,
  onRobotChange,
  initialConfig,
}: RobotBuilderProps) {
  const [config, setConfig] = useState<RobotConfig>(
    initialConfig || DEFAULT_ROBOT_CONFIG,
  );
  const [activeTab, setActiveTab] = useState<
    "properties" | "drive" | "motors" | "sensors"
  >("properties");
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
    config.centerOfRotation.distanceFromLeftEdge,
    config,
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

  const handleDrivebaseChange = (field: string, value: any) => {
    setConfig((prev) => ({
      ...prev,
      drivebase: {
        leftMotorPort: prev.drivebase?.leftMotorPort || "A",
        rightMotorPort: prev.drivebase?.rightMotorPort || "B",
        leftReversed: prev.drivebase?.leftReversed || false,
        rightReversed: prev.drivebase?.rightReversed || false,
        wheelDiameterMm:
          prev.drivebase?.wheelDiameterMm || prev.wheels.left.diameter || 56,
        axleTrackMm:
          prev.drivebase?.axleTrackMm || prev.dimensions.width * 8 || 120,
        [field]: value,
      },
    }));
  };

  const addMotor = () => {
    setConfig((prev) => ({
      ...prev,
      motors: [
        ...(prev.motors || []),
        {
          name: `motor${(prev.motors?.length || 0) + 1}`,
          port: "C",
          reversed: false,
        },
      ],
    }));
  };

  const updateMotor = (index: number, field: string, value: any) => {
    setConfig((prev) => {
      const motors = [...(prev.motors || [])];
      motors[index] = { ...motors[index], [field]: value } as any;
      return { ...prev, motors } as any;
    });
  };

  const removeMotor = (index: number) => {
    setConfig((prev) => {
      const motors = [...(prev.motors || [])];
      motors.splice(index, 1);
      return { ...prev, motors } as any;
    });
  };

  const addSensor = () => {
    setConfig((prev) => ({
      ...prev,
      sensors: [
        ...(prev.sensors || []),
        {
          name: `sensor${(prev.sensors?.length || 0) + 1}`,
          type: "color",
          port: "D",
        },
      ],
    }));
  };

  const updateSensor = (index: number, field: string, value: any) => {
    setConfig((prev) => {
      const sensors = [...(prev.sensors || [])];
      sensors[index] = { ...sensors[index], [field]: value } as any;
      return { ...prev, sensors } as any;
    });
  };

  const removeSensor = (index: number) => {
    setConfig((prev) => {
      const sensors = [...(prev.sensors || [])];
      sensors.splice(index, 1);
      return { ...prev, sensors } as any;
    });
  };

  // PORT VALIDATION HELPERS
  function buildPortUsage() {
    const usage: Record<string, string[]> = {};
    const push = (port?: string, label?: string) => {
      if (!port || !label) return;
      usage[port] = usage[port] || [];
      usage[port].push(label);
    };

    // Drivebase motors
    push(config.drivebase?.leftMotorPort, "Drive Left Motor");
    push(config.drivebase?.rightMotorPort, "Drive Right Motor");

    // Additional motors
    (config.motors || []).forEach((m, i) => {
      push(m.port as any, m.name || `Motor ${i + 1}`);
    });

    // Sensors
    (config.sensors || []).forEach((s, i) => {
      push(s.port as any, s.name || `Sensor ${i + 1}`);
    });

    return usage;
  }

  const portUsage = buildPortUsage();
  const duplicatePorts = Object.keys(portUsage).filter(
    (p) => (portUsage[p] || []).length > 1,
  );
  const isPortDuplicate = (port?: string) =>
    !!port && duplicatePorts.includes(port);

  const handleAppearanceChange = (
    property: keyof RobotConfig["appearance"],
    value: string | boolean,
  ) => {
    setConfig((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        [property]: value,
      },
    }));
  };

  if (!isOpen) return null;

  return (
    <button
      type="button"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
      aria-label="Close robot builder overlay"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col relative"
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

        {/* Tabs */}
        <div className="px-4 pt-2">
          <div className="inline-flex gap-1 rounded-md border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setActiveTab("properties")}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                activeTab === "properties"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60"
              }`}
            >
              Robot Properties
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("drive")}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                activeTab === "drive"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60"
              }`}
            >
              Drivebase & Ports
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("motors")}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                activeTab === "motors"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60"
              }`}
            >
              Motors
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sensors")}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors ${
                activeTab === "sensors"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600"
                  : "text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60"
              }`}
            >
              Sensors
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
          {/* Left Panel - Tab content */}
          {activeTab === "properties" && (
            <div className="w-full lg:w-96 border-r border-gray-200 dark:border-gray-700 p-4 space-y-6 overflow-y-auto max-h-96 lg:max-h-none">
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
          )}

          {activeTab === "drive" && (
            <div className="w-full lg:w-96 border-r border-gray-200 dark:border-gray-700 p-4 space-y-6 overflow-y-auto max-h-96 lg:max-h-none">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Drivebase & Ports
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Left Motor Port
                  </label>
                  <select
                    value={config.drivebase?.leftMotorPort || "A"}
                    onChange={(e) =>
                      handleDrivebaseChange(
                        "leftMotorPort",
                        e.target.value as any,
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {["A", "B", "C", "D", "E", "F"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {isPortDuplicate(config.drivebase?.leftMotorPort) && (
                    <div className="mt-1 text-xs text-red-600">
                      Port {config.drivebase?.leftMotorPort} is assigned to
                      multiple devices:{" "}
                      {portUsage[config.drivebase?.leftMotorPort || ""]?.join(
                        ", ",
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Right Motor Port
                  </label>
                  <select
                    value={config.drivebase?.rightMotorPort || "B"}
                    onChange={(e) =>
                      handleDrivebaseChange(
                        "rightMotorPort",
                        e.target.value as any,
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {["A", "B", "C", "D", "E", "F"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {isPortDuplicate(config.drivebase?.rightMotorPort) && (
                    <div className="mt-1 text-xs text-red-600">
                      Port {config.drivebase?.rightMotorPort} is assigned to
                      multiple devices:{" "}
                      {portUsage[config.drivebase?.rightMotorPort || ""]?.join(
                        ", ",
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={!!config.drivebase?.leftReversed}
                      onChange={(e) =>
                        handleDrivebaseChange("leftReversed", e.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    Left Reversed
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={!!config.drivebase?.rightReversed}
                      onChange={(e) =>
                        handleDrivebaseChange("rightReversed", e.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    Right Reversed
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Wheel Diameter (mm)
                    <span className="ml-2 text-gray-500 dark:text-gray-400 align-middle cursor-help group relative">
                      ℹ️
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 hidden group-hover:block bg-gray-900 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap z-10">
                        Affects distance accuracy (DriveBase). Use your wheel's
                        actual diameter in mm.
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={Math.round(
                      config.drivebase?.wheelDiameterMm ||
                        config.wheels.left.diameter,
                    )}
                    onChange={(e) =>
                      handleDrivebaseChange(
                        "wheelDiameterMm",
                        parseFloat(e.target.value),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Axle Track (mm)
                    <span className="ml-2 text-gray-500 dark:text-gray-400 align-middle cursor-help group relative">
                      ℹ️
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 hidden group-hover:block bg-gray-900 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap z-10">
                        Distance between left/right wheel centers. Affects turn
                        accuracy.
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={Math.round(
                      config.drivebase?.axleTrackMm ||
                        config.dimensions.width * 8,
                    )}
                    onChange={(e) =>
                      handleDrivebaseChange(
                        "axleTrackMm",
                        parseFloat(e.target.value),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              {duplicatePorts.length > 0 && (
                <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-xs text-red-700 dark:text-red-300">
                  Port conflict: {duplicatePorts.join(", ")} are assigned to
                  multiple devices. Change ports to avoid conflicts.
                </div>
              )}
            </div>
          )}

          {activeTab === "motors" && (
            <div className="w-full lg:w-96 border-r border-gray-200 dark:border-gray-700 p-4 space-y-6 overflow-y-auto max-h-96 lg:max-h-none">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Additional Motors
                </h4>
                <button
                  onClick={addMotor}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  + Add
                </button>
              </div>
              {(config.motors || []).length === 0 && (
                <div className="text-xs text-gray-500">
                  No additional motors configured.
                </div>
              )}
              <div className="mt-2 space-y-2">
                {(config.motors || []).map((m, idx) => (
                  <div
                    key={idx}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Name
                        </label>
                        <input
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          value={m.name}
                          onChange={(e) =>
                            updateMotor(idx, "name", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Port
                        </label>
                        <select
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          value={m.port}
                          onChange={(e) =>
                            updateMotor(idx, "port", e.target.value)
                          }
                        >
                          {["A", "B", "C", "D", "E", "F"].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        {isPortDuplicate(m.port as any) && (
                          <div className="mt-1 text-[11px] text-red-600">
                            Port {m.port} is used by multiple devices.
                          </div>
                        )}
                      </div>
                      <div className="flex items-end">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={!!m.reversed}
                            onChange={(e) =>
                              updateMotor(idx, "reversed", e.target.checked)
                            }
                            className="h-4 w-4"
                          />
                          Reversed
                        </label>
                      </div>
                    </div>
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => removeMotor(idx)}
                        className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "sensors" && (
            <div className="w-full lg:w-96 border-r border-gray-200 dark:border-gray-700 p-4 space-y-6 overflow-y-auto max-h-96 lg:max-h-none">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sensors
                </h4>
                <button
                  onClick={addSensor}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  + Add
                </button>
              </div>
              {(config.sensors || []).length === 0 && (
                <div className="text-xs text-gray-500">
                  No sensors configured.
                </div>
              )}
              <div className="mt-2 space-y-2">
                {(config.sensors || []).map((s, idx) => (
                  <div
                    key={idx}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Name
                        </label>
                        <input
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          value={s.name}
                          onChange={(e) =>
                            updateSensor(idx, "name", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Type
                        </label>
                        <select
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          value={s.type}
                          onChange={(e) =>
                            updateSensor(idx, "type", e.target.value)
                          }
                        >
                          <option value="color">Color</option>
                          <option value="ultrasonic">Ultrasonic</option>
                          <option value="force">Force</option>
                          <option value="gyro">Gyro</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Port
                        </label>
                        <select
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          value={s.port}
                          onChange={(e) =>
                            updateSensor(idx, "port", e.target.value)
                          }
                        >
                          {["A", "B", "C", "D", "E", "F"].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        {isPortDuplicate(s.port as any) && (
                          <div className="mt-1 text-[11px] text-red-600">
                            Port {s.port} is used by multiple devices.
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => removeSensor(idx)}
                        className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Center Panel - Robot Preview (only for Robot Properties tab) */}
          <div className="flex-1 p-4 flex flex-col min-h-0">
            {activeTab === "properties" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {config.name}
                  </h3>
                  <div className="text-sm text-gray-500">
                    {studsToMm(config.dimensions.width)}mm ×{" "}
                    {studsToMm(config.dimensions.length)}mm
                    <br />
                    <span className="text-xs">
                      ({config.dimensions.width} × {config.dimensions.length}{" "}
                      studs)
                    </span>
                  </div>
                </div>
                <RobotPreview config={config} />
              </>
            )}
          </div>

          {/* Right Panel - Saved Configurations */}
          <div className="w-full lg:w-80 border-l border-gray-200 dark:border-gray-700 p-4 overflow-y-auto min-h-0 max-h-96 lg:max-h-none">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-300 mb-3">
              Saved Robots
            </h3>

            <div className="space-y-2">
              {savedConfigs.map((savedConfig) => (
                <button
                  key={savedConfig.id}
                  type="button"
                  className={`w-full text-left p-3 rounded border hover:bg-gray-50 dark:hover:bg-gray-700 ${
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
                </button>
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
    </button>
  );
}
