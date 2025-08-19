import type { GameMatConfig } from "../schemas/GameMatConfig";
import { GameMatConfigSchema } from "../schemas/GameMatConfig";

interface MatMetadata {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

class MatConfigFileSystem {
  private readonly MATS_DIR = "config/mats";

  // Discover all available mats from the filesystem
  async discoverMats(
    dirHandle: FileSystemDirectoryHandle,
  ): Promise<MatMetadata[]> {
    try {
      // Check if config/mats directory exists
      const configHandle = await dirHandle.getDirectoryHandle("config", {
        create: true,
      });
      const matsHandle = await configHandle.getDirectoryHandle("mats", {
        create: true,
      });

      const mats: MatMetadata[] = [];

      // Iterate through each mat directory
      for await (const [matId, matDirHandle] of matsHandle.entries()) {
        if (matDirHandle.kind === "directory") {
          try {
            const matConfig = await this.loadMatConfig(dirHandle, matId);
            if (matConfig) {
              mats.push({
                id: matId,
                name: matConfig.name,
                displayName: matConfig.displayName || matConfig.name,
                description: `Custom mat from ${matId}`,
                tags: ["custom"],
                createdAt: matConfig.createdAt,
                updatedAt: matConfig.updatedAt,
              });
            }
          } catch (error) {
            console.warn(`Failed to load mat config for ${matId}:`, error);
          }
        }
      }

      return mats.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.warn("Failed to discover mats:", error);
      return [];
    }
  }

  // Load a specific mat configuration
  async loadMatConfig(
    dirHandle: FileSystemDirectoryHandle,
    matId: string,
  ): Promise<GameMatConfig | null> {
    try {
      const configHandle = await dirHandle.getDirectoryHandle("config");
      const matsHandle = await configHandle.getDirectoryHandle("mats");
      const matDirHandle = await matsHandle.getDirectoryHandle(matId);
      const matFileHandle = await matDirHandle.getFileHandle("mat.json");

      const file = await matFileHandle.getFile();
      const content = await file.text();
      const config = JSON.parse(content);

      // Validate with Zod schema
      return GameMatConfigSchema.parse(config);
    } catch (error) {
      console.warn(`Failed to load mat config for ${matId}:`, error);
      return null;
    }
  }

  // Save a mat configuration
  async saveMatConfig(
    dirHandle: FileSystemDirectoryHandle,
    matId: string,
    config: GameMatConfig,
  ): Promise<void> {
    try {
      // Ensure directory structure exists
      const configHandle = await dirHandle.getDirectoryHandle("config", {
        create: true,
      });
      const matsHandle = await configHandle.getDirectoryHandle("mats", {
        create: true,
      });
      const matDirHandle = await matsHandle.getDirectoryHandle(matId, {
        create: true,
      });

      // Update timestamps
      const updatedConfig = {
        ...config,
        updatedAt: new Date().toISOString(),
      };

      // Save mat.json
      const matFileHandle = await matDirHandle.getFileHandle("mat.json", {
        create: true,
      });
      const writable = await matFileHandle.createWritable();
      await writable.write(JSON.stringify(updatedConfig, null, 2));
      await writable.close();
    } catch (error) {
      throw new Error(`Failed to save mat configuration: ${error}`);
    }
  }

  // Create a new mat configuration
  async createMatConfig(
    dirHandle: FileSystemDirectoryHandle,
    matId: string,
    config: Omit<GameMatConfig, "createdAt" | "updatedAt">,
  ): Promise<void> {
    const fullConfig: GameMatConfig = {
      ...config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveMatConfig(dirHandle, matId, fullConfig);
  }

  // Delete a mat configuration
  async deleteMatConfig(
    dirHandle: FileSystemDirectoryHandle,
    matId: string,
  ): Promise<void> {
    try {
      const configHandle = await dirHandle.getDirectoryHandle("config");
      const matsHandle = await configHandle.getDirectoryHandle("mats");

      // Remove the entire mat directory
      await matsHandle.removeEntry(matId, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to delete mat configuration: ${error}`);
    }
  }

  // Generate a unique mat ID
  generateMatId(name: string): string {
    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    return `${baseId}-${timestamp}`;
  }

  // Check if a mat exists
  async matExists(
    dirHandle: FileSystemDirectoryHandle,
    matId: string,
  ): Promise<boolean> {
    try {
      const configHandle = await dirHandle.getDirectoryHandle("config");
      const matsHandle = await configHandle.getDirectoryHandle("mats");
      const matDirHandle = await matsHandle.getDirectoryHandle(matId);
      await matDirHandle.getFileHandle("mat.json");
      return true;
    } catch (error) {
      return false;
    }
  }

  // Save a mat image file
  async saveMatImage(
    dirHandle: FileSystemDirectoryHandle,
    matId: string,
    imageFile: File,
  ): Promise<void> {
    try {
      // Ensure directory structure exists
      const configHandle = await dirHandle.getDirectoryHandle("config", {
        create: true,
      });
      const matsHandle = await configHandle.getDirectoryHandle("mats", {
        create: true,
      });
      const matDirHandle = await matsHandle.getDirectoryHandle(matId, {
        create: true,
      });

      // Save mat.png
      const imageFileHandle = await matDirHandle.getFileHandle("mat.png", {
        create: true,
      });
      const writable = await imageFileHandle.createWritable();
      await writable.write(imageFile);
      await writable.close();
    } catch (error) {
      throw new Error(`Failed to save mat image: ${error}`);
    }
  }
}

export const matConfigFileSystem = new MatConfigFileSystem();
