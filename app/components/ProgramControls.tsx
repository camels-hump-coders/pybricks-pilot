import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { useNotifications } from "../hooks/useNotifications";
import { useUploadProgress } from "../hooks/useUploadProgress";
import { saveRobotConfigAtom } from "../store/atoms/configFileSystem";
import { showDebugDetailsAtom } from "../store/atoms/matUIState";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import {
  robotBuilderOpenAtom,
  robotConfigAtom,
  setActiveRobotAtom,
} from "../store/atoms/robotConfigSimplified";
import {
  debugEventsAtom,
  programOutputLogAtom,
} from "../store/atoms/robotConnection";
import type { PythonFile } from "../types/fileSystem";
import { generateCalibrationProgram } from "../utils/calibration";
import { generateQuickStartCode } from "../utils/quickStart";
import { CalibrationPanel } from "./CalibrationPanel";
import { DebugEventEntry } from "./DebugEventEntry";
import { HubMenuInterface } from "./HubMenuInterface";
import { normalizeProgramLine } from "../utils/logs";

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
    writeFile,
    pythonFiles,
  } = useJotaiFileSystem();
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const { isConnected, uploadAndRunHubMenu } = useJotaiRobotConnection();
  const { uploadAndRunAdhocProgram } = useJotaiRobotConnection();
  // Upload progress (for UI display)
  const { uploadProgress } = useUploadProgress();
  const { robotType, executeCommandSequence } = useJotaiRobotConnection();
  const { showError, addNotification } = useNotifications();
  const openDetails = useSetAtom(showDebugDetailsAtom);
  const openRobotBuilder = useSetAtom(robotBuilderOpenAtom);
  const setActiveRobot = useSetAtom(setActiveRobotAtom);
  const saveRobotConfig = useSetAtom(saveRobotConfigAtom);
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
  const hasRobotPy = (pythonFiles || []).some((f) => {
    const p = (f.relativePath || f.name || "").toLowerCase();
    return p.endsWith("/robot.py") || p === "robot.py";
  });
  const lastProcessedLogIndexRef = useRef(programOutputLog?.length || 0);

  const syncRobotPyToCurrentConfig = async () => {
    try {
      const robotFile = (pythonFiles || []).find((f) => {
        const p = (f.relativePath || f.name || "").toLowerCase();
        return !f.isDirectory && (p.endsWith("/robot.py") || p === "robot.py");
      });
      if (!robotFile) return; // nothing to do
      const code = generateQuickStartCode(currentRobotConfig);
      if ("getFile" in robotFile.handle) {
        await writeFile({
          handle: robotFile.handle as FileSystemFileHandle,
          content: code,
        });
        await refreshFiles();
      }
    } catch (e) {
      // Best effort; surface a non-blocking notification
      addNotification({
        type: "warning",
        title: "robot.py not updated",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // Detect when the robot program exits (based on telemetry-driven running flag)
  const prevRunningRef = useRef(isProgramRunning);
  useEffect(() => {
    // Program just started: clear any prior error banner
    if (!prevRunningRef.current && isProgramRunning) {
      setLastUploadError(null);
      lastProcessedLogIndexRef.current = programOutputLog?.length || 0;
    }

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
        message = normalizeProgramLine(errEvent.message);
      } else if (programOutputLog && programOutputLog.length > 0) {
        const tail = programOutputLog.slice(-5);
        // Try to grab the most informative line (prefer ones containing 'Error' or 'Traceback')
        const candidate =
          tail.find((l) => /error|traceback|importerror/i.test(l)) ||
          tail[tail.length - 1];
        message = normalizeProgramLine(candidate);
      }
      setLastUploadError(
        message || "Robot program exited. Open details to inspect recent logs.",
      );
    }
    prevRunningRef.current = isProgramRunning;
  }, [isProgramRunning, debugEvents.length, programOutputLog?.length || 0]);

  useEffect(() => {
    if (!programOutputLog || programOutputLog.length === 0) {
      lastProcessedLogIndexRef.current = 0;
      return;
    }

    const previousIndex = lastProcessedLogIndexRef.current;
    if (programOutputLog.length <= previousIndex) {
      return;
    }

    const newEntries = programOutputLog.slice(previousIndex);
    lastProcessedLogIndexRef.current = programOutputLog.length;

    const errorEntry = newEntries
      .slice()
      .reverse()
      .find((line) => /error|traceback|exception/i.test(line));

    if (errorEntry) {
      setLastUploadError(normalizeProgramLine(errorEntry));
    }
  }, [programOutputLog?.length]);

  useEffect(() => {
    const handleRobotAlert = (event: Event) => {
      const detail = (event as CustomEvent<{
        code?: string;
        message?: string;
      }>).detail;
      if (!detail) return;
      const label = detail.code ? `${detail.code}: ${detail.message ?? ""}` : detail.message;
      if (!label) return;
      setLastUploadError(label.trim());
    };

    document.addEventListener("robotAlert", handleRobotAlert as EventListener);
    return () => {
      document.removeEventListener("robotAlert", handleRobotAlert as EventListener);
    };
  }, []);

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
          <span className="truncate pr-2">{lastUploadError}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => openDetails(true)}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              title="Open Debug details"
            >
              View details
            </button>
            <button
              type="button"
              onClick={() => setLastUploadError(null)}
              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              title="Dismiss this error"
            >
              Dismiss
            </button>
          </div>
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
              recentEvents.map((e, idx) => (
                <DebugEventEntry key={idx} event={e} />
              ))
            )}
          </div>
        </div>
      )}
      {(programCount === 0 ||
        (allPrograms.length > 0 &&
          allPrograms.every((p) => {
            const n = p.name.toLowerCase();
            const r = p.relativePath?.toLowerCase?.() || "";
            // Treat our auto-generated files as quickstart: 001_quickstart.py or robot.py
            return (
              n.includes("quickstart") ||
              n === "robot.py" ||
              r.endsWith("/robot.py") ||
              r === "robot.py"
            );
          }))) && (
        <div className="mt-2 p-2 rounded bg-white/70 dark:bg-gray-800/40 border border-orange-200 dark:border-orange-800">
          <div className="text-xs font-medium mb-2 text-gray-800 dark:text-gray-200">
            Quick Start: Get Your Robot Moving
          </div>
          <ol className="list-decimal ml-4 text-xs text-gray-700 dark:text-gray-300 space-y-1">
            <li>Configure your robot's motors, sensors, and drivebase.</li>
            <li>Generate a starter program tailored to your robot.</li>
            <li>Calibrate: drive 200mm forward and turn 360° to measure.</li>
            <li>Upload & run the program menu on your hub.</li>
          </ol>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
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
              onClick={async () => {
                // Upload and run an ad-hoc calibration program that imports robot.py
                if (!uploadAndRunAdhocProgram) return;
                try {
                  // Ensure robot.py reflects current robot config before compile
                  await syncRobotPyToCurrentConfig();
                  const code = generateCalibrationProgram();
                  await uploadAndRunAdhocProgram(
                    "calibrate.py",
                    code,
                    pythonFiles as any,
                  );
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  setLastUploadError(msg || "Calibration upload failed");
                  addNotification({
                    type: "error",
                    title: "Calibration Upload Failed",
                    message: msg || "Unknown error",
                    duration: 0,
                    primaryActionLabel: "View details",
                    onPrimaryAction: () => openDetails(true),
                  });
                }
              }}
              disabled={!isConnected || !hasRobotPy}
              title={
                !isConnected
                  ? "Connect to the hub"
                  : !hasRobotPy
                    ? "Generate robot.py first (use Generate Starter Program)"
                    : "Uploads and runs a calibration program (imports robot.py)"
              }
              className="px-2 py-2 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
            >
              🎯 Calibrate
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

          {/* Guided Calibration Readout */}
          <CalibrationPanel
            currentWheelDiameter={
              currentRobotConfig?.wheels?.left?.diameter || 56
            }
            currentAxleTrack={
              // Best-effort: prefer explicit drivebase if present, else estimate from width in studs
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              currentRobotConfig?.drivebase?.axleTrackMm ??
              (currentRobotConfig?.dimensions?.width
                ? currentRobotConfig.dimensions.width * 8
                : 120)
            }
            onApplyWheelDiameter={(newDiameter) => {
              if (!currentRobotConfig) {
                return;
              }
              const {drivebase} = currentRobotConfig;
              if (!drivebase) {
                return
              }
              // Guard: avoid redundant updates
              const currentDiameterLeft = Math.round(currentRobotConfig.wheels.left.diameter);
              const currentDiameterDb = Math.round((drivebase as any).wheelDiameterMm || currentDiameterLeft);
              if (
                Math.round(newDiameter) === currentDiameterLeft &&
                Math.round(newDiameter) === currentDiameterDb
              ) {
                return;
              }
              try {
                const updated = {
                  ...currentRobotConfig,
                  wheels: {
                    left: {
                      ...currentRobotConfig.wheels.left,
                      diameter: newDiameter,
                    },
                    right: {
                      ...currentRobotConfig.wheels.right,
                      diameter: newDiameter,
                    },
                  },
                  // Ensure drivebase field is kept in sync with Robot Builder's source of truth
                  drivebase: {
                    ...drivebase,
                    wheelDiameterMm: newDiameter,
                  },
                };
                // Update active robot and attempt to persist if not default
                setActiveRobot(updated);
                if (!updated.isDefault) {
                  // Persist to filesystem
                  saveRobotConfig({
                    robotId: updated.id,
                    config: updated,
                  }).catch(() => {
                    /* ignore, surfaced elsewhere */
                  });
                } else {
                  addNotification({
                    type: "info",
                    title: "Updated Active Robot",
                    message: "Using default robot; changes not saved to disk.",
                  });
                }
                addNotification({
                  type: "success",
                  title: "Wheel Diameter Updated",
                  message: `Applied ${Math.round(newDiameter)}mm to both wheels`,
                });
              } catch (e) {
                addNotification({
                  type: "error",
                  title: "Failed to Apply",
                  message: e instanceof Error ? e.message : String(e),
                });
              }
            }}
            onApplyAxleTrack={(newAxleTrack) => {
              if (!currentRobotConfig) return;
              const {drivebase} = currentRobotConfig;
              if (!drivebase) {
                return
              }
              // Guard: avoid redundant updates
              const currentAxle = Math.round((drivebase as any).axleTrackMm || (currentRobotConfig.dimensions.width * 8));
              if (Math.round(newAxleTrack) === currentAxle) {
                return;
              }
              try {
                // Store axle track within a drivebase section if present; else attach
                const updated = {
                  ...currentRobotConfig,
                  drivebase: {
                    ...drivebase,
                    axleTrackMm: newAxleTrack,
                  },
                };

                setActiveRobot(updated);
                if (!updated.isDefault) {
                  saveRobotConfig({
                    robotId: updated.id,
                    config: updated,
                  }).catch(() => {
                    /* ignore */
                  });
                } else {
                  addNotification({
                    type: "info",
                    title: "Updated Active Robot",
                    message: "Using default robot; changes not saved to disk.",
                  });
                }
                addNotification({
                  type: "success",
                  title: "Axle Track Updated",
                  message: `Applied ${Math.round(newAxleTrack)}mm axle track`,
                });
              } catch (e) {
                addNotification({
                  type: "error",
                  title: "Failed to Apply",
                  message: e instanceof Error ? e.message : String(e),
                });
              }
            }}
            onRerunCalibrate={async () => {
              if (!uploadAndRunAdhocProgram) return;
              try {
                const code = generateCalibrationProgram();
                await uploadAndRunAdhocProgram(
                  "calibrate.py",
                  code,
                  pythonFiles as any,
                );
              } catch {
                // ignore
              }
            }}
            onOpenRobotBuilder={() => openRobotBuilder(true)}
          />
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
