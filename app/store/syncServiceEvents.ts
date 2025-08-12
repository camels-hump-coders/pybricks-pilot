import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { pybricksHubService, type TelemetryData, type ProgramStatus, type DebugEvent } from "../services/pybricksHub";
import { mpyCrossCompiler } from "../services/mpyCrossCompiler";
import {
  telemetryDataAtom,
  programStatusAtom,
  programOutputLogAtom,
  debugEventsAtom,
  isConnectedAtom,
  hubInfoAtom,
} from "./atoms/hubConnection";

// Custom hook to sync service events with Jotai atoms
export function useSyncServiceEvents() {
  const setTelemetryData = useSetAtom(telemetryDataAtom);
  const setProgramStatus = useSetAtom(programStatusAtom);
  const setProgramOutputLog = useSetAtom(programOutputLogAtom);
  const setDebugEvents = useSetAtom(debugEventsAtom);
  const setIsConnected = useSetAtom(isConnectedAtom);
  const setHubInfo = useSetAtom(hubInfoAtom);

  useEffect(() => {
    const handleTelemetry = (event: CustomEvent<TelemetryData>) => {
      setTelemetryData(event.detail);
    };

    const handleStatusChange = (event: CustomEvent<ProgramStatus>) => {
      const status = event.detail;
      setProgramStatus(status);

      // If there's program output, add it to the log
      if (status.output && status.output.trim()) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${status.output.trim()}`;
        setProgramOutputLog((prev) => [...prev, logEntry].slice(-200)); // Keep last 200 lines
      }
    };

    const handleDebugEvent = (event: CustomEvent<DebugEvent>) => {
      setDebugEvents((prev) => [...prev, event.detail].slice(-100)); // Keep last 100 events

      // Update connection status based on debug events
      if (event.detail.type === "connection") {
        const isNowConnected = pybricksHubService.isConnected();
        setIsConnected(isNowConnected);

        // Update hub info on disconnection
        if (
          event.detail.message.includes("Disconnected") ||
          event.detail.message.includes("disconnected")
        ) {
          setHubInfo(null);
          setTelemetryData(null);
          setProgramStatus({ running: false });
        }
      }
    };

    // Add event listeners
    pybricksHubService.addEventListener(
      "telemetry",
      handleTelemetry as EventListener
    );
    pybricksHubService.addEventListener(
      "statusChange",
      handleStatusChange as EventListener
    );
    pybricksHubService.addEventListener(
      "debugEvent",
      handleDebugEvent as EventListener
    );

    // Also listen to compiler debug events directly
    mpyCrossCompiler.addEventListener(
      "debugEvent",
      handleDebugEvent as EventListener
    );

    const checkConnection = () => {
      const connectionStatus = pybricksHubService.isConnected();
      setIsConnected(connectionStatus);
    };

    // Check connection more frequently for responsive UI
    const interval = setInterval(checkConnection, 500);

    // Cleanup function
    return () => {
      clearInterval(interval);
      pybricksHubService.removeEventListener(
        "telemetry",
        handleTelemetry as EventListener
      );
      pybricksHubService.removeEventListener(
        "statusChange",
        handleStatusChange as EventListener
      );
      pybricksHubService.removeEventListener(
        "debugEvent",
        handleDebugEvent as EventListener
      );

      // Also cleanup compiler event listener
      mpyCrossCompiler.removeEventListener(
        "debugEvent",
        handleDebugEvent as EventListener
      );
    };
  }, []); // Empty dependency array - this effect should only run once
}

// Custom hook to sync file system polling
export function useSyncFileSystem() {
  const directoryHandle = useAtomValue(directoryHandleAtom);
  const refreshFiles = useSetAtom(refreshPythonFilesAtom);

  useEffect(() => {
    if (!directoryHandle) return;

    // Auto-refresh every 5 seconds to detect file changes
    const interval = setInterval(() => {
      refreshFiles();
    }, 5000);

    return () => clearInterval(interval);
  }, [directoryHandle, refreshFiles]);
}

// Import the refresh action
import { directoryHandleAtom } from "./atoms/fileSystem";
import { refreshPythonFilesAtom } from "./actions/fileSystemActions";