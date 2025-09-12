import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { pybricksHubService } from "../services/pybricksHub";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { telemetryHistory } from "../services/telemetryHistory";
import { pybricksHubCapabilitiesAtom } from "../store/atoms/pybricksHub";

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
  sensorDataAtom,
  telemetryDataAtom,
} from "../store/atoms/robotConnection"; // Use shared robot connection atoms
import type { InstrumentationOptions } from "../utils/codeInstrumentation";

// Use the pybricksHubService directly for Pybricks-specific operations
// This provides cleaner separation from the generic robot interface

export function useJotaiPybricksHub() {
  // Active robot config (for speed scaling)
  const robotConfig = useAtomValue(robotConfigAtom);
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
        return info;
      } else {
        // User cancelled the connection - throw an error to prevent success notification
        throw new Error("Connection cancelled by user");
      }
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

  const runProgram = useCallback(async () => {
    await pybricksHubService.runProgram();
  }, []);

  const stopProgram = useCallback(async () => {
    await pybricksHubService.stopProgram();
  }, []);

  const uploadAndRunHubMenu = useCallback(
    async (
      allPrograms: (import("../types/fileSystem").PythonFile & {
        programNumber: number;
      })[],
      availableFiles: import("../types/fileSystem").PythonFile[],
    ) => {
      await pybricksHubService.uploadAndRunHubMenu(allPrograms, availableFiles);
    },
    [],
  );

  const uploadAndRunAdhocProgram = useCallback(
    async (
      name: string,
      content: string,
      availableFiles: import("../types/fileSystem").PythonFile[],
    ) => {
      await pybricksHubService.uploadAndRunAdhocProgram(
        name,
        content,
        availableFiles,
      );
    },
    [],
  );

  const sendArcCommand = useCallback(
    async (
      radius: number,
      distance: number,
      left: boolean,
      forward: boolean,
      speedPct: number,
    ) => {
      const absRadius = Math.max(1, Math.abs(radius));
      const absDistance = Math.abs(distance);
      // Map percent [0..100] to mm/s using robot capability (default 300mm/s)
      const maxMmPerSec = robotConfig?.capabilities?.maxSpeed || 300;
      const mmPerSec = Math.max(
        1,
        Math.round((Math.abs(speedPct) / 100) * maxMmPerSec),
      );

      // Convert distance to sweep angle (degrees). Sign: left = negative, right = positive
      const sweepDeg = (absDistance / absRadius) * (180 / Math.PI);
      const angle = left ? -sweepDeg : +sweepDeg;
      const dradius = forward ? +absRadius : -absRadius;

      // Use native arc on hub
      const commands = [
        {
          action: "arc" as const,
          radius: dradius,
          angle,
          speed: mmPerSec
        },
      ];
      await pybricksHubService.sendControlCommand(
        JSON.stringify(commands),
      );
    },
    [robotConfig],
  );

  // Pybricks hub control commands
  const sendDriveCommand = useCallback(
    async (distance: number, speedPercent: number) => {
      // Map percent [0..100] to mm/s using robot capability (default 300mm/s)
      const maxMmPerSec = robotConfig?.capabilities?.maxSpeed || 300;
      const mmPerSec = Math.max(1, Math.round((Math.abs(speedPercent) / 100) * maxMmPerSec));
      // Send as command sequence for proper stop behavior handling
      const commands = [
        {
          action: "drive",
          distance,
          speed: mmPerSec,
        },
      ];
      await pybricksHubService.sendControlCommand(JSON.stringify(commands));
    },
    [robotConfig],
  );

  const sendTurnCommand = useCallback(async (angle: number, speedPercent: number) => {
    // Map percent [0..100] to deg/s; default max at 360°/s
    const maxDegPerSec = 360;
    const degPerSec = Math.max(1, Math.round((Math.abs(speedPercent) / 100) * maxDegPerSec));
    // Send as command sequence for proper stop behavior handling
    const commands = [
      {
        action: "turn",
        angle,
        speed: degPerSec,
      },
    ];
    await pybricksHubService.sendControlCommand(JSON.stringify(commands));
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
    [],
  );

  const sendMotorCommand = useCallback(
    async (motor: string, angle: number, speed: number) => {
      // Send as command sequence for consistency
      const commands = [
        {
          action: "motor",
          motor,
          angle,
          speed,
        },
      ];
      await pybricksHubService.sendControlCommand(JSON.stringify(commands));
    },
    [],
  );

  const sendContinuousMotorCommand = useCallback(
    async (motor: string, speed: number) => {
      // Send as command sequence for consistency
      const commands = [
        {
          action: "motor",
          motor,
          speed,
        },
      ];
      await pybricksHubService.sendControlCommand(JSON.stringify(commands));
    },
    [],
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
  const resetTelemetry = useCallback(async (startNewPath: boolean = true) => {
    const resetCommand = JSON.stringify({ action: "reset_drivebase" });
    try {
      await pybricksHubService.sendControlCommand(resetCommand);
    } catch {
      // Ignore errors - this is a best-effort reset
    }
    if (startNewPath) {
      telemetryHistory.startNewPath();
    }
  }, []);

  // Instrumentation settings (still using service directly for now)
  const setInstrumentationEnabled = useCallback(
    (enabled: boolean) => pybricksHubService.setInstrumentationEnabled(enabled),
    [],
  );

  const setInstrumentationOptions = useCallback(
    (options: Partial<InstrumentationOptions>) =>
      pybricksHubService.setInstrumentationOptions(options),
    [],
  );

  const getInstrumentationOptions = useCallback(
    () => pybricksHubService.getInstrumentationOptions(),
    [],
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
    runProgram,
    stopProgram,
    uploadAndRunHubMenu,
    uploadAndRunAdhocProgram,

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
    sendArcCommand,
    sendTurnCommand,
    sendStopCommand,
    sendContinuousDriveCommand,
    sendMotorCommand,
    sendContinuousMotorCommand,
    sendMotorStopCommand,
    sendControlCommand,
    isSendingCommand,

    // Command sequences and compound movements
    executeCommandSequence:
      pybricksHubService.executeCommandSequence.bind(pybricksHubService),
    turnAndDrive: pybricksHubService.turnAndDrive.bind(pybricksHubService),
    arc: pybricksHubService.arc.bind(pybricksHubService),

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
