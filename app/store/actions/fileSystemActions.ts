import { atom } from "jotai";
import { fileSystemService } from "../../services/fileSystem";
import { programMetadataStorage } from "../../services/programMetadataStorage";
import type { PythonFile, RobotStartPosition } from "../../types/fileSystem";
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

// Helper function to recursively enrich file metadata at any depth
async function enrichFileRecursively(
  file: PythonFile,
  directoryHandle: FileSystemDirectoryHandle,
): Promise<PythonFile> {
  if (!file.isDirectory) {
    // For files, get metadata and return enriched file
    const metadata = await programMetadataStorage.getProgramMetadata(
      directoryHandle,
      file.relativePath,
    );
    return {
      ...file,
      programStartPosition: metadata?.programStartPosition,
    };
  } else {
    // For directories, recursively process all children
    const enrichedChildren: PythonFile[] = [];
    if (file.children) {
      for (const child of file.children) {
        // Recursively enrich each child (file or directory)
        enrichedChildren.push(
          await enrichFileRecursively(child, directoryHandle),
        );
      }
    }
    return {
      ...file,
      children: enrichedChildren,
    };
  }
}

// Request directory access action
export const requestDirectoryAccessAtom = atom(null, async (_get, set) => {
  set(isRequestingDirectoryAtom, true);

  try {
    console.log("requestDirectoryAccessAtom");
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

// Flag to prevent multiple simultaneous restoration attempts
const restorationAttemptedAtom = atom(false);

// Restore last directory action
export const restoreLastDirectoryAtom = atom(null, async (get, set) => {
  // Prevent multiple simultaneous restoration attempts
  const alreadyAttempted = get(restorationAttemptedAtom);
  const isCurrentlyRestoring = get(isRestoringDirectoryAtom);
  const hasDirectory = get(directoryHandleAtom);

  if (alreadyAttempted || isCurrentlyRestoring || hasDirectory) {
    return hasDirectory;
  }

  set(restorationAttemptedAtom, true);
  set(isRestoringDirectoryAtom, true);

  try {
    console.log("restoreLastDirectoryAtom");
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
    const filesWithInfo =
      await fileSystemService.listPythonFiles(directoryHandle);

    // Load programs manifest for program number calculation
    const programsManifest =
      await programMetadataStorage.getAllPrograms(directoryHandle);

    // Store programs manifest in atom for UI access
    const { programsManifestAtom } = await import("../atoms/fileSystem");
    set(programsManifestAtom, programsManifest);

    // Load program metadata and enrich the file objects recursively
    const enrichedFiles: PythonFile[] = [];
    for (const file of filesWithInfo) {
      enrichedFiles.push(await enrichFileRecursively(file, directoryHandle));
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
  },
);

// Write file action
export const writeFileAtom = atom(
  null,
  async (
    get,
    set,
    params: { handle: FileSystemFileHandle; content: string },
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
  },
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
        params.content,
      );

      // Refresh file list
      await set(refreshPythonFilesAtom);

      return fileHandle;
    } finally {
      set(isCreatingFileAtom, false);
    }
  },
);

// Create example project action
export const createExampleProjectAtom = atom(null, async (get, set) => {
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
});

// Clear persisted data action
const clearPersistedDataAtom = atom(null, async (_get, set) => {
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

      if (!file || file.isDirectory || !("getFile" in file.handle)) {
        throw new Error(`File ${fileName} not found`);
      }

      return await set(readFileAtom, file.handle);
  },
);

// Program metadata actions

// Add program to the list (position determines program number)
export const addToProgramsAtom = atom(
  null,
  async (get, set, relativePath: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.addProgram(
      directoryHandle,
      relativePath,
      "right", // Default to right side
    );

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  },
);

// Set program side for a file
export const setProgramSideAtom = atom(
  null,
  async (
    get,
    set,
    params: { relativePath: string; programSide: "left" | "right" | undefined },
  ) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.setProgramSide(
      directoryHandle,
      params.relativePath,
      params.programSide,
    );

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  },
);

// Get program metadata for a file
export const getProgramMetadataAtom = atom(
  null,
  async (get, _set, relativePath: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) return null;

    return await programMetadataStorage.getProgramMetadata(
      directoryHandle,
      relativePath,
    );
  },
);

// Get all programs in order
export const getAllProgramsAtom = atom(null, async (get, _set) => {
  const directoryHandle = get(directoryHandleAtom);
  if (!directoryHandle) return [];

  return await programMetadataStorage.getAllPrograms(directoryHandle);
});

// Remove from programs (atomic operation)
export const removeFromProgramsAtom = atom(
  null,
  async (get, set, relativePath: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    // Remove program from the array (automatically fixes numbering)
    await programMetadataStorage.removeProgramMetadata(
      directoryHandle,
      relativePath,
    );

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  },
);

// Move program up in order
export const moveProgramUpAtom = atom(
  null,
  async (get, set, relativePath: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.moveProgramUp(directoryHandle, relativePath);

    // Full refresh needed for reordering since we need to reload metadata for all files
    await set(refreshPythonFilesAtom);
  },
);

// Move program down in order
export const moveProgramDownAtom = atom(
  null,
  async (get, set, relativePath: string) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.moveProgramDown(directoryHandle, relativePath);

    // Full refresh needed for reordering since we need to reload metadata for all files
    await set(refreshPythonFilesAtom);
  },
);

// Set program start position for a file
export const setProgramStartPositionAtom = atom(
  null,
  async (
    get,
    set,
    params: {
      relativePath: string;
      programStartPosition: RobotStartPosition | undefined;
    },
  ) => {
    const directoryHandle = get(directoryHandleAtom);
    if (!directoryHandle) throw new Error("No directory selected");

    await programMetadataStorage.setProgramStartPosition(
      directoryHandle,
      params.relativePath,
      params.programStartPosition,
    );

    // Refresh to get the latest state from filesystem
    await set(refreshPythonFilesAtom);
  },
);
