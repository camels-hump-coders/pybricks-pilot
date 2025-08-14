import { atom } from "jotai";
import { fileSystemService } from "../../services/fileSystem";
import { programMetadataStorage } from "../../services/programMetadataStorage";
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
    // Get the basic file list from the file system service
    const filesWithInfo = await fileSystemService.listPythonFiles(directoryHandle);
    
    // Load program metadata and enrich the file objects
    const enrichedFiles: PythonFile[] = [];
    for (const file of filesWithInfo) {
      if (!file.isDirectory) {
        // Load metadata for individual files
        const metadata = await programMetadataStorage.getProgramMetadata(directoryHandle, file.name);
        enrichedFiles.push({
          ...file,
          programNumber: metadata?.programNumber,
          programSide: metadata?.programSide,
        });
      } else {
        // For directories, recursively enrich children
        const enrichedChildren: PythonFile[] = [];
        if (file.children) {
          for (const child of file.children) {
            if (!child.isDirectory) {
              const metadata = await programMetadataStorage.getProgramMetadata(directoryHandle, child.name);
              enrichedChildren.push({
                ...child,
                programNumber: metadata?.programNumber,
                programSide: metadata?.programSide,
              });
            } else {
              enrichedChildren.push(child);
            }
          }
        }
        enrichedFiles.push({
          ...file,
          children: enrichedChildren,
        });
      }
    }
    
    set(pythonFilesAtom, enrichedFiles);
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

// Create example project action
export const createExampleProjectAtom = atom(
  null,
  async (get, set) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    try {
      await fileSystemService.createExampleProject(directoryHandle);
      // Refresh file list to show the new example directory
      await set(refreshPythonFilesAtom);
      return true;
    } catch (error) {
      console.error("Failed to create example project:", error);
      throw error;
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

// Program metadata actions

// Set program number for a file
export const setProgramNumberAtom = atom(
  null,
  async (get, set, params: { fileName: string; programNumber: number | undefined }) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.setProgramNumber(
      directoryHandle,
      params.fileName,
      params.programNumber
    );

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  }
);

// Set program side for a file
export const setProgramSideAtom = atom(
  null,
  async (get, set, params: { fileName: string; programSide: "left" | "right" | undefined }) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.setProgramSide(
      directoryHandle,
      params.fileName,
      params.programSide
    );

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  }
);

// Get program metadata for a file
export const getProgramMetadataAtom = atom(
  null,
  async (get, set, fileName: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) return null;

    return await programMetadataStorage.getProgramMetadata(directoryHandle, fileName);
  }
);

// Get all programs with numbers
export const getAllProgramsWithNumbersAtom = atom(
  null,
  async (get, set) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) return [];

    return await programMetadataStorage.getAllProgramsWithNumbers(directoryHandle);
  }
);

// Get next available program number
export const getNextAvailableProgramNumberAtom = atom(
  null,
  async (get, set) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) return 1;

    return await programMetadataStorage.getNextAvailableProgramNumber(directoryHandle);
  }
);

// Add file to programs (atomic operation)
export const addToProgramsAtom = atom(
  null,
  async (get, set, fileName: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    // Get next available number
    const nextNumber = await programMetadataStorage.getNextAvailableProgramNumber(directoryHandle);
    
    // Set both number and side in one operation
    await programMetadataStorage.storeProgramMetadata(directoryHandle, fileName, {
      programNumber: nextNumber,
      programSide: "right" // Default to right
    });

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  }
);

// Remove from programs (atomic operation)
export const removeFromProgramsAtom = atom(
  null,
  async (get, set, fileName: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    // Remove both number and side in one operation
    await programMetadataStorage.storeProgramMetadata(directoryHandle, fileName, {
      programNumber: undefined,
      programSide: undefined
    });

    // Get all remaining programs with numbers and renumber them to eliminate gaps
    const remainingPrograms = await programMetadataStorage.getAllProgramsWithNumbers(directoryHandle);
    
    // Renumber all remaining programs sequentially (1, 2, 3, etc.)
    for (let i = 0; i < remainingPrograms.length; i++) {
      const program = remainingPrograms[i];
      const newNumber = i + 1; // Start from 1
      
      if (program.programNumber !== newNumber) {
        await programMetadataStorage.setProgramNumber(directoryHandle, program.fileName, newNumber);
      }
    }

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  }
);

// Move program up in order
export const moveProgramUpAtom = atom(
  null,
  async (get, set, fileName: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.moveProgramUp(directoryHandle, fileName);

    // Full refresh needed for reordering since we need to reload metadata for all files
    await set(refreshPythonFilesAtom);
  }
);

// Move program down in order
export const moveProgramDownAtom = atom(
  null,
  async (get, set, fileName: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.moveProgramDown(directoryHandle, fileName);

    // Full refresh needed for reordering since we need to reload metadata for all files
    await set(refreshPythonFilesAtom);
  }
);
