import { atom } from "jotai";
import type { PythonFile } from "../../types/fileSystem";

// Directory state atoms
export const directoryHandleAtom = atom<FileSystemDirectoryHandle | null>(null);
export const directoryNameAtom = atom<string>("");
export const isRestoringDirectoryAtom = atom<boolean>(true);

// File state atoms
export const pythonFilesAtom = atom<PythonFile[]>([]);
export const isPythonFilesLoadingAtom = atom<boolean>(false);
export const pythonFilesErrorAtom = atom<Error | null>(null);

// File operation status atoms
export const isRequestingDirectoryAtom = atom<boolean>(false);
export const isReadingFileAtom = atom<boolean>(false);
export const isWritingFileAtom = atom<boolean>(false);
export const isCreatingFileAtom = atom<boolean>(false);

// File content cache atoms
export const fileContentCacheAtom = atom<Map<string, string>>(new Map());

// Derived atoms
export const hasDirectoryAccessAtom = atom((get) => !!get(directoryHandleAtom));
export const isFileSystemSupportedAtom = atom(
  () => "showDirectoryPicker" in window
);

// Action atoms
export const unmountDirectoryAtom = atom(null, (get, set) => {
  set(directoryHandleAtom, null);
  set(directoryNameAtom, "");
  set(pythonFilesAtom, []);
  set(fileContentCacheAtom, new Map());
  set(pythonFilesErrorAtom, null);
});

export const refreshFilesAtom = atom(null, async (get, set) => {
  const handle = get(directoryHandleAtom);
  if (!handle) return;

  set(isPythonFilesLoadingAtom, true);
  try {
    // This will be implemented with the actual file system service
    // For now, just reset the loading state
    set(isPythonFilesLoadingAtom, false);
  } catch (error) {
    set(pythonFilesErrorAtom, error as Error);
    set(isPythonFilesLoadingAtom, false);
  }
});
