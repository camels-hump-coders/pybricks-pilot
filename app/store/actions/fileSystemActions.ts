import { atom } from "jotai";
import { fileSystemService } from "../../services/fileSystem";
import type { PythonFile } from "../../types/fileSystem";
import {
  directoryHandleAtom,
  directoryNameAtom,
  fileContentCacheAtom,
  isCreatingFileAtom,
  isPythonFilesLoadingAtom,
  isReadingFileAtom,
  isRequestingDirectoryAtom,
  isRestoringDirectoryAtom,
  isWritingFileAtom,
  pythonFilesAtom,
  pythonFilesErrorAtom,
  unmountDirectoryAtom,
} from "../atoms/fileSystem";

// Request directory access action
export const requestDirectoryAccessAtom = atom(null, async (get, set) => {
  set(isRequestingDirectoryAtom, true);

  try {
    const handle = await fileSystemService.requestDirectoryAccess();
    if (handle) {
      set(directoryHandleAtom, handle);
      set(directoryNameAtom, handle.name);
      // Trigger file list refresh
      await set(refreshPythonFilesAtom);
    }
    return handle;
  } finally {
    set(isRequestingDirectoryAtom, false);
  }
});

// Restore last directory action
export const restoreLastDirectoryAtom = atom(null, async (get, set) => {
  set(isRestoringDirectoryAtom, true);

  try {
    const restoredHandle = await fileSystemService.restoreLastDirectory();
    if (restoredHandle) {
      set(directoryHandleAtom, restoredHandle);
      set(directoryNameAtom, restoredHandle.name);
      // Trigger file list refresh
      await set(refreshPythonFilesAtom);
    }
    return restoredHandle;
  } catch (error) {
    console.warn("Failed to restore directory:", error);
    return null;
  } finally {
    set(isRestoringDirectoryAtom, false);
  }
});

// Refresh Python files action
export const refreshPythonFilesAtom = atom(null, async (get, set) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) return;

  set(isPythonFilesLoadingAtom, true);
  set(pythonFilesErrorAtom, null);

  try {
    const fileHandles =
      await fileSystemService.listPythonFiles(directoryHandle);

    // Get file info for each handle
    const filesWithInfo = await Promise.all(
      fileHandles.map(async (handle) => {
        const fileInfo = await fileSystemService.getFileInfo(handle);
        return {
          handle,
          name: fileInfo.name,
          size: fileInfo.size,
          lastModified: fileInfo.lastModified,
          relativePath: fileInfo.relativePath,
        } as PythonFile;
      })
    );

    set(pythonFilesAtom, filesWithInfo);
  } catch (error) {
    set(pythonFilesErrorAtom, error as Error);
  } finally {
    set(isPythonFilesLoadingAtom, false);
  }
});

// Read file action
export const readFileAtom = atom(
  null,
  async (get, set, fileHandle: FileSystemFileHandle) => {
    set(isReadingFileAtom, true);

    try {
      const content = await fileSystemService.readFile(fileHandle);

      // Update cache
      const cache = get(fileContentCacheAtom);
      const newCache = new Map(cache);
      newCache.set(fileHandle.name, content);
      set(fileContentCacheAtom, newCache);

      return content;
    } finally {
      set(isReadingFileAtom, false);
    }
  }
);

// Write file action
export const writeFileAtom = atom(
  null,
  async (
    get,
    set,
    params: { handle: FileSystemFileHandle; content: string }
  ) => {
    set(isWritingFileAtom, true);

    try {
      await fileSystemService.writeFile(params.handle, params.content);

      // Update cache
      const cache = get(fileContentCacheAtom);
      const newCache = new Map(cache);
      newCache.set(params.handle.name, params.content);
      set(fileContentCacheAtom, newCache);

      return params.content;
    } finally {
      set(isWritingFileAtom, false);
    }
  }
);

// Create file action
export const createFileAtom = atom(
  null,
  async (get, set, params: { name: string; content: string }) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    set(isCreatingFileAtom, true);

    try {
      const fileHandle = await fileSystemService.createFile(
        directoryHandle,
        params.name,
        params.content
      );

      // Refresh file list
      await set(refreshPythonFilesAtom);

      return fileHandle;
    } finally {
      set(isCreatingFileAtom, false);
    }
  }
);

// Clear persisted data action
export const clearPersistedDataAtom = atom(null, async (get, set) => {
  try {
    await fileSystemService.clearPersistedData();
    set(unmountDirectoryAtom);
  } catch (error) {
    console.warn("Failed to clear persisted data:", error);
  }
});

// Get file content from cache or read it
export const getFileContentAtom = atom(
  null,
  async (get, set, fileName: string) => {
    const cache = get(fileContentCacheAtom);

    // Check cache first
    if (cache.has(fileName)) {
      return cache.get(fileName);
    }

    // Find file and read it
    const files = get(pythonFilesAtom);
    const file = files.find((f) => f.name === fileName);

    if (!file) {
      throw new Error(`File ${fileName} not found`);
    }

    return await set(readFileAtom, file.handle);
  }
);
