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

// Helper function to count programs recursively
const countProgramsRecursively = (files: PythonFile[]): number => {
  let count = 0;
  files.forEach(file => {
    if (file.isDirectory && file.children) {
      count += countProgramsRecursively(file.children);
    } else if (!file.isDirectory && file.programNumber) {
      count++;
    }
  });
  return count;
};

// Helper function to get all programs recursively
const getAllProgramsRecursively = (files: PythonFile[]): PythonFile[] => {
  const programs: PythonFile[] = [];
  files.forEach(file => {
    if (file.isDirectory && file.children) {
      programs.push(...getAllProgramsRecursively(file.children));
    } else if (!file.isDirectory && file.programNumber) {
      programs.push(file);
    }
  });
  return programs;
};

// Derived atoms
export const hasDirectoryAccessAtom = atom((get) => !!get(directoryHandleAtom));
export const isFileSystemSupportedAtom = atom(
  () => "showDirectoryPicker" in window
);

// Derived atom for program count
export const programCountAtom = atom((get) => {
  const pythonFiles = get(pythonFilesAtom);
  return countProgramsRecursively(pythonFiles);
});

// Derived atom for all programs with numbers
export const allProgramsAtom = atom((get) => {
  const pythonFiles = get(pythonFilesAtom);
  return getAllProgramsRecursively(pythonFiles);
});

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
