import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import type { RobotConnectionOptions } from "../services/robotInterface";
// Import shared atoms
import {
  resetRobotTypeAtom,
  robotTypeAtom,
} from "../store/atoms/robotConnection";
import { useJotaiPybricksHub } from "./useJotaiPybricksHub";
import { useJotaiVirtualHub } from "./useJotaiVirtualHub";

export function useJotaiRobotConnection() {
  // Get current robot type to determine which implementation to use
  const [robotType, setRobotType] = useAtom(robotTypeAtom);
  const resetRobotType = useSetAtom(resetRobotTypeAtom);

  // Get robot-specific implementations
  const pybricksHub = useJotaiPybricksHub();
  const virtualHub = useJotaiVirtualHub();

  // Select the appropriate implementation based on robot type
  const currentRobot = robotType === "virtual" ? virtualHub : pybricksHub;

  // Generic robot connection management
  const connect = useCallback(
    async (options: RobotConnectionOptions) => {
      // Set robot type first
      setRobotType(options.robotType);

      // Delegate to appropriate implementation
      if (options.robotType === "virtual") {
        return await virtualHub.connect();
      } else {
        return await pybricksHub.connect();
      }
    },
    [setRobotType, virtualHub, pybricksHub],
  );

  const disconnect = useCallback(async () => {
    await currentRobot.disconnect();
    // Keep robot type but clear connection state
  }, [currentRobot]);

  // Check if robot interface is connected
  const isConnected = useCallback(() => {
    if (robotType === "virtual") {
      return virtualHub.isConnected();
    } else if (robotType === "real") {
      return pybricksHub.isConnected(); // Now both are functions
    }
    return false;
  }, [robotType, virtualHub, pybricksHub]);

  // Bluetooth support check
  const isBluetoothSupported = useCallback(() => {
    return "bluetooth" in navigator;
  }, []);

  return {
    // Robot type management
    robotType,
    setRobotType,
    resetRobotType,

    // Connection management
    connect,
    disconnect,
    isConnected: isConnected(),
    isConnecting:
      "isConnecting" in currentRobot ? currentRobot.isConnecting : false,
    isDisconnecting:
      "isDisconnecting" in currentRobot ? currentRobot.isDisconnecting : false,
    connectionError:
      "connectionError" in currentRobot ? currentRobot.connectionError : null,

    // Hub info
    hubInfo: "hubInfo" in currentRobot ? currentRobot.hubInfo : null,

    // Program management
    runProgram: currentRobot.runProgram,
    stopProgram: currentRobot.stopProgram,
    // File-based upload methods (only available for real robots)
    uploadAndRunHubMenu:
      robotType === "real" ? pybricksHub.uploadAndRunHubMenu : undefined,
    uploadAndRunAdhocProgram:
      robotType === "real" ? pybricksHub.uploadAndRunAdhocProgram : undefined,

    // Program state
    programStatus: currentRobot.programStatus,
    isUploadingProgram: currentRobot.isUploadingProgram,
    isRunningProgram: currentRobot.isRunningProgram,
    isStoppingProgram: currentRobot.isStoppingProgram,

    // Telemetry
    telemetryData: currentRobot.telemetryData,
    batteryLevel: currentRobot.batteryLevel,
    motorData: currentRobot.motorData,
    sensorData: currentRobot.sensorData,
    imuData: currentRobot.imuData,
    resetTelemetry: currentRobot.resetTelemetry,

    // Remote control
    sendDriveCommand: currentRobot.sendDriveCommand,
    sendTurnCommand: currentRobot.sendTurnCommand,
    sendStopCommand: currentRobot.sendStopCommand,
    sendContinuousDriveCommand: currentRobot.sendContinuousDriveCommand,
    sendMotorCommand: currentRobot.sendMotorCommand,
    sendContinuousMotorCommand: currentRobot.sendContinuousMotorCommand,
    sendMotorStopCommand: currentRobot.sendMotorStopCommand,
    sendControlCommand: currentRobot.sendControlCommand,
    isSendingCommand: currentRobot.isSendingCommand,

    // Command sequences and compound movements
    executeCommandSequence: currentRobot.executeCommandSequence,
    turnAndDrive: currentRobot.turnAndDrive,

    // Robot-specific features
    ...(robotType === "virtual" && {
      virtualPosition: virtualHub.virtualPosition,
      virtualState: virtualHub.virtualState,
      resetPosition: virtualHub.resetPosition,
      setPosition: virtualHub.setPosition,
      getCurrentPosition: virtualHub.getCurrentPosition,
    }),

    ...(robotType === "real" && {
      setInstrumentationEnabled: pybricksHub.setInstrumentationEnabled,
      setInstrumentationOptions: pybricksHub.setInstrumentationOptions,
      getInstrumentationOptions: pybricksHub.getInstrumentationOptions,
    }),

    // Capabilities
    capabilities: currentRobot.capabilities,
    isSupported: currentRobot.isSupported,
    isBluetoothSupported: isBluetoothSupported(),

    // Debug events
    debugEvents: currentRobot.debugEvents,
    clearDebugEvents: currentRobot.clearDebugEvents,

    // Program output log
    programOutputLog: currentRobot.programOutputLog,
    clearProgramOutputLog: currentRobot.clearProgramOutputLog,
  };
}
