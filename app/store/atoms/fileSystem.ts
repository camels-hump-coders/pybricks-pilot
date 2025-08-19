import { atom } from "jotai";
import type { PythonFile } from "../../types/fileSystem";

// Directory state atoms
export const directoryHandleAtom = atom<FileSystemDirectoryHandle | null>(null);
export const directoryNameAtom = atom<string>("");
export const isRestoringDirectoryAtom = atom<boolean>(false);

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

// Programs manifest atom - stores the config/programs.json data
export const programsManifestAtom = atom<
  {
    relativePath: string;
    programSide?: "left" | "right";
    programStartPosition?: import("../../types/fileSystem").RobotStartPosition;
  }[]
>([]);

// Helper function to find a file by relative path recursively
const findFileByPath = (
  files: PythonFile[],
  relativePath: string,
): PythonFile | null => {
  for (const file of files) {
    if (file.relativePath === relativePath && !file.isDirectory) {
      return file;
    }
    if (file.isDirectory && file.children) {
      const found = findFileByPath(file.children, relativePath);
      if (found) return found;
    }
  }
  return null;
};

// Derived atoms
export const hasDirectoryAccessAtom = atom((get) => !!get(directoryHandleAtom));
export const isFileSystemSupportedAtom = atom(
  () => "showDirectoryPicker" in window,
);

// Stable directory access atom - only depends on directory name, not the handle object
export const stableDirectoryAccessAtom = atom((get) => {
  const directoryName = get(directoryNameAtom);
  const hasAccess = get(hasDirectoryAccessAtom);
  return hasAccess && directoryName ? directoryName : null;
});

// Derived atom for program count
export const programCountAtom = atom((get) => {
  const programsManifest = get(programsManifestAtom);
  return programsManifest.length;
});

// Derived atom for all programs with numbers (includes program number and file data)
export const allProgramsAtom = atom((get) => {
  const pythonFiles = get(pythonFilesAtom);
  const programsManifest = get(programsManifestAtom);

  const programs: (PythonFile & { programNumber: number })[] = [];

  programsManifest.forEach((programMeta, index) => {
    const file = findFileByPath(pythonFiles, programMeta.relativePath);
    if (file) {
      programs.push({
        ...file,
        programNumber: index + 1, // 1-based program number from array position
        programStartPosition: programMeta.programStartPosition,
      });
    }
  });

  return programs;
});

// Helper atom to get program info for a specific file
export const getProgramInfoAtom = atom((get) => {
  return (relativePath: string) => {
    const programsManifest = get(programsManifestAtom);
    const index = programsManifest.findIndex(
      (p) => p.relativePath === relativePath,
    );

    if (index >= 0) {
      return {
        programNumber: index + 1, // 1-based
        programStartPosition: programsManifest[index].programStartPosition,
        isProgram: true,
      };
    }

    return {
      programNumber: undefined,
      programStartPosition: undefined,
      isProgram: false,
    };
  };
});

// Action atoms
export const unmountDirectoryAtom = atom(null, (_get, set) => {
  set(directoryHandleAtom, null);
  set(directoryNameAtom, "");
  set(pythonFilesAtom, []);
  set(fileContentCacheAtom, new Map());
  set(pythonFilesErrorAtom, null);
});
