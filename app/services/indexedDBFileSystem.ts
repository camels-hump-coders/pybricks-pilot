interface StoredDirectoryInfo {
  name: string;
  handle: FileSystemDirectoryHandle;
  lastAccessed: number;
  fileCount: number;
}

interface StoredFileInfo {
  name: string;
  directoryName: string;
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
  lastAccessed: number;
}

class IndexedDBFileSystemService {
  private dbName = "PybricksFileSystem";
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create stores for directory and file handles
        if (!db.objectStoreNames.contains("directories")) {
          const dirStore = db.createObjectStore("directories", {
            keyPath: "name",
          });
          dirStore.createIndex("lastAccessed", "lastAccessed", {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains("files")) {
          const fileStore = db.createObjectStore("files", {
            keyPath: ["directoryName", "name"],
          });
          fileStore.createIndex("directoryName", "directoryName", {
            unique: false,
          });
          fileStore.createIndex("lastAccessed", "lastAccessed", {
            unique: false,
          });
        }

        // Create store for user preferences
        if (!db.objectStoreNames.contains("preferences")) {
          db.createObjectStore("preferences", { keyPath: "key" });
        }
      };
    });
  }

  async storeDirectoryHandle(
    handle: FileSystemDirectoryHandle,
    fileCount: number
  ): Promise<void> {
    if (!this.db) await this.initialize();

    const directoryInfo: StoredDirectoryInfo = {
      name: handle.name,
      handle,
      lastAccessed: Date.now(),
      fileCount,
    };

    const transaction = this.db!.transaction(["directories"], "readwrite");
    const store = transaction.objectStore("directories");

    await new Promise<void>((resolve, reject) => {
      const request = store.put(directoryInfo);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Also store as the current directory preference
    await this.setPreference("currentDirectory", handle.name);
  }

  async getStoredDirectories(): Promise<StoredDirectoryInfo[]> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(["directories"], "readonly");
    const store = transaction.objectStore("directories");
    const index = store.index("lastAccessed");

    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => {
        const directories = request.result.sort(
          (a: StoredDirectoryInfo, b: StoredDirectoryInfo) =>
            b.lastAccessed - a.lastAccessed
        );
        resolve(directories);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getLastUsedDirectory(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const currentDirName = await this.getPreference("currentDirectory");
      if (!currentDirName) return null;

      const directories = await this.getStoredDirectories();
      const lastDir = directories.find((d) => d.name === currentDirName);

      if (!lastDir) return null;

      // Verify the handle is still valid by trying to access it
      try {
        // Try to read the directory to verify access - just iterate once to test access
        for await (const entry of lastDir.handle.entries()) {
          // We only need to verify we can access the directory, so break immediately
          break;
        }
        // Update last accessed time
        await this.storeDirectoryHandle(lastDir.handle, lastDir.fileCount);
        return lastDir.handle;
      } catch (error) {
        // Handle is no longer valid, remove it
        await this.removeDirectory(lastDir.name);
        return null;
      }
    } catch (error) {
      console.warn("Error getting last used directory:", error);
      return null;
    }
  }

  async storeFileHandles(
    directoryName: string,
    files: Array<{
      handle: FileSystemFileHandle;
      size: number;
      lastModified: number;
    }>
  ): Promise<void> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");

    // Clear existing files for this directory
    const index = store.index("directoryName");
    const deleteRequest = index.getAll(directoryName);

    await new Promise<void>((resolve, reject) => {
      deleteRequest.onsuccess = () => {
        const existingFiles = deleteRequest.result;
        const deletePromises = existingFiles.map(
          (file: StoredFileInfo) =>
            new Promise<void>((res, rej) => {
              const delReq = store.delete([file.directoryName, file.name]);
              delReq.onsuccess = () => res();
              delReq.onerror = () => rej(delReq.error);
            })
        );

        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(reject);
      };
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });

    // Store new files
    const storePromises = files.map((file) => {
      const fileInfo: StoredFileInfo = {
        name: file.handle.name,
        directoryName,
        handle: file.handle,
        size: file.size,
        lastModified: file.lastModified,
        lastAccessed: Date.now(),
      };

      return new Promise<void>((resolve, reject) => {
        const request = store.put(fileInfo);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(storePromises);
  }

  async getStoredFiles(directoryName: string): Promise<StoredFileInfo[]> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(["files"], "readonly");
    const store = transaction.objectStore("files");
    const index = store.index("directoryName");

    return new Promise((resolve, reject) => {
      const request = index.getAll(directoryName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async verifyFileAccess(files: StoredFileInfo[]): Promise<StoredFileInfo[]> {
    const validFiles: StoredFileInfo[] = [];

    for (const file of files) {
      try {
        // Try to access the file to verify it's still available
        await file.handle.getFile();
        validFiles.push(file);
      } catch (error) {
        // File is no longer accessible, we'll remove it from the list
        console.warn(`File ${file.name} is no longer accessible:`, error);
        await this.removeFile(file.directoryName, file.name);
      }
    }

    return validFiles;
  }

  async removeDirectory(name: string): Promise<void> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(
      ["directories", "files"],
      "readwrite"
    );

    // Remove directory
    const dirStore = transaction.objectStore("directories");
    await new Promise<void>((resolve, reject) => {
      const request = dirStore.delete(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Remove all files in this directory
    const fileStore = transaction.objectStore("files");
    const index = fileStore.index("directoryName");
    const filesRequest = index.getAll(name);

    await new Promise<void>((resolve, reject) => {
      filesRequest.onsuccess = () => {
        const files = filesRequest.result;
        const deletePromises = files.map(
          (file: StoredFileInfo) =>
            new Promise<void>((res, rej) => {
              const delReq = fileStore.delete([file.directoryName, file.name]);
              delReq.onsuccess = () => res();
              delReq.onerror = () => rej(delReq.error);
            })
        );

        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(reject);
      };
      filesRequest.onerror = () => reject(filesRequest.error);
    });

    // Clear current directory preference if it was this directory
    const currentDir = await this.getPreference("currentDirectory");
    if (currentDir === name) {
      await this.setPreference("currentDirectory", null);
    }
  }

  async removeFile(directoryName: string, fileName: string): Promise<void> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");

    await new Promise<void>((resolve, reject) => {
      const request = store.delete([directoryName, fileName]);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async setPreference(key: string, value: any): Promise<void> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(["preferences"], "readwrite");
    const store = transaction.objectStore("preferences");

    await new Promise<void>((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPreference(key: string): Promise<any> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(["preferences"], "readonly");
    const store = transaction.objectStore("preferences");

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result?.value || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(
      ["directories", "files", "preferences"],
      "readwrite"
    );

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const request = transaction.objectStore("directories").clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise<void>((resolve, reject) => {
        const request = transaction.objectStore("files").clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise<void>((resolve, reject) => {
        const request = transaction.objectStore("preferences").clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    ]);
  }

  async getStorageInfo(): Promise<{
    directories: number;
    files: number;
    totalSize: number;
  }> {
    if (!this.db) await this.initialize();

    const transaction = this.db!.transaction(
      ["directories", "files"],
      "readonly"
    );

    const [directories, files] = await Promise.all([
      new Promise<StoredDirectoryInfo[]>((resolve, reject) => {
        const request = transaction.objectStore("directories").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
      new Promise<StoredFileInfo[]>((resolve, reject) => {
        const request = transaction.objectStore("files").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    ]);

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    return {
      directories: directories.length,
      files: files.length,
      totalSize,
    };
  }
}

export const indexedDBFileSystemService = new IndexedDBFileSystemService();
