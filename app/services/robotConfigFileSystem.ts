import type { RobotConfig } from "../schemas/RobotConfig";
import { DEFAULT_ROBOT_CONFIG } from "../schemas/RobotConfig";

interface RobotMetadata {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

class RobotConfigFileSystem {
  private readonly ROBOTS_DIR = "config/robots";

  // Discover all available robot configurations from the filesystem
  async discoverRobots(dirHandle: FileSystemDirectoryHandle): Promise<RobotMetadata[]> {
    try {
      // Check if config/robots directory exists
      const configHandle = await dirHandle.getDirectoryHandle("config", { create: true });
      const robotsHandle = await configHandle.getDirectoryHandle("robots", { create: true });
      
      const robots: RobotMetadata[] = [];
      
      // Always include the default robot (not stored in filesystem)
      robots.push({
        id: "default",
        name: DEFAULT_ROBOT_CONFIG.name,
        description: DEFAULT_ROBOT_CONFIG.description,
        tags: DEFAULT_ROBOT_CONFIG.tags,
        isDefault: true,
        createdAt: DEFAULT_ROBOT_CONFIG.createdAt,
        updatedAt: DEFAULT_ROBOT_CONFIG.updatedAt,
      });
      
      // Iterate through each robot directory
      for await (const [robotId, robotDirHandle] of robotsHandle.entries()) {
        if (robotDirHandle.kind === "directory" && robotId !== "default") {
          try {
            const robotConfig = await this.loadRobotConfig(dirHandle, robotId);
            if (robotConfig) {
              robots.push({
                id: robotId,
                name: robotConfig.name,
                description: robotConfig.description,
                tags: robotConfig.tags,
                isDefault: false,
                createdAt: robotConfig.createdAt,
                updatedAt: robotConfig.updatedAt,
              });
            }
          } catch (error) {
            console.warn(`Failed to load robot config for ${robotId}:`, error);
          }
        }
      }
      
      return robots.sort((a, b) => {
        // Default robot first, then sort by name
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.warn("Failed to discover robots:", error);
      return [{
        id: "default",
        name: DEFAULT_ROBOT_CONFIG.name,
        description: DEFAULT_ROBOT_CONFIG.description,
        tags: DEFAULT_ROBOT_CONFIG.tags,
        isDefault: true,
        createdAt: DEFAULT_ROBOT_CONFIG.createdAt,
        updatedAt: DEFAULT_ROBOT_CONFIG.updatedAt,
      }];
    }
  }

  // Load a specific robot configuration
  async loadRobotConfig(dirHandle: FileSystemDirectoryHandle, robotId: string): Promise<RobotConfig | null> {
    // Return default robot config for "default" id
    if (robotId === "default") {
      return DEFAULT_ROBOT_CONFIG;
    }

    try {
      const configHandle = await dirHandle.getDirectoryHandle("config");
      const robotsHandle = await configHandle.getDirectoryHandle("robots");
      const robotDirHandle = await robotsHandle.getDirectoryHandle(robotId);
      const robotFileHandle = await robotDirHandle.getFileHandle("robot.json");
      
      const file = await robotFileHandle.getFile();
      const content = await file.text();
      const config = JSON.parse(content) as RobotConfig;
      
      // Validate the configuration
      if (this.isValidRobotConfig(config)) {
        return config;
      } else {
        console.warn(`Invalid robot configuration in ${robotId}/robot.json`);
        return null;
      }
    } catch (error) {
      console.warn(`Failed to load robot config for ${robotId}:`, error);
      return null;
    }
  }

  // Save a robot configuration
  async saveRobotConfig(dirHandle: FileSystemDirectoryHandle, robotId: string, config: RobotConfig): Promise<void> {
    // Cannot save over the default robot
    if (robotId === "default") {
      throw new Error("Cannot modify the default robot configuration");
    }

    try {
      // Ensure directory structure exists
      const configHandle = await dirHandle.getDirectoryHandle("config", { create: true });
      const robotsHandle = await configHandle.getDirectoryHandle("robots", { create: true });
      const robotDirHandle = await robotsHandle.getDirectoryHandle(robotId, { create: true });
      
      // Update timestamps
      const updatedConfig = {
        ...config,
        id: robotId, // Ensure ID matches directory name
        updatedAt: new Date().toISOString(),
        isDefault: false, // Custom robots are never default
      };
      
      // Save robot.json
      const robotFileHandle = await robotDirHandle.getFileHandle("robot.json", { create: true });
      const writable = await robotFileHandle.createWritable();
      await writable.write(JSON.stringify(updatedConfig, null, 2));
      await writable.close();
    } catch (error) {
      throw new Error(`Failed to save robot configuration: ${error}`);
    }
  }

  // Create a new robot configuration
  async createRobotConfig(dirHandle: FileSystemDirectoryHandle, robotId: string, config: Omit<RobotConfig, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>): Promise<void> {
    const fullConfig: RobotConfig = {
      ...config,
      id: robotId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: false,
    };
    
    await this.saveRobotConfig(dirHandle, robotId, fullConfig);
  }

  // Delete a robot configuration
  async deleteRobotConfig(dirHandle: FileSystemDirectoryHandle, robotId: string): Promise<void> {
    if (robotId === "default") {
      throw new Error("Cannot delete the default robot configuration");
    }

    try {
      const configHandle = await dirHandle.getDirectoryHandle("config");
      const robotsHandle = await configHandle.getDirectoryHandle("robots");
      
      // Remove the entire robot directory
      await robotsHandle.removeEntry(robotId, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to delete robot configuration: ${error}`);
    }
  }

  // Generate a unique robot ID
  generateRobotId(name: string): string {
    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    return `${baseId}-${timestamp}`;
  }

  // Check if a robot exists
  async robotExists(dirHandle: FileSystemDirectoryHandle, robotId: string): Promise<boolean> {
    if (robotId === "default") {
      return true;
    }

    try {
      const configHandle = await dirHandle.getDirectoryHandle("config");
      const robotsHandle = await configHandle.getDirectoryHandle("robots");
      const robotDirHandle = await robotsHandle.getDirectoryHandle(robotId);
      await robotDirHandle.getFileHandle("robot.json");
      return true;
    } catch (error) {
      return false;
    }
  }

  // Validate robot configuration structure
  private isValidRobotConfig(config: any): config is RobotConfig {
    return (
      config &&
      typeof config.id === "string" &&
      typeof config.name === "string" &&
      config.dimensions &&
      typeof config.dimensions.width === "number" &&
      typeof config.dimensions.length === "number" &&
      config.wheels &&
      config.wheels.left &&
      config.wheels.right &&
      typeof config.wheels.left.distanceFromEdge === "number" &&
      typeof config.wheels.left.distanceFromTop === "number" &&
      typeof config.wheels.right.distanceFromEdge === "number" &&
      typeof config.wheels.right.distanceFromTop === "number" &&
      config.centerOfRotation &&
      typeof config.centerOfRotation.distanceFromLeftEdge === "number" &&
      typeof config.centerOfRotation.distanceFromTop === "number"
    );
  }

  // Duplicate a robot configuration
  async duplicateRobotConfig(dirHandle: FileSystemDirectoryHandle, originalId: string, newName: string): Promise<string> {
    const original = await this.loadRobotConfig(dirHandle, originalId);
    if (!original) {
      throw new Error("Original robot configuration not found");
    }

    const newId = this.generateRobotId(newName);
    
    const duplicated = {
      ...original,
      name: newName,
      description: original.description ? `Copy of ${original.description}` : `Copy of ${original.name}`,
    };

    await this.createRobotConfig(dirHandle, newId, duplicated);
    return newId;
  }
}

export const robotConfigFileSystem = new RobotConfigFileSystem();