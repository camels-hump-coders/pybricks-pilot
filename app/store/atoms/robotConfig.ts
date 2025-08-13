import { atom } from "jotai";
import type { RobotConfig } from "../../schemas/RobotConfig";
import { DEFAULT_ROBOT_CONFIG } from "../../schemas/RobotConfig";
import { robotConfigStorage } from "../../services/robotConfigStorage";
import { calculateRobotPosition, setRobotPositionAtom, telemetryReferenceAtom, manualHeadingAdjustmentAtom } from "./gameMat";

// Current robot configuration atom
export const robotConfigAtom = atom<RobotConfig>(DEFAULT_ROBOT_CONFIG);

// Robot builder open state
export const robotBuilderOpenAtom = atom<boolean>(false);

// All saved robot configurations
export const savedRobotConfigsAtom = atom<RobotConfig[]>([]);

// Loading state for robot configurations
export const robotConfigLoadingAtom = atom<boolean>(false);

// Error state for robot configurations
export const robotConfigErrorAtom = atom<string | null>(null);

// Action atoms
export const loadRobotConfigAtom = atom(
  null,
  async (get, set, configId: string) => {
    try {
      set(robotConfigLoadingAtom, true);
      set(robotConfigErrorAtom, null);

      const config = await robotConfigStorage.loadConfig(configId);
      if (config) {
        set(robotConfigAtom, config);
        
        // Reset robot position to bottom-right with new config
        const newPosition = calculateRobotPosition(config, "bottom-right");
        set(setRobotPositionAtom, newPosition);
        set(manualHeadingAdjustmentAtom, 0);
      }
    } catch (error) {
      set(robotConfigErrorAtom, `Failed to load robot configuration: ${error}`);
    } finally {
      set(robotConfigLoadingAtom, false);
    }
  }
);

export const saveRobotConfigAtom = atom(
  null,
  async (get, set, config: RobotConfig) => {
    try {
      set(robotConfigLoadingAtom, true);
      set(robotConfigErrorAtom, null);

      await robotConfigStorage.saveConfig(config);
      set(robotConfigAtom, config);
      
      // Reset robot position to bottom-right with new config
      const newPosition = calculateRobotPosition(config, "bottom-right");
      set(setRobotPositionAtom, newPosition);
      set(manualHeadingAdjustmentAtom, 0);

      // Reload saved configs
      const savedConfigs = await robotConfigStorage.loadAllConfigs();
      set(savedRobotConfigsAtom, savedConfigs);
    } catch (error) {
      set(robotConfigErrorAtom, `Failed to save robot configuration: ${error}`);
    } finally {
      set(robotConfigLoadingAtom, false);
    }
  }
);

export const deleteRobotConfigAtom = atom(
  null,
  async (get, set, configId: string) => {
    try {
      set(robotConfigLoadingAtom, true);
      set(robotConfigErrorAtom, null);

      await robotConfigStorage.deleteConfig(configId);

      // Load default config
      const defaultConfig = await robotConfigStorage.getActiveConfig();
      set(robotConfigAtom, defaultConfig);
      
      // Reset robot position to bottom-right with new config
      const newPosition = calculateRobotPosition(defaultConfig, "bottom-right");
      set(setRobotPositionAtom, newPosition);
      set(manualHeadingAdjustmentAtom, 0);

      // Reload saved configs
      const savedConfigs = await robotConfigStorage.loadAllConfigs();
      set(savedRobotConfigsAtom, savedConfigs);
    } catch (error) {
      set(
        robotConfigErrorAtom,
        `Failed to delete robot configuration: ${error}`
      );
    } finally {
      set(robotConfigLoadingAtom, false);
    }
  }
);

export const duplicateRobotConfigAtom = atom(
  null,
  async (get, set, configId: string, newName: string) => {
    try {
      set(robotConfigLoadingAtom, true);
      set(robotConfigErrorAtom, null);

      const duplicated = await robotConfigStorage.duplicateConfig(
        configId,
        newName
      );
      set(robotConfigAtom, duplicated);
      
      // Reset robot position to bottom-right with new config
      const newPosition = calculateRobotPosition(duplicated, "bottom-right");
      set(setRobotPositionAtom, newPosition);
      set(manualHeadingAdjustmentAtom, 0);

      // Reload saved configs
      const savedConfigs = await robotConfigStorage.loadAllConfigs();
      set(savedRobotConfigsAtom, savedConfigs);
    } catch (error) {
      set(
        robotConfigErrorAtom,
        `Failed to duplicate robot configuration: ${error}`
      );
    } finally {
      set(robotConfigLoadingAtom, false);
    }
  }
);

export const loadAllRobotConfigsAtom = atom(null, async (get, set) => {
  try {
    set(robotConfigLoadingAtom, true);
    set(robotConfigErrorAtom, null);

    const configs = await robotConfigStorage.loadAllConfigs();
    set(savedRobotConfigsAtom, configs);
  } catch (error) {
    set(robotConfigErrorAtom, `Failed to load robot configurations: ${error}`);
  } finally {
    set(robotConfigLoadingAtom, false);
  }
});

export const setActiveRobotConfigAtom = atom(
  null,
  async (get, set, configId: string) => {
    try {
      set(robotConfigLoadingAtom, true);
      set(robotConfigErrorAtom, null);

      await robotConfigStorage.setActiveConfig(configId);

      // Load the active config
      const activeConfig = await robotConfigStorage.getActiveConfig();
      set(robotConfigAtom, activeConfig);
      
      // Reset robot position to bottom-right with new config
      const newPosition = calculateRobotPosition(activeConfig, "bottom-right");
      set(setRobotPositionAtom, newPosition);
      set(manualHeadingAdjustmentAtom, 0);
    } catch (error) {
      set(
        robotConfigErrorAtom,
        `Failed to set active robot configuration: ${error}`
      );
    } finally {
      set(robotConfigLoadingAtom, false);
    }
  }
);

export const initializeRobotConfigAtom = atom(null, async (get, set) => {
  try {
    set(robotConfigLoadingAtom, true);
    set(robotConfigErrorAtom, null);

    // Initialize default config if none exists
    await robotConfigStorage.initializeDefaultConfig();

    // Load active config
    const activeConfig = await robotConfigStorage.getActiveConfig();
    set(robotConfigAtom, activeConfig);
    
    // Reset robot position to bottom-right with loaded config
    const newPosition = calculateRobotPosition(activeConfig, "bottom-right");
    set(setRobotPositionAtom, newPosition);
    set(manualHeadingAdjustmentAtom, 0);

    // Load all saved configs
    const savedConfigs = await robotConfigStorage.loadAllConfigs();
    set(savedRobotConfigsAtom, savedConfigs);
  } catch (error) {
    set(
      robotConfigErrorAtom,
      `Failed to initialize robot configuration: ${error}`
    );
  } finally {
    set(robotConfigLoadingAtom, false);
  }
});

// Derived atoms
export const robotDimensionsAtom = atom((get) => {
  const config = get(robotConfigAtom);
  return {
    widthMm: config.dimensions.width * 8, // Convert studs to mm
    lengthMm: config.dimensions.length * 8,
    widthStuds: config.dimensions.width,
    lengthStuds: config.dimensions.length,
  };
});

export const robotWheelbaseAtom = atom((get) => {
  const config = get(robotConfigAtom);
  return {
    leftWheel: config.wheels.left,
    rightWheel: config.wheels.right,
    wheelbase:
      config.dimensions.width - config.wheels.left.distanceFromEdge * 2,
    centerOffset: config.centerOfRotation,
  };
});

export const robotAppearanceAtom = atom((get) => {
  const config = get(robotConfigAtom);
  return config.appearance;
});

// Robot builder state atoms
export const robotBuilderStateAtom = atom({
  selectedTool: "select" as
    | "select"
    | "fill"
    | "wheel"
    | "sensor"
    | "motor"
    | "eraser",
  selectedColor: "#007bff",
  showGrid: true,
  showStuds: true,
  zoom: 1,
  pan: { x: 0, y: 0 },
});

export const updateRobotBuilderStateAtom = atom(
  null,
  (
    get,
    set,
    updates: Partial<{
      selectedTool: "select" | "fill" | "wheel" | "sensor" | "motor" | "eraser";
      selectedColor: string;
      showGrid: boolean;
      showStuds: boolean;
      zoom: number;
      pan: { x: number; y: number };
    }>
  ) => {
    const currentState = get(robotBuilderStateAtom);
    set(robotBuilderStateAtom, { ...currentState, ...updates });
  }
);
