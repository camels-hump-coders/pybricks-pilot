import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { HubInfo } from "../services/bluetooth";
import {
  pybricksHubService,
  type DebugEvent,
  type ProgramStatus,
  type TelemetryData,
} from "../services/pybricksHub";
import { mpyCrossCompiler } from "../services/mpyCrossCompiler";
import { bluetoothDeviceStorage } from "../services/bluetoothDeviceStorage";

export function usePybricksHub() {
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
        setProgramOutputLog(prev => [...prev, logEntry].slice(-200)); // Keep last 200 lines
      }
    };

    const handleDebugEvent = (event: CustomEvent<DebugEvent>) => {
      setDebugEvents((prev) => [...prev, event.detail].slice(-100)); // Keep last 100 events
      
      // Update connection status based on debug events
      if (event.detail.type === 'connection') {
        const isNowConnected = pybricksHubService.isConnected();
        setIsConnected(isNowConnected);
        
        // Update hub info on successful connection/disconnection
        if (event.detail.message.includes('connected successfully')) {
          // Hub info will be set by the connect mutation
        } else if (event.detail.message.includes('Disconnected') || event.detail.message.includes('disconnected')) {
          setHubInfo(null);
          setTelemetryData(null);
          setProgramStatus({ running: false });
        }
      }
    };

    // Add event listeners
    pybricksHubService.addEventListener('telemetry', handleTelemetry as EventListener);
    pybricksHubService.addEventListener('statusChange', handleStatusChange as EventListener);
    pybricksHubService.addEventListener('debugEvent', handleDebugEvent as EventListener);
    
    // Also listen to compiler debug events directly
    mpyCrossCompiler.addEventListener('debugEvent', handleDebugEvent as EventListener);

    const checkConnection = () => {
      const connectionStatus = pybricksHubService.isConnected();
      setIsConnected(connectionStatus);
    };

    // Check connection more frequently for responsive UI
    const interval = setInterval(checkConnection, 500);
    
    // Try auto-reconnect on initial load
    const tryInitialAutoReconnect = async () => {
      try {
        const lastDevice = await bluetoothDeviceStorage.getLastDevice();
        if (lastDevice) {
          console.log('Found last connected device, attempting auto-reconnect:', lastDevice.name);
          const hubInfo = await pybricksHubService.tryAutoReconnect();
          if (hubInfo) {
            setHubInfo(hubInfo);
            setIsConnected(true);
          }
        }
      } catch (error) {
        console.log('Auto-reconnect on load failed:', error.message);
      }
    };
    
    // Try auto-reconnect after a short delay to let the page load
    const autoReconnectTimeout = setTimeout(tryInitialAutoReconnect, 1000);
    
    // Cleanup function
    return () => {
      clearInterval(interval);
      clearTimeout(autoReconnectTimeout);
      pybricksHubService.removeEventListener('telemetry', handleTelemetry as EventListener);
      pybricksHubService.removeEventListener('statusChange', handleStatusChange as EventListener);
      pybricksHubService.removeEventListener('debugEvent', handleDebugEvent as EventListener);
      
      // Also cleanup compiler event listener
      mpyCrossCompiler.removeEventListener('debugEvent', handleDebugEvent as EventListener);
    };
  }, []); // Empty dependency array - this effect should only run once

  const connectMutation = useMutation({
    mutationFn: async () => {
      const info = await pybricksHubService.requestAndConnect();
      if (info) {
        setHubInfo(info);
        setIsConnected(true);
      }
      return info;
    },
    onError: (error) => {
      console.error("Failed to connect to hub:", error);
      setIsConnected(false);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await pybricksHubService.disconnect();
      setHubInfo(null);
      setIsConnected(false);
      setTelemetryData(null);
      setProgramStatus({ running: false });
    },
  });

  const uploadProgramMutation = useMutation({
    mutationFn: async (pythonCode: string) => {
      if (!isConnected) throw new Error("Hub not connected");
      await pybricksHubService.uploadProgram(pythonCode);
    },
  });

  const runProgramMutation = useMutation({
    mutationFn: async () => {
      if (!isConnected) throw new Error("Hub not connected");
      // Clear previous program output when starting a new program
      setProgramOutputLog([]);
      await pybricksHubService.runProgram();
    },
  });

  const stopProgramMutation = useMutation({
    mutationFn: async () => {
      if (!isConnected) throw new Error("Hub not connected");
      await pybricksHubService.stopProgram();
    },
  });

  const sendControlCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      if (!isConnected) throw new Error("Hub not connected");
      await pybricksHubService.sendControlCommand(command);
    },
  });

  const connect = useCallback(async () => {
    return await connectMutation.mutateAsync();
  }, [connectMutation]);

  const disconnect = useCallback(async () => {
    await disconnectMutation.mutateAsync();
  }, [disconnectMutation]);

  const uploadAndRunProgramMutation = useMutation({
    mutationFn: async (pythonCode: string) => {
      if (!isConnected) throw new Error("Hub not connected");

      // Clear previous program output when starting a new program
      setProgramOutputLog([]);

      // First stop any running program
      await pybricksHubService.stopProgram();

      // Wait a bit for the hub to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Upload and run atomically - matches Pybricks Code flow
      await pybricksHubService.uploadAndRunProgram(pythonCode);
    },
  });

  const uploadAndRunProgram = useCallback(
    async (pythonCode: string) => {
      return await uploadAndRunProgramMutation.mutateAsync(pythonCode);
    },
    [uploadAndRunProgramMutation]
  );

  const sendDriveCommand = useCallback(
    async (distance: number, speed: number) => {
      const command = JSON.stringify({
        action: "drive",
        distance, // Changed from 'direction' to 'distance' to match PybricksPilot
        speed,
      });
      await sendControlCommandMutation.mutateAsync(command);
    },
    [sendControlCommandMutation]
  );

  const sendTurnCommand = useCallback(
    async (angle: number, speed: number) => {
      const command = JSON.stringify({
        action: "turn",
        angle,
        speed,
      });
      await sendControlCommandMutation.mutateAsync(command);
    },
    [sendControlCommandMutation]
  );

  const sendStopCommand = useCallback(async () => {
    const command = JSON.stringify({
      action: "stop",
    });
    await sendControlCommandMutation.mutateAsync(command);
  }, [sendControlCommandMutation]);

  const sendContinuousDriveCommand = useCallback(
    async (speed: number, turnRate: number) => {
      const command = JSON.stringify({
        action: "drive_continuous",
        speed,
        turn_rate: turnRate,
      });
      await sendControlCommandMutation.mutateAsync(command);
    },
    [sendControlCommandMutation]
  );

  const sendMotorCommand = useCallback(
    async (motor: string, angle: number, speed: number) => {
      const command = JSON.stringify({
        action: "motor",
        motor,
        angle,
        speed,
      });
      await sendControlCommandMutation.mutateAsync(command);
    },
    [sendControlCommandMutation]
  );

  const sendContinuousMotorCommand = useCallback(
    async (motor: string, speed: number) => {
      const command = JSON.stringify({
        action: "motor",
        motor,
        speed,
      });
      await sendControlCommandMutation.mutateAsync(command);
    },
    [sendControlCommandMutation]
  );

  const sendMotorStopCommand = useCallback(
    async (motor: string) => {
      const command = JSON.stringify({
        action: "stop",
        motor,
      });
      await sendControlCommandMutation.mutateAsync(command);
    },
    [sendControlCommandMutation]
  );

  // Reset telemetry function
  const resetTelemetry = useCallback(() => {
    // Reset telemetry data to null
    setTelemetryData(null);
    
    // Reset program status
    setProgramStatus({ running: false });
    
    // Clear program output log
    setProgramOutputLog([]);
    
    // Send a command to reset the robot's drivebase telemetry
    if (isConnected) {
      const resetCommand = JSON.stringify({
        action: "reset_drivebase"
      });
      sendControlCommandMutation.mutateAsync(resetCommand).catch(() => {
        // Ignore errors - this is a best-effort reset
      });
    }
  }, [isConnected, sendControlCommandMutation]);

  return {
    // Connection state
    isConnected,
    hubInfo,
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
    batteryLevel: telemetryData?.battery,
    motorData: telemetryData?.motors,
    sensorData: telemetryData?.sensors,
    imuData: telemetryData?.imu,
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

    // Code instrumentation
    setInstrumentationEnabled: (enabled: boolean) => pybricksHubService.setInstrumentationEnabled(enabled),
    setInstrumentationOptions: (options: Partial<import("../utils/codeInstrumentation").InstrumentationOptions>) => 
      pybricksHubService.setInstrumentationOptions(options),
    getInstrumentationOptions: () => pybricksHubService.getInstrumentationOptions(),

    // Capabilities
    isSupported: "bluetooth" in navigator,

    // Debug events
    debugEvents,
    clearDebugEvents: () => setDebugEvents([]),
    
    // Program output log
    programOutputLog,
    clearProgramOutputLog: () => setProgramOutputLog([]),
  };
}
