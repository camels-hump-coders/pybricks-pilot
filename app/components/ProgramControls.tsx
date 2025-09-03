import { useAtomValue } from "jotai";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { useUploadProgress } from "../hooks/useUploadProgress";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import type { PythonFile } from "../types/fileSystem";
import { HubMenuInterface } from "./HubMenuInterface";

interface ProgramControlsProps {
  onStopProgram?: () => Promise<void>;
  onUploadAndRunFile?: (
    file: PythonFile,
    content: string,
    allPrograms: PythonFile[],
  ) => Promise<void>;
}

export function ProgramControls({
  onUploadAndRunFile,
  onStopProgram,
}: ProgramControlsProps) {
  // Get shared program state
  const { programCount, allPrograms } = useJotaiFileSystem();
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const { isConnected } = useJotaiRobotConnection();
  // Upload progress (for UI display)
  const { uploadProgress } = useUploadProgress();
  const { robotType } = useJotaiRobotConnection();

  if (robotType === "virtual") {
    return null;
  }

  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide">
        Quick Program Control
      </div>
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {/* Stop button - only when program is running */}
        {isProgramRunning && (
          <button
            onClick={() => {
              if (onStopProgram) {
                onStopProgram().catch(console.error);
              }
            }}
            disabled={!onStopProgram}
            className="px-2 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            title="Stop Program"
          >
            ⏹️ Stop
          </button>
        )}

        {/* Up&Run button - always visible when there are programs */}
        {programCount > 0 && (
          <button
            onClick={async () => {
              if (onUploadAndRunFile && allPrograms.length > 0) {
                // If program is running, this will stop it and re-upload
                const firstProgram = allPrograms[0];
                try {
                  if ("getFile" in firstProgram.handle) {
                    const content = await firstProgram.handle
                      .getFile()
                      .then((f: File) => f.text());
                    await onUploadAndRunFile(firstProgram, content, allPrograms);
                  }
                } catch (error) {
                  console.error("Failed to upload and run programs:", error);
                }
              }
            }}
            disabled={!isConnected || programCount === 0}
            className="w-full px-2 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
            title={
              programCount === 0
                ? "Add programs using the # button in Program Manager"
                : isProgramRunning
                  ? "Stop current program and upload & run new program"
                  : "Upload & Run Program Menu"
            }
          >
            🚀 Up&Run
          </button>
        )}
      </div>
      {/* Active Program Display */}
      {uploadProgress.isVisible && (
        <div className="mt-2 text-xs">
          <div className="mt-1">
            <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
              <span>
                {uploadProgress.total > 0 ? "Uploading..." : "Preparing..."}
              </span>
              {uploadProgress.total > 0 && (
                <span>
                  {uploadProgress.current}/{uploadProgress.total}
                </span>
              )}
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1">
              {uploadProgress.total > 0 ? (
                <div
                  className="bg-blue-500 dark:bg-blue-400 h-1 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min((uploadProgress.current / uploadProgress.total) * 100, 100)}%`,
                  }}
                ></div>
              ) : (
                <div className="bg-blue-500 dark:bg-blue-400 h-1 rounded-full animate-pulse w-full"></div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Hub Menu Interface - Only show when menu program is running */}
      {isProgramRunning && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Hub Menu Remote
          </div>
          <HubMenuInterface />
        </div>
      )}
    </div>
  );
}
