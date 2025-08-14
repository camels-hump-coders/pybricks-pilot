import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  directoryHandleAtom,
  directoryNameAtom,
  isRestoringDirectoryAtom,
  pythonFilesAtom,
  isPythonFilesLoadingAtom,
  pythonFilesErrorAtom,
  isRequestingDirectoryAtom,
  isReadingFileAtom,
  isWritingFileAtom,
  isCreatingFileAtom,
  fileContentCacheAtom,
  hasDirectoryAccessAtom,
  isFileSystemSupportedAtom,
  unmountDirectoryAtom,
  programCountAtom,
  allProgramsAtom,
} from "../store/atoms/fileSystem";

import {
  requestDirectoryAccessAtom,
  restoreLastDirectoryAtom,
  refreshPythonFilesAtom,
  readFileAtom,
  writeFileAtom,
  createFileAtom,
  createExampleProjectAtom,
  clearPersistedDataAtom,
  getFileContentAtom,
  setProgramSideAtom,
  getProgramMetadataAtom,
  getAllProgramsAtom,
  addToProgramsAtom,
  removeFromProgramsAtom,
  moveProgramUpAtom,
  moveProgramDownAtom,
  setProgramStartPositionAtom,
} from "../store/actions/fileSystemActions";

export function useJotaiFileSystem() {
  // Directory state
  const directoryHandle = useAtomValue(directoryHandleAtom);
  const directoryName = useAtomValue(directoryNameAtom);
  const hasDirectoryAccess = useAtomValue(hasDirectoryAccessAtom);
  const isRestoring = useAtomValue(isRestoringDirectoryAtom);
  const isRequestingDirectory = useAtomValue(isRequestingDirectoryAtom);
  
  // File state
  const pythonFiles = useAtomValue(pythonFilesAtom);
  const isPythonFilesLoading = useAtomValue(isPythonFilesLoadingAtom);
  const pythonFilesError = useAtomValue(pythonFilesErrorAtom);
  
  // Program state (derived from file state)
  const programCount = useAtomValue(programCountAtom);
  const allPrograms = useAtomValue(allProgramsAtom);
  
  // Operation status
  const isReadingFile = useAtomValue(isReadingFileAtom);
  const isWritingFile = useAtomValue(isWritingFileAtom);
  const isCreatingFile = useAtomValue(isCreatingFileAtom);
  
  // File content cache
  const fileContentCache = useAtomValue(fileContentCacheAtom);
  
  // Browser support
  const isSupported = useAtomValue(isFileSystemSupportedAtom);
  
  // Actions
  const requestDirectoryAccess = useSetAtom(requestDirectoryAccessAtom);
  const restoreLastDirectory = useSetAtom(restoreLastDirectoryAtom);
  const refreshFiles = useSetAtom(refreshPythonFilesAtom);
  const readFile = useSetAtom(readFileAtom);
  const writeFile = useSetAtom(writeFileAtom);
  const createFile = useSetAtom(createFileAtom);
  const createExampleProject = useSetAtom(createExampleProjectAtom);
  const unmountDirectory = useSetAtom(unmountDirectoryAtom);
  const clearPersistedData = useSetAtom(clearPersistedDataAtom);
  const getFileContentAction = useSetAtom(getFileContentAtom);
  
  // Program metadata actions
  const setProgramSide = useSetAtom(setProgramSideAtom);
  const setProgramStartPosition = useSetAtom(setProgramStartPositionAtom);
  const getProgramMetadata = useSetAtom(getProgramMetadataAtom);
  const getAllPrograms = useSetAtom(getAllProgramsAtom);
  const addToPrograms = useSetAtom(addToProgramsAtom);
  const removeFromPrograms = useSetAtom(removeFromProgramsAtom);
  const moveProgramUp = useSetAtom(moveProgramUpAtom);
  const moveProgramDown = useSetAtom(moveProgramDownAtom);
  
  // Auto-restore directory on component mount
  useEffect(() => {
    restoreLastDirectory();
  }, [restoreLastDirectory]);
  
  // Auto-refresh files periodically
  useEffect(() => {
    if (!directoryHandle) return;
    
    // Initial refresh
    refreshFiles();
    
    // Set up periodic refresh
    const interval = setInterval(() => {
      refreshFiles();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [directoryHandle, refreshFiles]);
  
  // Helper function to get file content (maintains backward compatibility)
  const getFileContent = useCallback((fileName: string) => {
    // Return a mock query-like object for backward compatibility
    const content = fileContentCache.get(fileName);
    const file = pythonFiles.find(f => f.name === fileName);
    
    return {
      data: content,
      isLoading: false,
      error: file ? null : new Error(`File ${fileName} not found`),
      refetch: async () => {
        if (file) {
          return await getFileContentAction(fileName);
        }
      },
    };
  }, [fileContentCache, pythonFiles, getFileContentAction]);
  
  return {
    // Directory management
    directoryHandle,
    directoryName,
    hasDirectoryAccess,
    requestDirectoryAccess,
    unmountDirectory,
    isRequestingDirectory,
    isRestoring,
    
    // File management
    pythonFiles,
    isPythonFilesLoading: isPythonFilesLoading || isRestoring,
    pythonFilesError,
    refreshFiles,
    
    // File operations
    readFile,
    writeFile,
    createFile,
    createExampleProject,
    getFileContent,
    
    // Program metadata operations
    setProgramSide,
    setProgramStartPosition,
    getProgramMetadata,
    getAllPrograms,
    addToPrograms,
    removeFromPrograms,
    moveProgramUp,
    moveProgramDown,
    
    // Program derived state
    programCount,
    allPrograms,
    
    // Browser support
    isSupported,
  };
}