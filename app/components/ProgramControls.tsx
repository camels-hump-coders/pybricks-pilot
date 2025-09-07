import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { useNotifications } from "../hooks/useNotifications";
import { useUploadProgress } from "../hooks/useUploadProgress";
import { showDebugDetailsAtom } from "../store/atoms/matUIState";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { robotBuilderOpenAtom, robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { debugEventsAtom, programOutputLogAtom } from "../store/atoms/robotConnection";
import { DebugEventEntry } from "./DebugEventEntry";
import type { PythonFile } from "../types/fileSystem";
import { generateQuickStartCode } from "../utils/quickStart";
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
  const {
    programCount,
    allPrograms,
    hasDirectoryAccess,
    stableDirectoryHandle,
    createFile,
    addToPrograms,
    refreshFiles,
    pythonFiles,
  } = useJotaiFileSystem();
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const { isConnected, uploadAndRunHubMenu } = useJotaiRobotConnection();
  // Upload progress (for UI display)
  const { uploadProgress } = useUploadProgress();
  const { robotType } = useJotaiRobotConnection();
  const { showError, addNotification } = useNotifications();
  const openDetails = useSetAtom(showDebugDetailsAtom);
  const openRobotBuilder = useSetAtom(robotBuilderOpenAtom);
  const currentRobotConfig = useAtomValue(robotConfigAtom);

  // Quick Start helpers (duplicated here for convenience in the top control)
  // Step 1 is complete when the active robot config is not the default one
  const step1Complete = !currentRobotConfig?.isDefault;
  const step2Complete = programCount > 0; // starter program (or any) exists
  const step3Complete = isConnected && isProgramRunning; // menu uploaded & running
  // Use shared generator

  const handleGenerateQuickStartProgram = async () => {
    if (!hasDirectoryAccess || !stableDirectoryHandle) {
      showError(
        "Directory Not Mounted",
        "Please mount a directory to save the starter program.",
      );
      return;
    }
    try {
      const fileName = "robot.py";
      const code = generateQuickStartCode(currentRobotConfig);
      await createFile({ name: fileName, content: code });
      await addToPrograms(fileName);
      await refreshFiles();
      addNotification({
        type: "success",
        title: "Starter Program Created",
        message: `Created ${fileName} from current robot configuration`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showError("Failed to Create Program", msg);
    }
  };

  const [lastUploadError, setLastUploadError] = useState<string | null>(null);
  const debugEvents = useAtomValue(debugEventsAtom);
  const recentEvents = debugEvents.slice(-6).reverse();
  const programOutputLog = useAtomValue(programOutputLogAtom);

  // Detect when the robot program exits (based on telemetry-driven running flag)
  const prevRunningRef = useRef(isProgramRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isProgramRunning) {
      // Program just stopped; surface the most relevant recent error/log inline
      let message: string | null = null;
      const recent = debugEvents.slice(-20).reverse();
      const errEvent = recent.find(
        (e) =>
          e.type === "error" ||
          /error|exception|importerror|traceback/i.test(e.message || ""),
      );
      if (errEvent) {
        message = errEvent.message;
      } else if (programOutputLog && programOutputLog.length > 0) {
        const tail = programOutputLog.slice(-5);
        // Try to grab the most informative line (prefer ones containing 'Error' or 'Traceback')
        const candidate =
          tail.find((l) => /error|traceback|importerror/i.test(l)) || tail[tail.length - 1];
        message = candidate;
      }
      setLastUploadError(
        message || "Robot program exited. Open details to inspect recent logs.",
      );
      openDetails(true);
    }
    prevRunningRef.current = isProgramRunning;
  }, [isProgramRunning, openDetails]);

  const handleUploadAndRunMenu = async () => {
    if (allPrograms.length > 0 && uploadAndRunHubMenu) {
      try {
        setLastUploadError(null);
        await uploadAndRunHubMenu(allPrograms as any, pythonFiles as any);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setLastUploadError(msg || "Upload & Run failed");
        addNotification({
          type: "error",
          title: "Upload & Run Failed",
          message: msg || "Unknown error",
          duration: 0,
          primaryActionLabel: "View details",
          onPrimaryAction: () => openDetails(true),
        });
      }
    }
  };

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
                  setLastUploadError(null);
                  if ("getFile" in firstProgram.handle) {
                    const content = await firstProgram.handle
                      .getFile()
                      .then((f: File) => f.text());
                    await onUploadAndRunFile(
                      firstProgram,
                      content,
                      allPrograms,
                    );
                  }
                } catch (error) {
                  const msg =
                    error instanceof Error ? error.message : String(error);
                  console.error("Failed to upload and run programs:", msg);
                  setLastUploadError(msg || "Upload & Run failed");
                  // Sticky error with action
                  addNotification({
                    type: "error",
                    title: "Upload & Run Failed",
                    message: msg || "Unknown compilation/upload error",
                    duration: 0,
                    primaryActionLabel: "View details",
                    onPrimaryAction: () => openDetails(true),
                  });
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
      {lastUploadError && (
        <div className="mt-2 text-xs p-2 rounded border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span className="truncate">{lastUploadError}</span>
          <button
            type="button"
            onClick={() => openDetails(true)}
            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            title="Open Debug details"
          >
            View details
          </button>
        </div>
      )}
      {lastUploadError && (
        <div className="mt-2 border rounded-md border-gray-200 dark:border-gray-700">
          <div className="px-3 py-2 text-[11px] font-medium bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">
            Latest Upload & Run Events
          </div>
          <div className="p-2 space-y-2 max-h-40 overflow-y-auto text-xs">
            {recentEvents.length === 0 ? (
              <div className="text-gray-500">No debug events</div>
            ) : (
              recentEvents.map((e, idx) => <DebugEventEntry key={idx} event={e} />)
            )}
          </div>
        </div>
      )}
      {programCount === 0 && (
        <div className="mt-2 p-2 rounded bg-white/70 dark:bg-gray-800/40 border border-orange-200 dark:border-orange-800">
          <div className="text-xs font-medium mb-2 text-gray-800 dark:text-gray-200">
            Quick Start: Get Your Robot Moving
          </div>
          <ol className="list-decimal ml-4 text-xs text-gray-700 dark:text-gray-300 space-y-1">
            <li>Configure your robot's motors, sensors, and drivebase.</li>
            <li>Generate a starter program tailored to your robot.</li>
            <li>Upload & run the program menu on your hub.</li>
          </ol>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              onClick={() => {
                openRobotBuilder(true);
              }}
              className="px-2 py-2 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
              title="Open Robot Builder"
            >
              {step1Complete ? "✅" : "🧱"} Configure Robot
            </button>
            <button
              onClick={handleGenerateQuickStartProgram}
              disabled={!step1Complete || !hasDirectoryAccess}
              title={
                !step1Complete
                  ? "Customize your robot in step 1 first"
                  : !hasDirectoryAccess
                    ? "Mount a directory to save the program"
                    : "Generate starter program"
              }
              className="px-2 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {step2Complete ? "✅" : "✨"} Generate Starter Program
            </button>
            <button
              onClick={handleUploadAndRunMenu}
              disabled={!step2Complete || !isConnected}
              title={
                !step2Complete
                  ? "Generate a program first"
                  : !isConnected
                    ? "Connect to the hub"
                    : "Upload & run menu"
              }
              className="px-2 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
            >
              {step3Complete ? "✅" : "🚀"} Upload & Run
            </button>
          </div>
        </div>
      )}
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
