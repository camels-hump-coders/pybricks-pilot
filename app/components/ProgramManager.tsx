import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useUploadProgress } from "../hooks/useUploadProgress";
import type { DebugEvent, ProgramStatus } from "../services/pybricksHub";
import type { PythonFile } from "../types/fileSystem";
import { FileBrowser } from "./FileBrowser";

interface ProgramManagerProps {
  // Directory and file management
  directoryName: string;
  pythonFiles: PythonFile[];
  hasDirectoryAccess: boolean;
  isPythonFilesLoading: boolean;
  pythonFilesError: Error | null;
  isRestoring?: boolean;
  onRefreshFiles: () => void;
  onUnmountDirectory: () => void;
  onRequestDirectoryAccess: () => Promise<void>;

  // Program operations
  onRunProgram: () => Promise<void>;
  onStopProgram: () => Promise<void>;
  onUploadAndRunFile: (file: PythonFile, content: string) => Promise<void>;
  onCreateFile: () => void;
  onCreateExampleProject?: () => Promise<void>;

  // Status
  programStatus: ProgramStatus;
  isConnected: boolean;
  isUploading: boolean;
  isRunning: boolean;
  isStopping: boolean;
  isCompiling: boolean;
  debugEvents: DebugEvent[];
  className?: string;
}

export function ProgramManager({
  directoryName,
  pythonFiles,
  hasDirectoryAccess,
  isPythonFilesLoading,
  pythonFilesError,
  isRestoring = false,
  onRefreshFiles,
  onUnmountDirectory,
  onRequestDirectoryAccess,
  onRunProgram,
  onStopProgram,
  onUploadAndRunFile,
  onCreateFile,
  onCreateExampleProject,
  programStatus,
  isConnected,
  isUploading,
  isRunning,
  isStopping,
  isCompiling,
  debugEvents,
  className = "",
}: ProgramManagerProps) {
  const { uploadProgress } = useUploadProgress(debugEvents);

  // Get program metadata handlers and shared state from the filesystem hook
  const {
    setProgramNumber,
    setProgramSide,
    getNextAvailableProgramNumber,
    moveProgramUp,
    moveProgramDown,
    addToPrograms,
    removeFromPrograms,
    programCount,
    allPrograms,
  } = useJotaiFileSystem();

  const handleUploadAndRun = async () => {
    // Get all programs with numbers to upload as a multi-program package
    const programsToUpload = allPrograms;

    if (programsToUpload.length === 0) {
      console.error("No programs selected for upload");
      return;
    }

    // For now, we'll upload the first program as a placeholder
    // TODO: This will be replaced with multi-program upload when hub menu is implemented
    const firstProgram = programsToUpload[0];
    try {
      const content = await firstProgram.handle.getFile().then((f) => f.text());
      await onUploadAndRunFile(firstProgram, content);
    } catch (error) {
      console.error("Failed to upload and run programs:", error);
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Program Manager
        </h3>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            ></div>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {isConnected ? "Hub Connected" : "Hub Disconnected"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                programStatus.running
                  ? "bg-green-500"
                  : programStatus.error
                    ? "bg-red-500"
                    : "bg-gray-300"
              }`}
            ></div>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {programStatus.running
                ? "Program Running"
                : programStatus.error
                  ? "Program Error"
                  : "Program Stopped"}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Directory and File Management */}
        {hasDirectoryAccess ? (
          <>
            <FileBrowser
              directoryName={directoryName}
              pythonFiles={pythonFiles}
              isLoading={isPythonFilesLoading}
              isRestoring={isRestoring}
              error={pythonFilesError}
              onRefresh={onRefreshFiles}
              onUnmount={onUnmountDirectory}
              onCreateFile={onCreateFile}
              onSetProgramNumber={async (fileName, programNumber) => {
                await setProgramNumber({ fileName, programNumber });
              }}
              onSetProgramSide={async (fileName, programSide) => {
                await setProgramSide({ fileName, programSide });
              }}
              onGetNextAvailableProgramNumber={getNextAvailableProgramNumber}
              onMoveProgramUp={async (fileName) => {
                await moveProgramUp(fileName);
              }}
              onMoveProgramDown={async (fileName) => {
                await moveProgramDown(fileName);
              }}
              onAddToPrograms={async (fileName) => {
                await addToPrograms(fileName);
              }}
              onRemoveFromPrograms={async (fileName) => {
                await removeFromPrograms(fileName);
              }}
            />
            {/* Create Example Project button if no files exist */}
            {pythonFiles.length === 0 && onCreateExampleProject && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                  No Python files found in this directory. Would you like to
                  create an example project?
                </p>
                <button
                  onClick={onCreateExampleProject}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  📝 Create Example Project
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            <div className="text-4xl mb-4">📁</div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
              Directory Required
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Please mount a directory to store and manage your Python programs
            </p>
            <button
              onClick={onRequestDirectoryAccess}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              📂 Mount Directory
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Your files will be saved directly to your local filesystem
            </p>
          </div>
        )}

        {/* Program List Status */}
        {hasDirectoryAccess && (
          <div
            className={`p-3 rounded-lg border ${
              programCount === 0
                ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
                : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {programCount === 0
                  ? "⚠️ No Programs Selected"
                  : "✅ Program List Ready"}
              </span>
              <span
                className={`text-sm ${
                  programCount === 0
                    ? "text-orange-700 dark:text-orange-300"
                    : "text-green-700 dark:text-green-300"
                }`}
              >
                {programCount === 0
                  ? "Select at least one file as a program using the # button"
                  : `${programCount} program${programCount !== 1 ? "s" : ""} configured for hub menu`}
              </span>
            </div>
          </div>
        )}

        {/* Upload & Run Programs */}
        {hasDirectoryAccess && (
          <div>
            {/* Upload Actions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-800 dark:text-gray-200">
                  Program Menu
                </h4>
                <button
                  onClick={handleUploadAndRun}
                  disabled={
                    !isConnected ||
                    isUploading ||
                    isRunning ||
                    programCount === 0
                  }
                  className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                  title={
                    programCount === 0
                      ? "Select at least one program first"
                      : "Upload & Run Program Menu"
                  }
                >
                  {(isUploading || isCompiling) && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  🚀 {isUploading ? "Uploading..." : "Upload & Run Menu"}
                </button>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload all numbered programs to the hub and start the program
                selection menu. Use the hub's buttons to choose which program to
                run.
              </p>

              {/* Upload Progress */}
              {uploadProgress.isVisible && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {uploadProgress.total > 0
                        ? "Uploading..."
                        : "Preparing upload..."}
                    </span>
                    {uploadProgress.total > 0 && (
                      <span className="text-sm text-blue-600 dark:text-blue-400">
                        {uploadProgress.current}/{uploadProgress.total}
                      </span>
                    )}
                  </div>
                  {uploadProgress.total > 0 ? (
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div
                        className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min((uploadProgress.current / uploadProgress.total) * 100, 100)}%`,
                        }}
                      ></div>
                    </div>
                  ) : (
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
              )}

              {/* Program Status */}
              {programStatus.running && (
                <div className="p-3 rounded-md bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="font-medium">Program Running...</span>
                    </div>
                    <button
                      onClick={onStopProgram}
                      disabled={!isConnected || isStopping}
                      className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50 text-sm flex items-center gap-1"
                    >
                      {isStopping && (
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                      )}
                      ⏹️ Stop
                    </button>
                  </div>
                </div>
              )}

              {programStatus.error && (
                <div className="p-3 rounded-md bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <span>❌</span>
                    <span className="font-medium">
                      Error: {programStatus.error}
                    </span>
                  </div>
                </div>
              )}

              {!programStatus.running &&
                !programStatus.error &&
                isConnected &&
                programCount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Ready to upload {programCount} program
                      {programCount !== 1 ? "s" : ""}
                    </div>
                    <button
                      onClick={onRunProgram}
                      disabled={!isConnected || isRunning || isUploading}
                      className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 text-sm flex items-center gap-1"
                    >
                      {isRunning && (
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                      )}
                      ▶️ Run
                    </button>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
