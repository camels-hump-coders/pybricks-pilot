interface FileSystemService {
  requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null>;
  restoreLastDirectory(): Promise<FileSystemDirectoryHandle | null>;
  readFile(fileHandle: FileSystemFileHandle): Promise<string>;
  writeFile(fileHandle: FileSystemFileHandle, content: string): Promise<void>;
  listPythonFiles(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<FileSystemFileHandle[]>;
  createFile(
    dirHandle: FileSystemDirectoryHandle,
    name: string,
    content: string
  ): Promise<FileSystemFileHandle>;
  persistDirectoryAccess(dirHandle: FileSystemDirectoryHandle): Promise<void>;
  clearPersistedData(): Promise<void>;
}

class WebFileSystemService implements FileSystemService {
  private indexedDBService = import("./indexedDBFileSystem").then(
    (m) => m.indexedDBFileSystemService
  );

  async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
    if (!("showDirectoryPicker" in window)) {
      throw new Error(
        "File System Access API is not supported in this browser"
      );
    }

    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: "readwrite",
        startIn: "documents",
      });

      if (dirHandle) {
        await this.persistDirectoryAccess(dirHandle);
      }

      return dirHandle;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return null;
      }
      throw error;
    }
  }

  async restoreLastDirectory(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const indexedDB = await this.indexedDBService;
      await indexedDB.initialize();
      return await indexedDB.getLastUsedDirectory();
    } catch (error) {
      console.warn("Failed to restore last directory:", error);
      return null;
    }
  }

  async readFile(fileHandle: FileSystemFileHandle): Promise<string> {
    const file = await fileHandle.getFile();
    return await file.text();
  }

  async writeFile(
    fileHandle: FileSystemFileHandle,
    content: string
  ): Promise<void> {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async listPythonFiles(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<FileSystemFileHandle[]> {
    const pythonFiles: FileSystemFileHandle[] = [];

    // Recursively search for Python files
    await this.searchPythonFiles(dirHandle, pythonFiles);

    // Sort files by name
    pythonFiles.sort((a, b) => a.name.localeCompare(b.name));

    return pythonFiles;
  }

  private async searchPythonFiles(
    dirHandle: FileSystemDirectoryHandle,
    pythonFiles: FileSystemFileHandle[],
    depth = 0
  ): Promise<void> {
    // Limit recursion depth to prevent infinite loops
    if (depth > 3) return;

    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === "file" && name.endsWith(".py")) {
        pythonFiles.push(handle as FileSystemFileHandle);
      } else if (handle.kind === "directory" && !name.startsWith(".")) {
        // Recursively search subdirectories (excluding hidden ones)
        await this.searchPythonFiles(
          handle as FileSystemDirectoryHandle,
          pythonFiles,
          depth + 1
        );
      }
    }
  }

  async getFileInfo(fileHandle: FileSystemFileHandle): Promise<{
    name: string;
    size: number;
    lastModified: number;
    relativePath?: string;
  }> {
    const file = await fileHandle.getFile();
    return {
      name: fileHandle.name,
      size: file.size,
      lastModified: file.lastModified,
      // relativePath would need to be calculated based on directory structure
    };
  }

  async watchDirectory(
    dirHandle: FileSystemDirectoryHandle,
    callback: (files: FileSystemFileHandle[]) => void
  ): Promise<() => void> {
    let isWatching = true;

    const checkForUpdates = async () => {
      if (!isWatching) return;

      try {
        const files = await this.listPythonFiles(dirHandle);
        callback(files);
      } catch (error) {
        console.warn("Error watching directory:", error);
      }

      // Check again in 2 seconds
      if (isWatching) {
        setTimeout(checkForUpdates, 2000);
      }
    };

    // Initial check
    checkForUpdates();

    // Return cleanup function
    return () => {
      isWatching = false;
    };
  }

  async createFile(
    dirHandle: FileSystemDirectoryHandle,
    name: string,
    content: string
  ): Promise<FileSystemFileHandle> {
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    await this.writeFile(fileHandle, content);
    return fileHandle;
  }

  async persistDirectoryAccess(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    try {
      const indexedDB = await this.indexedDBService;
      await indexedDB.initialize();

      // Get file count for storage
      const files = await this.listPythonFiles(dirHandle);
      await indexedDB.storeDirectoryHandle(dirHandle, files.length);

      // Store file handles with metadata
      const filesWithInfo = await Promise.all(
        files.map(async (fileHandle) => {
          const file = await fileHandle.getFile();
          return {
            handle: fileHandle,
            size: file.size,
            lastModified: file.lastModified,
          };
        })
      );

      await indexedDB.storeFileHandles(dirHandle.name, filesWithInfo);
    } catch (error) {
      console.warn("Failed to persist directory access:", error);
    }
  }

  async clearPersistedData(): Promise<void> {
    try {
      const indexedDB = await this.indexedDBService;
      await indexedDB.initialize();
      await indexedDB.clearAll();
    } catch (error) {
      console.warn("Failed to clear persisted data:", error);
    }
  }
}

export const fileSystemService = new WebFileSystemService();

declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: "read" | "readwrite";
      startIn?:
        | "desktop"
        | "documents"
        | "downloads"
        | "music"
        | "pictures"
        | "videos";
    }): Promise<FileSystemDirectoryHandle>;
  }
}
