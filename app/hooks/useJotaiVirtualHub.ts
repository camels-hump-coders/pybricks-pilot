import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { virtualRobotService } from "../services/virtualRobot";
import type { InstrumentationOptions } from "../utils/codeInstrumentation";
import { transformTelemetryData } from "../utils/coordinateTransformations";

// Import virtual robot specific atoms
import {
  virtualRobotCapabilitiesAtom,
  virtualRobotPositionAtom,
  virtualRobotStateAtom,
} from "../store/atoms/virtualRobot";

// Import shared robot connection atoms
import {
  batteryLevelAtom,
  clearDebugEventsAtom,
  clearProgramOutputLogAtom,
  debugEventsAtom,
  imuDataAtom,
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
} from "../store/atoms/robotConnection";

// Import robot config atom
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";

// Import program running state atoms
import {
  updateTelemetryTimestampAtom,
  checkProgramRunningTimeoutAtom,
} from "../store/atoms/programRunning";

import type { ProgramStatus, TelemetryData } from "../services/pybricksHub";

export function useJotaiVirtualHub() {
  // Get current robot type to conditionally set up event listeners
  const robotType = useAtomValue(robotTypeAtom);

  // Virtual robot specific state
  const virtualPosition = useAtomValue(virtualRobotPositionAtom);
  const virtualState = useAtomValue(virtualRobotStateAtom);

  // Robot configuration
  const robotConfig = useAtomValue(robotConfigAtom);

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
  const capabilities = useAtomValue(virtualRobotCapabilitiesAtom);

  // Debug and output
  const debugEvents = useAtomValue(debugEventsAtom);
  const programOutputLog = useAtomValue(programOutputLogAtom);
  const clearDebugEvents = useSetAtom(clearDebugEventsAtom);
  const clearProgramOutputLog = useSetAtom(clearProgramOutputLogAtom);

  // Setters for updating state from virtual robot events
  const setTelemetryData = useSetAtom(telemetryDataAtom);
  const setProgramStatus = useSetAtom(programStatusAtom);
  const setProgramOutputLog = useSetAtom(programOutputLogAtom);
  const setVirtualRobotState = useSetAtom(virtualRobotStateAtom);
  const updateTelemetryTimestamp = useSetAtom(updateTelemetryTimestampAtom);
  const checkProgramRunningTimeout = useSetAtom(checkProgramRunningTimeoutAtom);

  // Connect virtual robot service events to Jotai atoms
  useEffect(() => {
    // Only set up event listeners if this is the active robot type
    if (robotType !== "virtual") return;

    const handleTelemetry = (event: CustomEvent<TelemetryData>) => {
      // Transform telemetry data to use our standardized coordinate system
      const transformedTelemetry = transformTelemetryData(event.detail);
      setTelemetryData(transformedTelemetry);

      // Update program running state based on telemetry reception
      updateTelemetryTimestamp(transformedTelemetry);
      checkProgramRunningTimeout();

      // Also update virtual robot state
      const state = virtualRobotService.getState();
      setVirtualRobotState(state);

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

    // Add event listeners to virtual robot service
    virtualRobotService.addEventListener(
      "telemetry",
      handleTelemetry as EventListener
    );
    virtualRobotService.addEventListener(
      "statusChange",
      handleStatusChange as EventListener
    );

    // Cleanup event listeners
    return () => {
      virtualRobotService.removeEventListener(
        "telemetry",
        handleTelemetry as EventListener
      );
      virtualRobotService.removeEventListener(
        "statusChange",
        handleStatusChange as EventListener
      );
    };
  }, [
    robotType, // Add robotType as dependency
    setTelemetryData,
    setProgramStatus,
    setProgramOutputLog,
    setVirtualRobotState,
    updateTelemetryTimestamp,
    checkProgramRunningTimeout,
  ]);

  // Update virtual robot service configuration when robot config changes
  useEffect(() => {
    if (robotConfig) {
      virtualRobotService.updateRobotConfig({
        dimensions: robotConfig.dimensions,
        centerOfRotation: robotConfig.centerOfRotation,
      });
    }
  }, [robotConfig]);

  // Virtual robot connection management
  const connect = useCallback(async () => {
    return await virtualRobotService.connect();
  }, []);

  const disconnect = useCallback(async () => {
    await virtualRobotService.disconnect();
  }, []);

  const isConnected = useCallback(() => {
    return virtualRobotService.isConnected();
  }, []);

  const runProgram = useCallback(async () => {
    await virtualRobotService.runProgram();
  }, []);

  const stopProgram = useCallback(async () => {
    await virtualRobotService.stopProgram();
  }, []);

  // Virtual robot control commands
  const sendDriveCommand = useCallback(
    async (distance: number, speed: number) => {
      await virtualRobotService.drive(distance, speed);
    },
    []
  );

  const sendTurnCommand = useCallback(async (angle: number, speed: number) => {
    await virtualRobotService.turn(angle, speed);
  }, []);

  const sendStopCommand = useCallback(async () => {
    await virtualRobotService.stop();
  }, []);

  const sendContinuousDriveCommand = useCallback(
    async (speed: number, turnRate: number) => {
      await virtualRobotService.driveContinuous(speed, turnRate);
    },
    []
  );

  const sendMotorCommand = useCallback(
    async (motor: string, angle: number, speed: number) => {
      await virtualRobotService.setMotorAngle(motor, angle, speed);
    },
    []
  );

  const sendContinuousMotorCommand = useCallback(
    async (motor: string, speed: number) => {
      await virtualRobotService.setMotorSpeed(motor, speed);
    },
    []
  );

  const sendMotorStopCommand = useCallback(async (motor: string) => {
    await virtualRobotService.setMotorSpeed(motor, 0);
  }, []);

  const sendControlCommand = useCallback(async (command: string) => {
    await virtualRobotService.sendControlCommand(command);
  }, []);

  // Virtual robot specific utilities
  const resetPosition = useCallback(() => {
    virtualRobotService.resetPosition();
  }, []);

  const setPosition = useCallback((x: number, y: number, heading: number) => {
    virtualRobotService.setPosition(x, y, heading);
  }, []);

  const getCurrentPosition = useCallback(() => {
    return virtualRobotService.getCurrentPosition();
  }, []);

  const getCapabilities = useCallback(() => {
    return virtualRobotService.getCapabilities();
  }, []);

  // Reset telemetry (virtual robot specific)
  const resetTelemetry = useCallback(async () => {
    const resetCommand = JSON.stringify({ action: "reset_drivebase" });
    try {
      await virtualRobotService.sendControlCommand(resetCommand);
    } catch {
      // Ignore errors - this is a best-effort reset
    }
  }, []);

  // Mock instrumentation settings for compatibility
  const setInstrumentationEnabled = useCallback((enabled: boolean) => {
    console.log(
      `[VirtualHub] Instrumentation ${enabled ? "enabled" : "disabled"} (mock)`
    );
  }, []);

  const setInstrumentationOptions = useCallback(
    (options: Partial<InstrumentationOptions>) => {
      console.log("[VirtualHub] Instrumentation options set (mock):", options);
    },
    []
  );

  const getInstrumentationOptions =
    useCallback(async (): Promise<InstrumentationOptions> => {
      return {
        enableTelemetry: true,
        enableRemoteControl: true,
        telemetryInterval: 100,
        autoDetectHardware: true,
      };
    }, []);

  return {
    // Robot type identification
    getRobotType: () => "virtual" as const,

    // Connection management
    connect,
    disconnect,
    isConnected,
    isConnecting: false, // Virtual robot connects instantly
    isDisconnecting: false, // Virtual robot disconnects instantly
    connectionError: null, // Virtual robot doesn't have connection errors
    hubInfo: null, // Virtual robot doesn't have hub info

    // Program management
    runProgram,
    stopProgram,

    // Program state
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

    // Virtual robot specific
    virtualPosition,
    virtualState,
    resetPosition,
    setPosition,
    getCurrentPosition,

    // Capabilities
    capabilities,
    getCapabilities,
    isSupported: true, // Virtual robot is always supported

    // Code instrumentation (mock)
    setInstrumentationEnabled,
    setInstrumentationOptions,
    getInstrumentationOptions,

    // Debug events
    debugEvents,
    clearDebugEvents,

    // Program output log
    programOutputLog,
    clearProgramOutputLog,
  };
}
