/**
 * Service for storing and retrieving last connected Bluetooth device information
 * Uses IndexedDB for persistent storage across browser sessions
 */

interface StoredBluetoothDevice {
  id: string;
  name: string;
  lastConnected: number; // timestamp
}

class BluetoothDeviceStorage {
  private dbName = 'pybricks-pilot-bluetooth';
  private dbVersion = 1;
  private storeName = 'devices';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('lastConnected', 'lastConnected', { unique: false });
        }
      };
    });
  }

  async storeDevice(device: BluetoothDevice): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Failed to initialize database');

    const deviceInfo: StoredBluetoothDevice = {
      id: device.id,
      name: device.name || 'Unknown Device',
      lastConnected: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(deviceInfo);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getLastDevice(): Promise<StoredBluetoothDevice | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('lastConnected');
      const request = index.openCursor(null, 'prev'); // Get most recent

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value);
        } else {
          resolve(null);
        }
      };
    });
  }

  async clearDevice(deviceId: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Failed to initialize database');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(deviceId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllDevices(): Promise<StoredBluetoothDevice[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

export const bluetoothDeviceStorage = new BluetoothDeviceStorage();