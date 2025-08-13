import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import type { ProgramStatus, TelemetryData } from "../services/pybricksHub";
import { pybricksHubService } from "../services/pybricksHub";
import { pybricksHubCapabilitiesAtom } from "../store/atoms/pybricksHub";
import type { InstrumentationOptions } from "../utils/codeInstrumentation";
import { transformTelemetryData } from "../utils/coordinateTransformations";

// Import Pybricks hub specific atoms
import {
  batteryLevelAtom,
  clearDebugEventsAtom,
  clearProgramOutputLogAtom,
  connectionErrorAtom,
  debugEventsAtom,
  hubInfoAtom,
  imuDataAtom,
  isConnectedAtom,
  isConnectingAtom,
  isDisconnectingAtom,
  isRunningProgramAtom,
  isSendingCommandAtom,
  isStoppingProgramAtom,
  isUploadingProgramAtom,
  motorDataAtom,
  programOutputLogAtom,
  programStatusAtom,
  robotTypeAtom,
  sensorDataAtom,
  telemetryDataAtom,
} from "../store/atoms/robotConnection"; // Use shared robot connection atoms

// Use the pybricksHubService directly for Pybricks-specific operations
// This provides cleaner separation from the generic robot interface

export function useJotaiPybricksHub() {
  // Get current robot type to conditionally set up event listeners
  const robotType = useAtomValue(robotTypeAtom);

  // Connection state
  const [isConnected, setIsConnected] = useAtom(isConnectedAtom);
  const [hubInfo, setHubInfo] = useAtom(hubInfoAtom);
  const [connectionError, setConnectionError] = useAtom(connectionErrorAtom);

  // Connection status
  const [isConnecting, setIsConnecting] = useAtom(isConnectingAtom);
  const [isDisconnecting, setIsDisconnecting] = useAtom(isDisconnectingAtom);

  // Program state
  const programStatus = useAtomValue(programStatusAtom);
  const isUploadingProgram = useAtomValue(isUploadingProgramAtom);
  const isRunningProgram = useAtomValue(isRunningProgramAtom);
  const isStoppingProgram = useAtomValue(isStoppingProgramAtom);
  const isSendingCommand = useAtomValue(isSendingCommandAtom);

  // Telemetry
  const telemetryData = useAtomValue(telemetryDataAtom);
  const batteryLevel = useAtomValue(batteryLevelAtom);
  const motorData = useAtomValue(motorDataAtom);
  const sensorData = useAtomValue(sensorDataAtom);
  const imuData = useAtomValue(imuDataAtom);

  // Debug and output
  const debugEvents = useAtomValue(debugEventsAtom);
  const programOutputLog = useAtomValue(programOutputLogAtom);

  // Clear actions
  const clearDebugEvents = useSetAtom(clearDebugEventsAtom);
  const clearProgramOutputLog = useSetAtom(clearProgramOutputLogAtom);

  // Capabilities
  const capabilities = useAtomValue(pybricksHubCapabilitiesAtom);

  // Setters for updating state from Pybricks hub events
  const setTelemetryData = useSetAtom(telemetryDataAtom);
  const setProgramStatus = useSetAtom(programStatusAtom);
  const setProgramOutputLog = useSetAtom(programOutputLogAtom);

  // Connect Pybricks hub service events to Jotai atoms
  useEffect(() => {
    // Only set up event listeners if this is the active robot type
    if (robotType !== "real") return;

    const handleTelemetry = (event: CustomEvent<TelemetryData>) => {
      // Transform telemetry data to use our standardized coordinate system
      const transformedTelemetry = transformTelemetryData(event.detail);
      setTelemetryData(transformedTelemetry);

      // Forward telemetry event to document for global listeners (e.g., EnhancedCompetitionMat)
      const globalEvent = new CustomEvent("telemetry", {
        detail: transformedTelemetry,
      });
      document.dispatchEvent(globalEvent);
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

    const handleDebugEvent = (event: CustomEvent<any>) => {
      const debugEvent = event.detail;

      // Handle disconnection events
      if (
        debugEvent.type === "connection" &&
        (debugEvent.message.includes("Disconnected") ||
          debugEvent.message.includes("disconnected"))
      ) {
        console.log("[PybricksHub] Connection lost, updating state");
        setHubInfo(null);
        setIsConnected(false);
        setTelemetryData(null);
        setProgramStatus({ running: false });
      } else {
      }
    };

    // Add event listeners to Pybricks hub service
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

    return () => {
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
    };
  }, [
    robotType, // Add robotType as dependency
    setTelemetryData,
    setProgramStatus,
    setProgramOutputLog,
    setHubInfo,
    setIsConnected,
  ]);

  // Pybricks hub connection management
  const connect = useCallback(async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const info = await pybricksHubService.requestAndConnect();
      if (info) {
        setHubInfo(info);
        setIsConnected(true);
      }
      return info;
    } catch (error) {
      setConnectionError(error as Error);
      setIsConnected(false);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [setIsConnecting, setConnectionError, setHubInfo, setIsConnected]);

  const disconnect = useCallback(async () => {
    setIsDisconnecting(true);

    try {
      await pybricksHubService.disconnect();
      setHubInfo(null);
      setIsConnected(false);
    } finally {
      setIsDisconnecting(false);
    }
  }, [setIsDisconnecting, setHubInfo, setIsConnected]);

  // Pybricks hub program management
  const uploadProgram = useCallback(async (code: string) => {
    await pybricksHubService.uploadProgram(code);
  }, []);

  const runProgram = useCallback(async () => {
    await pybricksHubService.runProgram();
  }, []);

  const stopProgram = useCallback(async () => {
    await pybricksHubService.stopProgram();
  }, []);

  const uploadAndRunProgram = useCallback(async (code: string) => {
    await pybricksHubService.uploadAndRunProgram(code);
  }, []);

  // Pybricks hub control commands
  const sendDriveCommand = useCallback(
    async (distance: number, speed: number) => {
      const command = JSON.stringify({
        action: "drive",
        distance,
        speed,
      });
      await pybricksHubService.sendControlCommand(command);
    },
    []
  );

  const sendTurnCommand = useCallback(async (angle: number, speed: number) => {
    const command = JSON.stringify({
      action: "turn",
      angle,
      speed,
    });
    await pybricksHubService.sendControlCommand(command);
  }, []);

  const sendStopCommand = useCallback(async () => {
    const command = JSON.stringify({ action: "stop" });
    await pybricksHubService.sendControlCommand(command);
  }, []);

  const sendContinuousDriveCommand = useCallback(
    async (speed: number, turnRate: number) => {
      const command = JSON.stringify({
        action: "drive_continuous",
        speed,
        turn_rate: turnRate,
      });
      await pybricksHubService.sendControlCommand(command);
    },
    []
  );

  const sendMotorCommand = useCallback(
    async (motor: string, angle: number, speed: number) => {
      const command = JSON.stringify({
        action: "motor",
        motor,
        angle,
        speed,
      });
      await pybricksHubService.sendControlCommand(command);
    },
    []
  );

  const sendContinuousMotorCommand = useCallback(
    async (motor: string, speed: number) => {
      const command = JSON.stringify({
        action: "motor",
        motor,
        speed,
      });
      await pybricksHubService.sendControlCommand(command);
    },
    []
  );

  const sendMotorStopCommand = useCallback(async (motor: string) => {
    const command = JSON.stringify({
      action: "stop",
      motor,
    });
    await pybricksHubService.sendControlCommand(command);
  }, []);

  const sendControlCommand = useCallback(async (command: string) => {
    await pybricksHubService.sendControlCommand(command);
  }, []);

  // Reset telemetry
  const resetTelemetry = useCallback(async () => {
    const resetCommand = JSON.stringify({ action: "reset_drivebase" });
    try {
      await pybricksHubService.sendControlCommand(resetCommand);
    } catch {
      // Ignore errors - this is a best-effort reset
    }
  }, []);

  // Instrumentation settings (still using service directly for now)
  const setInstrumentationEnabled = useCallback(
    (enabled: boolean) => pybricksHubService.setInstrumentationEnabled(enabled),
    []
  );

  const setInstrumentationOptions = useCallback(
    (options: Partial<InstrumentationOptions>) =>
      pybricksHubService.setInstrumentationOptions(options),
    []
  );

  const getInstrumentationOptions = useCallback(
    () => pybricksHubService.getInstrumentationOptions(),
    []
  );

  // Make isConnected a function for consistency with virtual robot
  const isConnectedFn = useCallback(() => {
    return isConnected;
  }, [isConnected]);

  return {
    // Robot type identification
    getRobotType: () => "real" as const,

    // Connection state
    isConnected: isConnectedFn, // Return as function for consistency
    hubInfo,
    connectionError,

    // Connection actions
    connect,
    disconnect,
    isConnecting,
    isDisconnecting,

    // Program management
    uploadProgram,
    runProgram,
    stopProgram,
    uploadAndRunProgram,

    programStatus,
    isUploadingProgram,
    isRunningProgram,
    isStoppingProgram,

    // Telemetry
    telemetryData,
    batteryLevel,
    motorData,
    sensorData,
    imuData,
    resetTelemetry,

    // Remote control
    sendDriveCommand,
    sendTurnCommand,
    sendStopCommand,
    sendContinuousDriveCommand,
    sendMotorCommand,
    sendContinuousMotorCommand,
    sendMotorStopCommand,
    sendControlCommand,
    isSendingCommand,

    // Pybricks-specific features
    setInstrumentationEnabled,
    setInstrumentationOptions,
    getInstrumentationOptions,

    // Capabilities
    capabilities,
    isSupported: "bluetooth" in navigator,

    // Debug events
    debugEvents,
    clearDebugEvents,

    // Program output log
    programOutputLog,
    clearProgramOutputLog,
  };
}
