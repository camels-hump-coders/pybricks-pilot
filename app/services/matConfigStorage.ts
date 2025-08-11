import type { GameMatConfig } from "../components/GameMatEditor";

const DB_NAME = "PyBricksPilotDB";
const DB_VERSION = 1;
const STORE_NAME = "matConfigs";
const CONFIG_KEY = "customMatConfig";

class MatConfigStorage {
  private db: IDBDatabase | null = null;

  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
    });
  }

  async saveConfig(config: GameMatConfig): Promise<void> {
    const db = await this.openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      
      // Add an ID to the config for IndexedDB
      const configWithId = { ...config, id: CONFIG_KEY };
      
      const request = store.put(configWithId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to save mat configuration"));
      };
    });
  }

  async loadConfig(): Promise<GameMatConfig | null> {
    try {
      const db = await this.openDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(CONFIG_KEY);

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            // Remove the ID we added for IndexedDB
            const { id, ...config } = result;
            resolve(config as GameMatConfig);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          reject(new Error("Failed to load mat configuration"));
        };
      });
    } catch (error) {
      console.error("Error loading mat config:", error);
      return null;
    }
  }

  async deleteConfig(): Promise<void> {
    const db = await this.openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(CONFIG_KEY);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to delete mat configuration"));
      };
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to clear configurations"));
      };
    });
  }
}

// Export singleton instance
export const matConfigStorage = new MatConfigStorage();