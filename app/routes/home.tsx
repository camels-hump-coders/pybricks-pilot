import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { DebugPanel } from "../components/DebugPanel";
import { NotificationContainer } from "../components/ErrorNotification";
import { ProgramManager } from "../components/ProgramManager";
import { RobotConnectionSelector } from "../components/RobotConnectionSelector";
import { TelemetryDashboard } from "../components/TelemetryDashboard";
import { ThemeToggle } from "../components/ThemeToggle";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiRobotConnection } from "../hooks/useJotaiRobotConnection";
import { useNotifications } from "../hooks/useNotifications";
import { usePythonCompiler } from "../hooks/usePythonCompiler";
import { initializeRobotConfigAtom } from "../store/atoms/robotConfig";
import type { Route } from "./+types/home";

// Helper component for collapsible sections - defined outside to prevent re-creation
const CollapsibleSection = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
  priority,
  disabled = false,
}: {
  title: string;
  icon: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  priority: number;
  disabled?: boolean;
}) => (
  <div
    className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-3 ${disabled ? "opacity-50" : ""}`}
  >
    <button
      onClick={onToggle}
      disabled={disabled}
      className="w-full flex items-center justify-between p-2 sm:p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-3">
        <span className="text-lg sm:text-xl">{icon}</span>
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
            {title}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            {disabled && (
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-full hidden sm:inline">
                Connect Hub First
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className={`transform transition-transform text-gray-400 dark:text-gray-500 ${isExpanded ? "rotate-180" : ""}`}
        >
          ▼
        </div>
      </div>
    </button>
    {isExpanded && (
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="p-2 sm:p-4">{children}</div>
      </div>
    )}
  </div>
);

export function meta({}: Route.MetaArgs) {
  return [
    { title: "PyBricks Pilot" },
    {
      name: "description",
      content:
        "Web-based interface for programming and controlling LEGO Spike Prime robots with Pybricks",
    },
  ];
}

export default function Home() {
  const [isDebugPanelVisible, setIsDebugPanelVisible] = useState(false);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(true);
  const [isProgramsExpanded, setIsProgramsExpanded] = useState(false);

  const robotConnection = useJotaiRobotConnection();
  const fileSystem = useJotaiFileSystem();

  // Destructure robot connection properties for backward compatibility
  const {
    isConnected,
    hubInfo,
    robotType,
    connect,
    disconnect,
    isConnecting,
    connectionError,
    telemetryData,
    programStatus,
    uploadProgram,
    runProgram,
    stopProgram,
    uploadAndRunProgram,
    sendDriveCommand,
    sendTurnCommand,
    sendStopCommand,
    sendContinuousDriveCommand,
    sendMotorCommand,
    sendContinuousMotorCommand,
    sendMotorStopCommand,
    sendControlCommand,
    isUploadingProgram,
    isRunningProgram,
    isStoppingProgram,
    isSendingCommand,
    programOutputLog,
    clearProgramOutputLog,
    resetTelemetry,
    resetRobotType,
    isBluetoothSupported,
  } = robotConnection;

  // Destructure file system properties
  const {
    hasDirectoryAccess,
    directoryName,
    requestDirectoryAccess,
    unmountDirectory,
    pythonFiles,
    isPythonFilesLoading,
    pythonFilesError,
    refreshFiles,
    createExampleProject,
    isRestoring,
    isSupported: isFileSystemSupported,
  } = fileSystem;

  const { compileCode, isCompiling, compilationError } = usePythonCompiler();

  const {
    notifications,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  } = useNotifications();

  // Robot configuration initialization
  const initializeRobotConfig = useSetAtom(initializeRobotConfigAtom);

  // Initialize robot configuration from IndexedDB on startup
  useEffect(() => {
    const initConfig = async () => {
      try {
        await initializeRobotConfig();
        console.log("Robot configuration initialized from IndexedDB");
      } catch (error) {
        console.warn("Failed to initialize robot configuration:", error);
        // Continue with default configuration if initialization fails
      }
    };

    initConfig();
  }, []); // Run only once on mount

  // Auto-expand programs section when connected (but keep it closed initially for mobile)
  useEffect(() => {
    if (isConnected && window.innerWidth > 768) {
      // Only auto-expand on larger screens
      setIsProgramsExpanded(true);
    }
  }, [isConnected]);

  // Enhanced error handling with notifications
  const handleConnect = async (options: any) => {
    try {
      await connect(options);
      const robotTypeText =
        options.robotType === "virtual" ? "virtual robot" : "hub";
      showSuccess(
        "Connected",
        `Successfully connected to the ${robotTypeText}!`
      );
    } catch (error) {
      showError(
        "Connection Failed",
        error instanceof Error
          ? error.message
          : "Failed to connect to the robot"
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      showInfo("Disconnected", "Disconnected from the hub");
    } catch (error) {
      showError(
        "Disconnect Failed",
        error instanceof Error
          ? error.message
          : "Failed to disconnect from the hub"
      );
    }
  };

  const handleUploadProgram = async (code: string) => {
    try {
      await uploadProgram(code);
      showSuccess("Upload Complete", "Program uploaded successfully!");
    } catch (error) {
      showError(
        "Upload Failed",
        error instanceof Error ? error.message : "Failed to upload program"
      );
    }
  };

  const handleRunProgram = async () => {
    try {
      await runProgram();
      showSuccess("Program Started", "Program is now running");
    } catch (error) {
      showError(
        "Failed to Start",
        error instanceof Error ? error.message : "Failed to start program"
      );
    }
  };

  const handleStopProgram = async () => {
    try {
      await stopProgram();
      showInfo("Program Stopped", "Program execution stopped");
    } catch (error) {
      showError(
        "Failed to Stop",
        error instanceof Error ? error.message : "Failed to stop program"
      );
    }
  };

  const handleUploadAndRun = async (code: string) => {
    try {
      await uploadAndRunProgram(code);
      showSuccess(
        "Upload & Run Complete",
        "Program uploaded and started successfully!"
      );
    } catch (error) {
      showError(
        "Upload & Run Failed",
        error instanceof Error
          ? error.message
          : "Failed to upload and run program"
      );
    }
  };

  const handleFileSystemAccess = async () => {
    try {
      await requestDirectoryAccess();
      showSuccess("Directory Access", "Directory access granted successfully!");
    } catch (error) {
      showError(
        "Directory Access Failed",
        error instanceof Error ? error.message : "Failed to access directory"
      );
    }
  };

  // Monitor connection status and show notifications
  useEffect(() => {
    if (connectionError) {
      showError("Connection Error", connectionError.message, 0);
    }
  }, [connectionError, showError]);

  useEffect(() => {
    if (pythonFilesError) {
      showError("File System Error", pythonFilesError.message);
    }
  }, [pythonFilesError, showError]);

  useEffect(() => {
    if (compilationError) {
      showError("Compilation Error", compilationError.message);
    }
  }, [compilationError, showError]);

  useEffect(() => {
    if (programStatus.error) {
      showError("Program Error", programStatus.error, 0);
    }
  }, [programStatus.error, showError]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Compact Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-10">
        <div className="w-full px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="text-xl">🤖</div>
              <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                PyBricks Pilot
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Connection Status Indicator */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium hidden sm:inline">
                      Connected
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    <span className="text-xs font-medium hidden sm:inline">
                      Disconnected
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Action Buttons - Only show when robot type is selected */}
              {robotType && (
                <>
                  {robotType === "real" && !isFileSystemSupported ? (
                    <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900 px-2 py-1 rounded">
                      File API N/A
                    </div>
                  ) : (
                    robotType === "real" &&
                    !hasDirectoryAccess && (
                      <button
                        onClick={handleFileSystemAccess}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition-colors"
                      >
                        📁
                      </button>
                    )
                  )}

                  {isConnected && (
                    <button
                      onClick={handleDisconnect}
                      className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </>
              )}

              {/* Theme Toggle */}
              <ThemeToggle className="mr-2" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-2 sm:px-4 py-2 sm:py-4 space-y-2 sm:space-y-4">
        {/* Robot Connection Selector - Only show when no robot type is selected */}
        {(!robotType || !isConnected) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <RobotConnectionSelector
              onConnect={handleConnect}
              isConnecting={isConnecting}
              robotType={robotType}
              isBluetoothSupported={isBluetoothSupported}
            />
          </div>
        )}

        {/* 1. Telemetry Section (Priority 1) - Only show when robot type is selected */}
        {robotType && (
          <CollapsibleSection
            title="Robot Telemetry"
            icon="📊"
            priority={1}
            isExpanded={isTelemetryExpanded}
            onToggle={() => setIsTelemetryExpanded(!isTelemetryExpanded)}
            disabled={!isConnected}
          >
            <TelemetryDashboard />
          </CollapsibleSection>
        )}

        {/* 2. Program Management Section (Priority 2) - Only show for real robots */}
        {robotType === "real" && (
          <CollapsibleSection
            title="Program Management"
            icon="📝"
            priority={2}
            isExpanded={isProgramsExpanded}
            onToggle={() => setIsProgramsExpanded(!isProgramsExpanded)}
            disabled={!isConnected}
          >
            <ProgramManager
              directoryName={directoryName}
              pythonFiles={pythonFiles}
              hasDirectoryAccess={hasDirectoryAccess}
              isPythonFilesLoading={isPythonFilesLoading}
              pythonFilesError={pythonFilesError}
              isRestoring={isRestoring}
              onRefreshFiles={refreshFiles}
              onUnmountDirectory={unmountDirectory}
              onRequestDirectoryAccess={handleFileSystemAccess}
              onUploadProgram={handleUploadProgram}
              onRunProgram={handleRunProgram}
              onStopProgram={handleStopProgram}
              onUploadAndRun={handleUploadAndRun}
              onCompileCode={compileCode}
              onCreateExampleProject={async () => {
                try {
                  await createExampleProject();
                  showSuccess("Example Project Created", "Created example directory with program.py template");
                } catch (error) {
                  showError("Failed to Create Example", error instanceof Error ? error.message : "Unknown error");
                }
              }}
              programStatus={programStatus}
              isConnected={isConnected}
              isUploading={isUploadingProgram}
              isRunning={isRunningProgram}
              isStopping={isStoppingProgram}
              isCompiling={isCompiling}
            />
          </CollapsibleSection>
        )}
      </main>

      {/* Notification System */}
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />

      {/* Debug Panel */}
      <DebugPanel
        isVisible={isDebugPanelVisible}
        onToggle={() => setIsDebugPanelVisible(!isDebugPanelVisible)}
      />

      {/* Compact Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-8">
        <div className="w-full px-4 py-3">
          <div className="text-center text-xs text-gray-400 dark:text-gray-500">
            PyBricks Pilot - Built with React Router & Web APIs
          </div>
        </div>
      </footer>
    </div>
  );
}
