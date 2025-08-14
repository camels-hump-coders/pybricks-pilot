import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { pybricksHubService } from "../services/pybricksHub";
import { pybricksHubCapabilitiesAtom } from "../store/atoms/pybricksHub";
import type { InstrumentationOptions } from "../utils/codeInstrumentation";

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

  // Note: Event listeners are now managed centrally by usePybricksHubEventManager
  // to prevent duplicate event handling when multiple components use this hook

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

  // New file-based upload methods
  const uploadFileProgram = useCallback(async (file: any, content: string, availableFiles: any[]) => {
    await pybricksHubService.uploadFileProgram(file, content, availableFiles);
  }, []);

  const uploadAndRunFileProgram = useCallback(async (file: any, content: string, availableFiles: any[]) => {
    await pybricksHubService.uploadAndRunFileProgram(file, content, availableFiles);
  }, []);

  const uploadAndRunHubMenu = useCallback(async (allPrograms: any[], availableFiles: any[]) => {
    await pybricksHubService.uploadAndRunHubMenu(allPrograms, availableFiles);
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
    uploadFileProgram,
    uploadAndRunFileProgram,
    uploadAndRunHubMenu,

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
