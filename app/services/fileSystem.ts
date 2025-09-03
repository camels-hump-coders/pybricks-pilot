import type { PythonFile } from "../types/fileSystem";

interface FileSystemService {
  requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null>;
  restoreLastDirectory(): Promise<FileSystemDirectoryHandle | null>;
  readFile(fileHandle: FileSystemFileHandle): Promise<string>;
  writeFile(fileHandle: FileSystemFileHandle, content: string): Promise<void>;
  listPythonFiles(dirHandle: FileSystemDirectoryHandle): Promise<PythonFile[]>;
  createFile(
    dirHandle: FileSystemDirectoryHandle,
    name: string,
    content: string,
  ): Promise<FileSystemFileHandle>;
  persistDirectoryAccess(dirHandle: FileSystemDirectoryHandle): Promise<void>;
  clearPersistedData(): Promise<void>;
}

class WebFileSystemService implements FileSystemService {
  private indexedDBService = import("./indexedDBFileSystem").then(
    (m) => m.indexedDBFileSystemService,
  );

  private isFileHandle(
    handle: FileSystemHandle,
  ): handle is FileSystemFileHandle {
    return handle.kind === "file";
  }

  private isDirectoryHandle(
    handle: FileSystemHandle,
  ): handle is FileSystemDirectoryHandle {
    return handle.kind === "directory";
  }

  async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
    if (!("showDirectoryPicker" in window)) {
      throw new Error(
        "File System Access API is not supported in this browser",
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
    content: string,
  ): Promise<void> {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async listPythonFiles(
    dirHandle: FileSystemDirectoryHandle,
  ): Promise<PythonFile[]> {
    const pythonFiles: PythonFile[] = [];

    // Recursively search for Python files and build hierarchical structure
    await this.searchPythonFiles(dirHandle, pythonFiles, "");

    // Sort files by name within each directory
    this.sortFilesRecursively(pythonFiles);

    return pythonFiles;
  }

  private async searchPythonFiles(
    dirHandle: FileSystemDirectoryHandle,
    pythonFiles: PythonFile[],
    currentPath: string,
  ): Promise<void> {
    // Limit recursion depth to prevent infinite loops
    if (currentPath.split("/").length > 10) return;

    for await (const [name, handle] of dirHandle.entries()) {
      const relativePath = currentPath ? `${currentPath}/${name}` : name;

      if (this.isFileHandle(handle) && name.endsWith(".py")) {
        const fileInfo = await this.getFileInfo(handle);
        pythonFiles.push({
          handle,
          name: fileInfo.name,
          size: fileInfo.size,
          lastModified: fileInfo.lastModified,
          relativePath: relativePath,
          isDirectory: false,
        });
      } else if (this.isDirectoryHandle(handle) && !name.startsWith(".")) {
        // Create directory entry
        const children: PythonFile[] = [];
        const dirEntry: PythonFile = {
          handle,
          name: name,
          size: 0,
          lastModified: Date.now(),
          relativePath: relativePath,
          isDirectory: true,
          children,
        };

        // Recursively search subdirectories
        await this.searchPythonFiles(handle, children, relativePath);

        // Only add directory if it contains Python files
        if (children.length > 0) {
          pythonFiles.push(dirEntry);
        }
      }
    }
  }

  private sortFilesRecursively(files: PythonFile[]): void {
    // Sort files by name
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    // Sort children recursively
    files.forEach((file) => {
      if (file.children && file.children.length > 0) {
        this.sortFilesRecursively(file.children);
      }
    });
  }

  async getFileInfo(fileHandle: FileSystemFileHandle): Promise<{
    name: string;
    size: number;
    lastModified: number;
    relativePath: string;
  }> {
    const file = await fileHandle.getFile();
    return {
      name: fileHandle.name,
      size: file.size,
      lastModified: file.lastModified,
      relativePath: fileHandle.name, // This will be overridden by the calling method
    };
  }

  async watchDirectory(
    dirHandle: FileSystemDirectoryHandle,
    callback: (files: PythonFile[]) => void,
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
    content: string,
  ): Promise<FileSystemFileHandle> {
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    await this.writeFile(fileHandle, content);
    return fileHandle;
  }

  async createDirectory(
    parentHandle: FileSystemDirectoryHandle,
    name: string,
  ): Promise<FileSystemDirectoryHandle> {
    return await parentHandle.getDirectoryHandle(name, { create: true });
  }

  async createExampleProject(
    dirHandle: FileSystemDirectoryHandle,
  ): Promise<void> {
    // Create example directory
    const exampleDir = await this.createDirectory(dirHandle, "example");

    // Import the template generator
    const { generatePybricksTemplate } = await import(
      "../utils/pybricksAnalyzer"
    );

    // Create program.py with the template
    const template = generatePybricksTemplate("prime");
    await this.createFile(exampleDir, "program.py", template);
  }

  async persistDirectoryAccess(
    dirHandle: FileSystemDirectoryHandle,
  ): Promise<void> {
    try {
      const indexedDB = await this.indexedDBService;
      await indexedDB.initialize();

      // Get file count for storage
      const files = await this.listPythonFiles(dirHandle);
      const fileCount = this.countPythonFilesRecursively(files);
      await indexedDB.storeDirectoryHandle(dirHandle, fileCount);

      // Store file handles with metadata - extract only actual files, not directories
      const filesWithInfo = await Promise.all(
        this.extractFileHandlesRecursively(files).map(async (fileHandle) => {
          const file = await fileHandle.getFile();
          return {
            handle: fileHandle,
            size: file.size,
            lastModified: file.lastModified,
          };
        }),
      );

      await indexedDB.storeFileHandles(dirHandle.name, filesWithInfo);
    } catch (error) {
      console.warn("Failed to persist directory access:", error);
    }
  }

  private countPythonFilesRecursively(files: PythonFile[]): number {
    let count = 0;
    files.forEach((file) => {
      if (file.isDirectory && file.children) {
        count += this.countPythonFilesRecursively(file.children);
      } else if (!file.isDirectory) {
        count++;
      }
    });
    return count;
  }

  private extractFileHandlesRecursively(
    files: PythonFile[],
  ): FileSystemFileHandle[] {
    const fileHandles: FileSystemFileHandle[] = [];
    files.forEach((file) => {
      if (file.isDirectory && file.children) {
      fileHandles.push(...this.extractFileHandlesRecursively(file.children));
    } else if (!file.isDirectory && "getFile" in file.handle) {
      fileHandles.push(file.handle);
    }
    });
    return fileHandles;
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
