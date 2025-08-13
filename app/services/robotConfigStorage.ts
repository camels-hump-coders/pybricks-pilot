import type { RobotConfig } from "../schemas/RobotConfig";
import { DEFAULT_ROBOT_CONFIG } from "../schemas/RobotConfig";

const DB_NAME = "PyBricksPilotDB";
const DB_VERSION = 8; // Increment version to add preferences store
const ROBOT_CONFIG_STORE = "robotConfigs";
const PREFERENCES_STORE = "preferences";
const ACTIVE_ROBOT_CONFIG_KEY = "activeRobotConfig";

class RobotConfigStorage {
  private db: IDBDatabase | null = null;

  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Add timeout to prevent infinite hanging
      const timeoutId = setTimeout(() => {
        console.error("Database opening timed out after 15 seconds");
        reject(new Error("Database opening timed out"));
      }, 15000);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        clearTimeout(timeoutId);
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("IndexedDB opened successfully, version:", this.db.version);
        clearTimeout(timeoutId);
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log(
          "IndexedDB upgrade needed, old version:",
          event.oldVersion,
          "new version:",
          db.version
        );

        // Delete existing stores if upgrading from old version
        if (event.oldVersion < 8) {
          try {
            if (db.objectStoreNames.contains(ROBOT_CONFIG_STORE)) {
              db.deleteObjectStore(ROBOT_CONFIG_STORE);
            }
            if (db.objectStoreNames.contains(PREFERENCES_STORE)) {
              db.deleteObjectStore(PREFERENCES_STORE);
            }
          } catch (error) {
            console.warn("Error deleting old object stores:", error);
          }
        }

        // Create robot configs object store
        if (!db.objectStoreNames.contains(ROBOT_CONFIG_STORE)) {
          console.log("Creating robotConfigs object store");
          const store = db.createObjectStore(ROBOT_CONFIG_STORE, {
            keyPath: "id",
          });
          store.createIndex("name", "name", { unique: false });
          store.createIndex("tags", "tags", { unique: false });
          store.createIndex("isDefault", "isDefault", { unique: false });
          console.log("robotConfigs object store created successfully");
        }

        // Create preferences object store
        if (!db.objectStoreNames.contains(PREFERENCES_STORE)) {
          console.log("Creating preferences object store");
          db.createObjectStore(PREFERENCES_STORE, {
            keyPath: "key",
          });
          console.log("preferences object store created successfully");
        }
      };
    });
  }

  // Save robot configuration to IndexedDB
  async saveConfig(config: RobotConfig): Promise<void> {
    try {
      console.log("Attempting to save robot configuration:", config.id);

      const db = await this.openDB();
      console.log(
        "Database opened, version:",
        db.version,
        "stores:",
        Array.from(db.objectStoreNames)
      );

      // Verify the object store exists
      if (!db.objectStoreNames.contains(ROBOT_CONFIG_STORE)) {
        console.error("Object store not found:", ROBOT_CONFIG_STORE);
        console.log("Available stores:", Array.from(db.objectStoreNames));
        console.log("Database version:", db.version);
        throw new Error(
          `Object store '${ROBOT_CONFIG_STORE}' not found. Available stores: ${Array.from(db.objectStoreNames).join(", ")}. Database version: ${db.version}`
        );
      }

      return new Promise((resolve, reject) => {
        console.log("Creating transaction for store:", ROBOT_CONFIG_STORE);
        const transaction = db.transaction([ROBOT_CONFIG_STORE], "readwrite");
        const store = transaction.objectStore(ROBOT_CONFIG_STORE);

        // Update timestamp
        const configWithTimestamp = {
          ...config,
          updatedAt: new Date().toISOString(),
        };

        console.log("Putting configuration:", configWithTimestamp);
        const request = store.put(configWithTimestamp);

        // Add timeout to prevent infinite hanging
        const timeoutId = setTimeout(() => {
          console.error("Save operation timed out after 10 seconds");
          reject(new Error("Save operation timed out"));
        }, 10000);

        request.onsuccess = () => {
          console.log("Robot configuration saved successfully");
          clearTimeout(timeoutId);
          resolve();
        };

        request.onerror = () => {
          console.error("Failed to save robot configuration:", request.error);
          clearTimeout(timeoutId);
          reject(
            new Error(
              `Failed to save robot configuration: ${request.error?.message || "Unknown error"}`
            )
          );
        };

        transaction.onerror = () => {
          console.error("Transaction error:", transaction.error);
          clearTimeout(timeoutId);
          reject(
            new Error(
              `Transaction error: ${transaction.error?.message || "Unknown error"}`
            )
          );
        };

        transaction.oncomplete = () => {
          console.log("Transaction completed successfully");
          // If we haven't resolved/rejected yet, this means the request succeeded
          // but onsuccess didn't fire (which can happen in some edge cases)
          if (timeoutId) {
            clearTimeout(timeoutId);
            resolve();
          }
        };

        transaction.onabort = () => {
          console.error("Transaction aborted");
          clearTimeout(timeoutId);
          reject(new Error("Transaction was aborted"));
        };
      });
    } catch (error) {
      console.error("Error in saveConfig:", error);
      throw error;
    }
  }

  // Load robot configuration from IndexedDB by ID
  async loadConfig(id: string): Promise<RobotConfig | null> {
    try {
      const db = await this.openDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([ROBOT_CONFIG_STORE], "readonly");
        const store = transaction.objectStore(ROBOT_CONFIG_STORE);

        const request = store.get(id);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(new Error("Failed to load robot configuration"));
        };
      });
    } catch (error) {
      console.warn("Failed to load robot configuration:", error);
      return null;
    }
  }

  // Load all robot configurations
  async loadAllConfigs(): Promise<RobotConfig[]> {
    try {
      const db = await this.openDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([ROBOT_CONFIG_STORE], "readonly");
        const store = transaction.objectStore(ROBOT_CONFIG_STORE);

        const request = store.getAll();

        request.onsuccess = () => {
          const configs = request.result || [];
          // Sort by name, with default config first
          configs.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name);
          });
          resolve(configs);
        };

        request.onerror = () => {
          reject(new Error("Failed to load robot configurations"));
        };
      });
    } catch (error) {
      console.warn("Failed to load robot configurations:", error);
      return [DEFAULT_ROBOT_CONFIG];
    }
  }

  // Delete robot configuration
  async deleteConfig(id: string): Promise<void> {
    if (id === "default") {
      throw new Error("Cannot delete default robot configuration");
    }

    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ROBOT_CONFIG_STORE], "readwrite");
      const store = transaction.objectStore(ROBOT_CONFIG_STORE);

      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to delete robot configuration"));
      };
    });
  }

  // Set active robot configuration
  async setActiveConfig(id: string): Promise<void> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PREFERENCES_STORE], "readwrite");
      const store = transaction.objectStore(PREFERENCES_STORE);

      const request = store.put({ key: ACTIVE_ROBOT_CONFIG_KEY, value: id });

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to set active robot configuration"));
      };
    });
  }

  // Get active robot configuration ID
  async getActiveConfigId(): Promise<string> {
    try {
      const db = await this.openDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PREFERENCES_STORE], "readonly");
        const store = transaction.objectStore(PREFERENCES_STORE);

        const request = store.get(ACTIVE_ROBOT_CONFIG_KEY);

        request.onsuccess = () => {
          resolve(request.result?.value || "default");
        };

        request.onerror = () => {
          reject(new Error("Failed to get active robot configuration"));
        };
      });
    } catch (error) {
      console.warn("Failed to get active robot configuration:", error);
      return "default";
    }
  }

  // Get active robot configuration
  async getActiveConfig(): Promise<RobotConfig> {
    const activeId = await this.getActiveConfigId();
    const config = await this.loadConfig(activeId);
    return config || DEFAULT_ROBOT_CONFIG;
  }

  // Try to load robot configuration from working directory
  async loadFromWorkingDirectory(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<RobotConfig | null> {
    try {
      const robotFileHandle = await dirHandle.getFileHandle("robot.json");
      const robotFile = await robotFileHandle.getFile();
      const content = await robotFile.text();
      const config = JSON.parse(content) as RobotConfig;

      // Validate the loaded configuration
      if (this.isValidRobotConfig(config)) {
        return config;
      } else {
        console.warn("Invalid robot configuration in robot.json");
        console.log("Invalid config:", config);
        const invalidConfig = config as any; // Type assertion for debugging
        console.log("Validation details:", {
          hasId: typeof invalidConfig?.id === "string",
          hasName: typeof invalidConfig?.name === "string",
          hasDimensions: !!invalidConfig?.dimensions,
          hasWidth: typeof invalidConfig?.dimensions?.width === "number",
          hasLength: typeof invalidConfig?.dimensions?.length === "number",
          hasWheels: !!invalidConfig?.wheels,
          hasLeftWheel: !!invalidConfig?.wheels?.left,
          hasRightWheel: !!invalidConfig?.wheels?.right,
          hasLeftWheelEdge:
            typeof invalidConfig?.wheels?.left?.distanceFromEdge === "number",
          hasLeftWheelBack:
            typeof invalidConfig?.wheels?.left?.distanceFromBack === "number",
          hasRightWheelEdge:
            typeof invalidConfig?.wheels?.right?.distanceFromEdge === "number",
          hasRightWheelBack:
            typeof invalidConfig?.wheels?.right?.distanceFromBack === "number",
          hasCenterOfRotation: !!invalidConfig?.centerOfRotation,
          hasCenterX:
            typeof invalidConfig?.centerOfRotation?.distanceFromLeftEdge ===
            "number",
          hasCenterY:
            typeof invalidConfig?.centerOfRotation?.distanceFromBack ===
            "number",
        });
        return null;
      }
    } catch (error) {
      // robot.json doesn't exist or can't be read
      return null;
    }
  }

  // Save robot configuration to working directory
  async saveToWorkingDirectory(
    dirHandle: FileSystemDirectoryHandle,
    config: RobotConfig
  ): Promise<void> {
    try {
      const robotFileHandle = await dirHandle.getFileHandle("robot.json", {
        create: true,
      });
      const writable = await robotFileHandle.createWritable();
      const content = JSON.stringify(config, null, 2);
      await writable.write(content);
      await writable.close();
    } catch (error) {
      throw new Error(
        `Failed to save robot configuration to working directory: ${error}`
      );
    }
  }

  // Check if a robot configuration object is valid
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
      typeof config.wheels.left.distanceFromBack === "number" &&
      typeof config.wheels.right.distanceFromEdge === "number" &&
      typeof config.wheels.right.distanceFromBack === "number" &&
      config.centerOfRotation &&
      typeof config.centerOfRotation.distanceFromLeftEdge === "number" &&
      typeof config.centerOfRotation.distanceFromBack === "number"
    );
  }

  // Initialize with default configuration if none exists
  async initializeDefaultConfig(): Promise<void> {
    try {
      const existingConfigs = await this.loadAllConfigs();
      if (existingConfigs.length === 0) {
        await this.saveConfig(DEFAULT_ROBOT_CONFIG);
      }
    } catch (error) {
      console.warn("Failed to initialize default robot configuration:", error);
    }
  }

  // Search robot configurations by tags or name
  async searchConfigs(query: string): Promise<RobotConfig[]> {
    const allConfigs = await this.loadAllConfigs();

    if (!query.trim()) {
      return allConfigs;
    }

    const lowerQuery = query.toLowerCase();
    return allConfigs.filter(
      (config) =>
        config.name.toLowerCase().includes(lowerQuery) ||
        config.description?.toLowerCase().includes(lowerQuery) ||
        config.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  // Duplicate a robot configuration
  async duplicateConfig(
    originalId: string,
    newName: string
  ): Promise<RobotConfig> {
    const original = await this.loadConfig(originalId);
    if (!original) {
      throw new Error("Original configuration not found");
    }

    const duplicated: RobotConfig = {
      ...original,
      id: `robot_${Date.now()}`,
      name: newName,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveConfig(duplicated);
    return duplicated;
  }

  // Force database recreation (useful for debugging)
  async forceDatabaseRecreation(): Promise<void> {
    try {
      console.log("Forcing database recreation...");

      // Close existing connection
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      // Delete the database
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

      return new Promise((resolve, reject) => {
        deleteRequest.onsuccess = () => {
          console.log("Database deleted successfully");
          resolve();
        };

        deleteRequest.onerror = () => {
          console.error("Failed to delete database:", deleteRequest.error);
          reject(new Error("Failed to delete database"));
        };
      });
    } catch (error) {
      console.error("Error in forceDatabaseRecreation:", error);
      throw error;
    }
  }

  // Completely reset the database (more aggressive than forceDatabaseRecreation)
  async resetDatabase(): Promise<void> {
    try {
      console.log("Completely resetting database...");

      // Close existing connection and clear cache
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      // Delete the database
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

      return new Promise((resolve, reject) => {
        deleteRequest.onsuccess = () => {
          console.log("Database deleted successfully");

          // Wait a bit then try to open a new connection to trigger recreation
          setTimeout(async () => {
            try {
              // Force a fresh connection by clearing any cached references
              this.db = null;
              await this.openDB();
              console.log("Database recreated successfully");
              resolve();
            } catch (error) {
              console.error("Failed to recreate database:", error);
              reject(error);
            }
          }, 200); // Increased timeout for better reliability
        };

        deleteRequest.onerror = () => {
          console.error("Failed to delete database:", deleteRequest.error);
          reject(new Error("Failed to delete database"));
        };
      });
    } catch (error) {
      console.error("Error in resetDatabase:", error);
      throw error;
    }
  }

  // Nuclear option: completely clear everything and force page reload
  async nuclearReset(): Promise<void> {
    try {
      console.log("Nuclear reset: clearing everything...");

      // Close existing connection
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      // Delete the database
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

      return new Promise((resolve, reject) => {
        deleteRequest.onsuccess = () => {
          console.log("Database deleted successfully");

          // Clear any other browser storage
          try {
            localStorage.clear();
            sessionStorage.clear();
            console.log("Browser storage cleared");
          } catch (error) {
            console.warn("Could not clear browser storage:", error);
          }

          // Force page reload after a short delay
          setTimeout(() => {
            console.log("Reloading page to complete reset...");
            window.location.reload();
          }, 500);

          resolve();
        };

        deleteRequest.onerror = () => {
          console.error("Failed to delete database:", deleteRequest.error);
          reject(new Error("Failed to delete database"));
        };
      });
    } catch (error) {
      console.error("Error in nuclearReset:", error);
      throw error;
    }
  }

  // Clear database connection (useful for testing)
  clearConnection(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log("Database connection cleared");
    }
  }

  // Get database status (useful for debugging)
  getDatabaseStatus(): {
    isConnected: boolean;
    version: number | null;
    stores: string[];
  } {
    if (!this.db) {
      return { isConnected: false, version: null, stores: [] };
    }

    return {
      isConnected: true,
      version: this.db.version,
      stores: Array.from(this.db.objectStoreNames),
    };
  }

  // Check if database is properly initialized
  async checkDatabaseHealth(): Promise<{
    isHealthy: boolean;
    version: number | null;
    stores: string[];
    hasRobotConfigStore: boolean;
    error?: string;
  }> {
    try {
      const db = await this.openDB();
      const hasRobotConfigStore =
        db.objectStoreNames.contains(ROBOT_CONFIG_STORE);

      return {
        isHealthy: hasRobotConfigStore,
        version: db.version,
        stores: Array.from(db.objectStoreNames),
        hasRobotConfigStore,
      };
    } catch (error) {
      return {
        isHealthy: false,
        version: null,
        stores: [],
        hasRobotConfigStore: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Test if database operations actually work
  async testDatabaseOperations(): Promise<{
    canRead: boolean;
    canWrite: boolean;
    error?: string;
  }> {
    try {
      const db = await this.openDB();

      // Test read operation
      let canRead = false;
      try {
        const transaction = db.transaction([ROBOT_CONFIG_STORE], "readonly");
        const store = transaction.objectStore(ROBOT_CONFIG_STORE);
        const request = store.getAll();

        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(
            () => reject(new Error("Read test timed out")),
            5000
          );

          request.onsuccess = () => {
            clearTimeout(timeoutId);
            canRead = true;
            resolve(undefined);
          };

          request.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error("Read test failed"));
          };
        });
      } catch (error) {
        console.warn("Read test failed:", error);
      }

      // Test write operation with a temporary config
      let canWrite = false;
      try {
        const testConfig = {
          id: `test_${Date.now()}`,
          name: "Test Config",
          dimensions: { width: 10, length: 10 },
          wheels: {
            left: {
              distanceFromEdge: 2,
              distanceFromBack: 5,
              diameter: 60,
              width: 20,
            },
            right: {
              distanceFromEdge: 2,
              distanceFromBack: 5,
              diameter: 60,
              width: 20,
            },
          },
          centerOfRotation: { distanceFromLeftEdge: 5, distanceFromBack: 5 },
          appearance: {
            primaryColor: "#007bff",
            secondaryColor: "#0056b3",
            wheelColor: "#333",
            showStuds: true,
            showGrid: true,
          },
          capabilities: {
            maxSpeed: 300,
            turnRadius: 90,
            hasGyro: true,
            hasColorSensor: true,
            hasDistanceSensor: true,
          },
          tags: ["test"],
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await this.saveConfig(testConfig);
        canWrite = true;

        // Clean up test config
        try {
          await this.deleteConfig(testConfig.id);
        } catch (error) {
          console.warn("Failed to clean up test config:", error);
        }
      } catch (error) {
        console.warn("Write test failed:", error);
      }

      return { canRead, canWrite };
    } catch (error) {
      return {
        canRead: false,
        canWrite: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const robotConfigStorage = new RobotConfigStorage();
