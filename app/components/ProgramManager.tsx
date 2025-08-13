import { useState } from "react";
import type { ProgramStatus } from "../services/pybricksHub";
import type { PythonFile } from "../types/fileSystem";
import { generatePybricksTemplate } from "../utils/pybricksAnalyzer";
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
  onUploadFile: (file: PythonFile, content: string) => Promise<void>;
  onRunProgram: () => Promise<void>;
  onStopProgram: () => Promise<void>;
  onUploadAndRunFile: (file: PythonFile, content: string) => Promise<void>;
  onCreateExampleProject?: () => Promise<void>;

  // Status
  programStatus: ProgramStatus;
  isConnected: boolean;
  isUploading: boolean;
  isRunning: boolean;
  isStopping: boolean;
  isCompiling: boolean;
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
  onUploadFile,
  onRunProgram,
  onStopProgram,
  onUploadAndRunFile,
  onCreateExampleProject,
  programStatus,
  isConnected,
  isUploading,
  isRunning,
  isStopping,
  isCompiling,
  className = "",
}: ProgramManagerProps) {
  const [selectedFile, setSelectedFile] = useState<PythonFile | null>(null);
  const [programCode, setProgramCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  const handleFileSelect = async (file: PythonFile) => {
    // Only allow selecting actual files, not directories
    if (file.isDirectory) return;

    setSelectedFile(file);
    try {
      const content = await file.handle.getFile().then((f) => f.text());
      setProgramCode(content);
    } catch (error) {
      console.error(
        "Failed to read file:",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleUpload = () => {
    if (selectedFile && programCode) {
      onUploadFile(selectedFile, programCode);
    }
  };

  const handleUploadAndRun = () => {
    if (selectedFile && programCode) {
      onUploadAndRunFile(selectedFile, programCode);
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
              selectedFile={selectedFile}
              isLoading={isPythonFilesLoading}
              isRestoring={isRestoring}
              error={pythonFilesError}
              onFileSelect={handleFileSelect}
              onRefresh={onRefreshFiles}
              onUnmount={() => {
                onUnmountDirectory();
                setSelectedFile(null);
                setProgramCode("");
              }}
              onCreateFile={() => {
                const template = generatePybricksTemplate("prime");
                setProgramCode(template);
                setSelectedFile(null);
              }}
            />
            {/* Create Example Project button if no files exist */}
            {pythonFiles.length === 0 && onCreateExampleProject && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                  No Python files found in this directory. Would you like to create an example project?
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

        {/* Selected File and Actions */}
        {selectedFile && programCode && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Selected File: {selectedFile.name}
              </label>
              <button
                onClick={() => setShowCode(!showCode)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              >
                {showCode ? "Hide Code" : "Show Code"}
              </button>
            </div>

            {showCode && (
              <div className="mb-4">
                <pre className="bg-gray-900 dark:bg-gray-700 text-gray-100 dark:text-gray-300 p-4 rounded-md overflow-x-auto text-sm max-h-64 overflow-y-auto">
                  <code>{programCode}</code>
                </pre>
              </div>
            )}

            {/* Upload Actions */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  disabled={!isConnected || isUploading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  📤 Upload to Hub
                </button>
                <button
                  onClick={handleUploadAndRun}
                  disabled={!isConnected || isUploading}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  🚀 Upload & Run
                </button>
              </div>

              {/* Program Status */}
              {programStatus.running && (
                <div className="p-3 rounded-md bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium">Program Running...</span>
                  </div>
                </div>
              )}
              
              {programStatus.error && (
                <div className="p-3 rounded-md bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <span>❌</span>
                    <span className="font-medium">Error: {programStatus.error}</span>
                  </div>
                </div>
              )}
              
              {!programStatus.running && !programStatus.error && isConnected && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Ready to upload {selectedFile.name}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Program Controls */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              onClick={handleUpload}
              disabled={
                !isConnected || !programCode || isUploading || isRunning
              }
              className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-1"
            >
              {isUploading && (
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              📤 Upload
            </button>

            <button
              onClick={onRunProgram}
              disabled={!isConnected || isRunning || isUploading}
              className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-1"
            >
              {isRunning && (
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              ▶️ Run
            </button>

            <button
              onClick={onStopProgram}
              disabled={!isConnected || !programStatus.running || isStopping}
              className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-1"
            >
              {isStopping && (
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              ⏹️ Stop
            </button>

            <button
              onClick={handleUploadAndRun}
              disabled={
                !isConnected || !programCode || isUploading || isRunning
              }
              className="px-3 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-1"
            >
              {(isUploading || isRunning) && (
                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              🚀 Upload & Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
