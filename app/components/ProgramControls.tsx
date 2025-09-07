import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { useNotifications } from "../hooks/useNotifications";
import { useUploadProgress } from "../hooks/useUploadProgress";
import { showDebugDetailsAtom } from "../store/atoms/matUIState";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { robotBuilderOpenAtom, robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { debugEventsAtom } from "../store/atoms/robotConnection";
import { DebugEventEntry } from "./DebugEventEntry";
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
  function generateQuickStartCode(): string {
    const cfg = currentRobotConfig as any;
    const d = cfg.drivebase || {
      leftMotorPort: "A",
      rightMotorPort: "B",
      leftReversed: false,
      rightReversed: false,
      wheelDiameterMm: cfg.wheels?.left?.diameter || 56,
      axleTrackMm: cfg.dimensions?.width ? cfg.dimensions.width * 8 : 120,
    };

    const sensors = cfg.sensors || [];
    const sensorLines: string[] = [];
    for (const s of sensors) {
      let cls = "ColorSensor";
      if (s.type === "ultrasonic") cls = "UltrasonicSensor";
      else if (s.type === "force") cls = "ForceSensor";
      else if (s.type === "gyro") cls = "GyroSensor";
      sensorLines.push(
        `    try:\n        ${s.name} = ${cls}(Port.${s.port})\n        pilot.register_sensor("${s.name}", ${s.name})\n    except Exception as e:\n        print("[PILOT] Failed to init ${s.type} sensor on ${s.port}:", e)`,
      );
    }

    const extraMotors = cfg.motors || [];
    const motorLines: string[] = [];
    for (const m of extraMotors) {
      motorLines.push(
        `    try:\n        ${m.name} = Motor(Port.${m.port})\n        pilot.register_motor("${m.name}", ${m.name})\n    except Exception as e:\n        print("[PILOT] Failed to init motor ${m.name} on ${m.port}:", e)`,
      );
    }

    return `# Auto-generated Quick Start program by PyBricks Pilot\n\nfrom pybricks.hubs import PrimeHub\nfrom pybricks.parameters import Port, Direction\nfrom pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor, GyroSensor\nfrom pybricks.robotics import DriveBase\nfrom pybricks.tools import wait\n\nimport pybrickspilot as pilot\n\ndef main():\n    hub = PrimeHub()\n    pilot.register_hub(hub)\n\n    # Drivebase motors\n    left = Motor(Port.${d.leftMotorPort}${d.leftReversed ? ", positive_direction=Direction.COUNTERCLOCKWISE" : ""})\n    right = Motor(Port.${d.rightMotorPort}${d.rightReversed ? ", positive_direction=Direction.COUNTERCLOCKWISE" : ""})\n    db = DriveBase(left, right, ${Math.round(d.wheelDiameterMm)}, ${Math.round(d.axleTrackMm)})\n    pilot.register_drivebase(db)\n    pilot.register_motor("left", left)\n    pilot.register_motor("right", right)\n\n${motorLines.join("\n") || "    # No extra motors configured"}\n\n${sensorLines.join("\n") || "    # No sensors configured"}\n\n    # Main loop: telemetry + command processing\n    while True:\n        pilot.send_telemetry()\n        pilot.process_commands()\n        wait(100)\n\nmain()\n`;
  }

  const handleGenerateQuickStartProgram = async () => {
    if (!hasDirectoryAccess || !stableDirectoryHandle) {
      showError(
        "Directory Not Mounted",
        "Please mount a directory to save the starter program.",
      );
      return;
    }
    try {
      const fileName = "001_quickstart.py";
      const code = generateQuickStartCode();
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
