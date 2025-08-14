import { atom } from "jotai";
import type { GameMatConfig } from "../../schemas/GameMatConfig";
import type { RobotConfig } from "../../schemas/RobotConfig";
import { matConfigFileSystem } from "../../services/matConfigFileSystem";
import { robotConfigFileSystem } from "../../services/robotConfigFileSystem";
import { directoryHandleAtom } from "./fileSystem";

// Mat configuration atoms
export const availableMatConfigsAtom = atom<Array<{ id: string; name: string; displayName: string; description?: string; tags: string[] }>>([]);
export const isLoadingMatConfigsAtom = atom<boolean>(false);
export const currentMatConfigAtom = atom<GameMatConfig | null>(null);
export const selectedMatIdAtom = atom<string | null>(null);

// Robot configuration atoms
export const availableRobotConfigsAtom = atom<RobotConfig[]>([]);
export const isLoadingRobotConfigsAtom = atom<boolean>(false);
export const currentRobotConfigAtom = atom<RobotConfig | null>(null);
export const selectedRobotIdAtom = atom<string>("default");

// Mat discovery action
export const discoverMatConfigsAtom = atom(null, async (get, set) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) {
    set(availableMatConfigsAtom, []);
    return;
  }

  set(isLoadingMatConfigsAtom, true);
  try {
    const mats = await matConfigFileSystem.discoverMats(directoryHandle);
    set(availableMatConfigsAtom, mats);
  } catch (error) {
    console.error("Failed to discover mat configurations:", error);
    set(availableMatConfigsAtom, []);
  } finally {
    set(isLoadingMatConfigsAtom, false);
  }
});

// Robot discovery action
export const discoverRobotConfigsAtom = atom(null, async (get, set) => {
  const directoryHandle = get(directoryHandleAtom);
  
  set(isLoadingRobotConfigsAtom, true);
  try {
    // Discover robot metadata
    const robotMetadata = await robotConfigFileSystem.discoverRobots(directoryHandle!);
    
    // Load full configurations for each robot
    const robotConfigs: RobotConfig[] = [];
    for (const meta of robotMetadata) {
      try {
        const config = await robotConfigFileSystem.loadRobotConfig(directoryHandle!, meta.id);
        if (config) {
          robotConfigs.push(config);
        }
      } catch (error) {
        console.warn(`Failed to load full config for robot ${meta.id}:`, error);
      }
    }
    
    set(availableRobotConfigsAtom, robotConfigs);
  } catch (error) {
    console.error("Failed to discover robot configurations:", error);
    // Fallback to just the default robot
    try {
      const defaultConfig = await robotConfigFileSystem.loadRobotConfig(directoryHandle!, "default");
      if (defaultConfig) {
        set(availableRobotConfigsAtom, [defaultConfig]);
      }
    } catch (fallbackError) {
      console.error("Failed to load default robot:", fallbackError);
      set(availableRobotConfigsAtom, []);
    }
  } finally {
    set(isLoadingRobotConfigsAtom, false);
  }
});

// Load specific mat configuration
export const loadMatConfigAtom = atom(null, async (get, set, matId: string) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) return null;

  try {
    const config = await matConfigFileSystem.loadMatConfig(directoryHandle, matId);
    if (config) {
      set(currentMatConfigAtom, config);
      set(selectedMatIdAtom, matId);
    }
    return config;
  } catch (error) {
    console.error(`Failed to load mat configuration ${matId}:`, error);
    return null;
  }
});

// Load specific robot configuration
export const loadRobotConfigAtom = atom(null, async (get, set, robotId: string) => {
  const directoryHandle = get(directoryHandleAtom);
  // Default robot doesn't need directory handle
  
  try {
    const config = await robotConfigFileSystem.loadRobotConfig(directoryHandle!, robotId);
    if (config) {
      set(currentRobotConfigAtom, config);
      set(selectedRobotIdAtom, robotId);
    }
    return config;
  } catch (error) {
    console.error(`Failed to load robot configuration ${robotId}:`, error);
    return null;
  }
});

// Save mat configuration
export const saveMatConfigAtom = atom(null, async (get, set, params: { matId: string; config: GameMatConfig }) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) throw new Error("No directory selected");

  try {
    await matConfigFileSystem.saveMatConfig(directoryHandle, params.matId, params.config);
    
    // Refresh the available configurations
    await set(discoverMatConfigsAtom);
    
    // Update current config if it's the one being saved
    const currentMatId = get(selectedMatIdAtom);
    if (currentMatId === params.matId) {
      set(currentMatConfigAtom, params.config);
    }
  } catch (error) {
    console.error(`Failed to save mat configuration ${params.matId}:`, error);
    throw error;
  }
});

// Save robot configuration
export const saveRobotConfigAtom = atom(null, async (get, set, params: { robotId: string; config: RobotConfig }) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) throw new Error("No directory selected");

  if (params.robotId === "default") {
    throw new Error("Cannot modify the default robot configuration");
  }

  try {
    await robotConfigFileSystem.saveRobotConfig(directoryHandle, params.robotId, params.config);
    
    // Refresh the available configurations
    await set(discoverRobotConfigsAtom);
    
    // Update current config if it's the one being saved
    const currentRobotId = get(selectedRobotIdAtom);
    if (currentRobotId === params.robotId) {
      set(currentRobotConfigAtom, params.config);
    }
  } catch (error) {
    console.error(`Failed to save robot configuration ${params.robotId}:`, error);
    throw error;
  }
});

// Create new mat configuration
export const createMatConfigAtom = atom(null, async (get, set, params: { name: string; config: Omit<GameMatConfig, 'createdAt' | 'updatedAt'> }) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) throw new Error("No directory selected");

  try {
    const matId = matConfigFileSystem.generateMatId(params.name);
    await matConfigFileSystem.createMatConfig(directoryHandle, matId, params.config);
    
    // Refresh the available configurations
    await set(discoverMatConfigsAtom);
    
    return matId;
  } catch (error) {
    console.error("Failed to create mat configuration:", error);
    throw error;
  }
});

// Create new robot configuration
export const createRobotConfigAtom = atom(null, async (get, set, params: { name: string; config: Omit<RobotConfig, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'> }) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) throw new Error("No directory selected");

  try {
    const robotId = robotConfigFileSystem.generateRobotId(params.name);
    await robotConfigFileSystem.createRobotConfig(directoryHandle, robotId, params.config);
    
    // Refresh the available configurations
    await set(discoverRobotConfigsAtom);
    
    return robotId;
  } catch (error) {
    console.error("Failed to create robot configuration:", error);
    throw error;
  }
});

// Delete mat configuration
export const deleteMatConfigAtom = atom(null, async (get, set, matId: string) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) throw new Error("No directory selected");

  try {
    await matConfigFileSystem.deleteMatConfig(directoryHandle, matId);
    
    // Refresh the available configurations
    await set(discoverMatConfigsAtom);
    
    // Clear current config if it was the deleted one
    const currentMatId = get(selectedMatIdAtom);
    if (currentMatId === matId) {
      set(currentMatConfigAtom, null);
      set(selectedMatIdAtom, null);
    }
  } catch (error) {
    console.error(`Failed to delete mat configuration ${matId}:`, error);
    throw error;
  }
});

// Delete robot configuration
export const deleteRobotConfigAtom = atom(null, async (get, set, robotId: string) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) throw new Error("No directory selected");

  if (robotId === "default") {
    throw new Error("Cannot delete the default robot configuration");
  }

  try {
    await robotConfigFileSystem.deleteRobotConfig(directoryHandle, robotId);
    
    // Refresh the available configurations
    await set(discoverRobotConfigsAtom);
    
    // Switch to default if current robot was deleted
    const currentRobotId = get(selectedRobotIdAtom);
    if (currentRobotId === robotId) {
      await set(loadRobotConfigAtom, "default");
    }
  } catch (error) {
    console.error(`Failed to delete robot configuration ${robotId}:`, error);
    throw error;
  }
});

// Duplicate robot configuration
export const duplicateRobotConfigAtom = atom(null, async (get, set, params: { originalId: string; newName: string }) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) throw new Error("No directory selected");

  try {
    const newRobotId = await robotConfigFileSystem.duplicateRobotConfig(directoryHandle, params.originalId, params.newName);
    
    // Refresh the available configurations
    await set(discoverRobotConfigsAtom);
    
    return newRobotId;
  } catch (error) {
    console.error("Failed to duplicate robot configuration:", error);
    throw error;
  }
});