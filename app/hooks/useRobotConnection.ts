import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { HubInfo } from "../services/bluetooth";
import { mpyCrossCompiler } from "../services/mpyCrossCompiler";
import type {
  DebugEvent,
  ProgramStatus,
  TelemetryData,
} from "../services/pybricksHub";
import type { RobotConnectionOptions } from "../services/robotInterface";
import { robotConnectionManager } from "../services/robotInterface";

export function useRobotConnection() {
  const [hubInfo, setHubInfo] = useState<HubInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [telemetryData, setTelemetryData] = useState<TelemetryData | null>(
    null
  );
  const [programStatus, setProgramStatus] = useState<ProgramStatus>({
    running: false,
  });
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [programOutputLog, setProgramOutputLog] = useState<string[]>([]);
  const [robotType, setRobotType] = useState<"real" | "virtual" | null>(null);
  const queryClient = useQueryClient();

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
        const isNowConnected = robotConnectionManager.isConnected();
        setIsConnected(isNowConnected);

        // Update hub info on successful connection/disconnection
        if (event.detail.message.includes("connected successfully")) {
          // Hub info will be set by the connect mutation
        } else if (
          event.detail.message.includes("Disconnected") ||
          event.detail.message.includes("disconnected")
        ) {
          setHubInfo(null);
          setTelemetryData(null);
          setProgramStatus({ running: false });
          // Reset robot type to null when unexpected disconnection occurs
          setRobotType(null);
        }
      }
    };

    // Listen to global events (from both real and virtual robots)
    document.addEventListener("telemetry", handleTelemetry as EventListener);
    document.addEventListener(
      "statusChange",
      handleStatusChange as EventListener
    );
    document.addEventListener("debugEvent", handleDebugEvent as EventListener);

    // Also listen to compiler debug events directly
    mpyCrossCompiler.addEventListener(
      "debugEvent",
      handleDebugEvent as EventListener
    );

    // Check initial connection status
    const checkConnection = () => {
      const connectionStatus = robotConnectionManager.isConnected();
      
      // If we were connected but are now disconnected, reset robot type
      if (isConnected && !connectionStatus) {
        setRobotType(null);
        setHubInfo(null);
        setTelemetryData(null);
        setProgramStatus({ running: false });
      }
      
      // Only update robot type if we don't already have one set
      // This prevents overriding the initial null state
      if (robotType === null) {
        const currentRobotType = robotConnectionManager.getRobotType();
        setRobotType(currentRobotType);
      }
      
      setIsConnected(connectionStatus);
    };

    // Check connection more frequently for responsive UI
    const interval = setInterval(checkConnection, 500);

    // Initial check
    checkConnection();

    // Cleanup function
    return () => {
      clearInterval(interval);
      document.removeEventListener(
        "telemetry",
        handleTelemetry as EventListener
      );
      document.removeEventListener(
        "statusChange",
        handleStatusChange as EventListener
      );
      document.removeEventListener(
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

  const connectMutation = useMutation({
    mutationFn: async (options: RobotConnectionOptions) => {
      const info = await robotConnectionManager.connect(options);
      if (info) {
        setHubInfo(info);
        setIsConnected(true);
        setRobotType(options.robotType);
      }
      return info;
    },
    onError: (error) => {
      console.error("Failed to connect to robot:", error);
      setIsConnected(false);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await robotConnectionManager.disconnect();
      setHubInfo(null);
      setIsConnected(false);
      setTelemetryData(null);
      setProgramStatus({ running: false });
      // Reset robot type to null so user can choose a different type or reconnect
      setRobotType(null);
    },
  });

  const uploadProgramMutation = useMutation({
    mutationFn: async (pythonCode: string) => {
      if (!isConnected) throw new Error("Robot not connected");
      await robotConnectionManager.uploadProgram(pythonCode);
    },
  });

  const runProgramMutation = useMutation({
    mutationFn: async () => {
      if (!isConnected) throw new Error("Robot not connected");
      // Clear previous program output when starting a new program
      setProgramOutputLog([]);
      await robotConnectionManager.runProgram();
    },
  });

  const stopProgramMutation = useMutation({
    mutationFn: async () => {
      if (!isConnected) throw new Error("Robot not connected");
      await robotConnectionManager.stopProgram();
    },
  });

  const sendControlCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      if (!isConnected) throw new Error("Robot not connected");
      // Send control command to the robot connection manager
      await robotConnectionManager.sendControlCommand(command);
    },
  });

  const connect = useCallback(
    async (options: RobotConnectionOptions) => {
      return await connectMutation.mutateAsync(options);
    },
    [connectMutation]
  );

  const disconnect = useCallback(async () => {
    return await disconnectMutation.mutateAsync();
  }, [disconnectMutation]);

  const uploadProgram = useCallback(
    async (pythonCode: string) => {
      return await uploadProgramMutation.mutateAsync(pythonCode);
    },
    [uploadProgramMutation]
  );

  const runProgram = useCallback(async () => {
    return await runProgramMutation.mutateAsync();
  }, [runProgramMutation]);

  const stopProgram = useCallback(async () => {
    return await stopProgramMutation.mutateAsync();
  }, [stopProgramMutation]);

  const uploadAndRunProgram = useCallback(
    async (pythonCode: string) => {
      await uploadProgram(pythonCode);
      await runProgram();
    },
    [uploadProgram, runProgram]
  );

  // Robot control methods
  const sendDriveCommand = useCallback(
    async (distance: number, speed: number) => {
      if (!isConnected) return;
      await robotConnectionManager.drive(distance, speed);
    },
    [isConnected]
  );

  const sendTurnCommand = useCallback(
    async (angle: number, speed: number) => {
      if (!isConnected) return;
      await robotConnectionManager.turn(angle, speed);
    },
    [isConnected]
  );

  const sendStopCommand = useCallback(async () => {
    if (!isConnected) return;
    await robotConnectionManager.stop();
  }, [isConnected]);

  const sendContinuousDriveCommand = useCallback(
    async (driveSpeed: number, turnRate: number) => {
      if (!isConnected) return;
      await robotConnectionManager.driveContinuous(driveSpeed, turnRate);
    },
    [isConnected]
  );

  const sendMotorCommand = useCallback(
    async (motorName: string, angle: number, speed: number) => {
      if (!isConnected) return;
      await robotConnectionManager.setMotorAngle(motorName, angle, speed);
    },
    [isConnected]
  );

  const sendContinuousMotorCommand = useCallback(
    async (motorName: string, speed: number) => {
      if (!isConnected) return;
      await robotConnectionManager.setMotorSpeed(motorName, speed);
    },
    [isConnected]
  );

  const sendMotorStopCommand = useCallback(
    async (motorName: string) => {
      if (!isConnected) return;
      await robotConnectionManager.setMotorSpeed(motorName, 0);
    },
    [isConnected]
  );

  const resetTelemetry = useCallback(() => {
    setTelemetryData(null);
    setProgramOutputLog([]);
    setDebugEvents([]);

    // Send reset_drivebase command to robot (same as real robot)
    if (isConnected) {
      const resetCommand = JSON.stringify({
        action: "reset_drivebase",
      });
      sendControlCommandMutation.mutateAsync(resetCommand).catch(() => {
        // Ignore errors - this is a best-effort reset
      });
    }
  }, [isConnected, sendControlCommandMutation]);

  // Virtual robot specific methods
  const resetVirtualRobotPosition = useCallback(async () => {
    if (robotType === "virtual") {
      await robotConnectionManager.resetVirtualRobotPosition();
    }
  }, [robotType]);

  const setVirtualRobotPosition = useCallback(
    async (x: number, y: number, heading: number) => {
      if (robotType === "virtual") {
        await robotConnectionManager.setVirtualRobotPosition(x, y, heading);
      }
    },
    [robotType]
  );

  const getVirtualRobotState = useCallback(() => {
    if (robotType === "virtual") {
      return robotConnectionManager.getVirtualRobotState();
    }
    return null;
  }, [robotType]);

  const resetRobotType = useCallback(() => {
    setRobotType(null); // Reset to unselected state
    setHubInfo(null);
    setIsConnected(false);
    setTelemetryData(null);
    setProgramStatus({ running: false });
    setDebugEvents([]);
    setProgramOutputLog([]);
  }, []);

  return {
    // Connection state
    isConnected,
    hubInfo,
    robotType,
    connectionError: connectMutation.error,

    // Connection actions
    connect,
    disconnect,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,

    // Program management
    uploadProgram: uploadProgramMutation.mutateAsync,
    runProgram: runProgramMutation.mutateAsync,
    stopProgram: stopProgramMutation.mutateAsync,
    uploadAndRunProgram,

    programStatus,
    isUploadingProgram: uploadProgramMutation.isPending,
    isRunningProgram: runProgramMutation.isPending,
    isStoppingProgram: stopProgramMutation.isPending,

    // Telemetry
    telemetryData,
    batteryLevel: telemetryData?.hub?.battery,
    motorData: telemetryData?.motors,
    sensorData: telemetryData?.sensors,
    imuData: telemetryData?.hub?.imu,
    resetTelemetry,

    // Remote control
    sendDriveCommand,
    sendTurnCommand,
    sendStopCommand,
    sendContinuousDriveCommand,
    sendMotorCommand,
    sendContinuousMotorCommand,
    sendMotorStopCommand,
    sendControlCommand: sendControlCommandMutation.mutateAsync,
    isSendingCommand: sendControlCommandMutation.isPending,

    // Virtual robot specific
    resetVirtualRobotPosition,
    setVirtualRobotPosition,
    getVirtualRobotState,
    resetRobotType,

    // Capabilities
    isBluetoothSupported: !!navigator.bluetooth, // Check if Web Bluetooth API is available

    // Debug events
    debugEvents,
    clearDebugEvents: () => setDebugEvents([]),

    // Program output log
    programOutputLog,
    clearProgramOutputLog: () => setProgramOutputLog([]),
  };
}
