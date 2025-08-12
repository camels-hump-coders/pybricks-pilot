import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { robotConnectionManager } from "../services/robotInterface";
import type { TelemetryData, ProgramStatus, DebugEvent } from "../services/pybricksHub";
import {
  robotTypeAtom,
  telemetryDataAtom,
  programStatusAtom,
  programOutputLogAtom,
  debugEventsAtom,
  isConnectedAtom,
  hubInfoAtom,
} from "./atoms/robotConnection";
import { virtualRobotStateAtom } from "./atoms/virtualRobot";

// Custom hook to sync robot connection manager events with Jotai atoms
export function useSyncRobotConnectionEvents() {
  const setTelemetryData = useSetAtom(telemetryDataAtom);
  const setProgramStatus = useSetAtom(programStatusAtom);
  const setProgramOutputLog = useSetAtom(programOutputLogAtom);
  const setDebugEvents = useSetAtom(debugEventsAtom);
  const setIsConnected = useSetAtom(isConnectedAtom);
  const setHubInfo = useSetAtom(hubInfoAtom);
  const setVirtualRobotState = useSetAtom(virtualRobotStateAtom);
  
  const robotType = useAtomValue(robotTypeAtom);

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

    // Add event listeners to robot connection manager
    robotConnectionManager.addEventListener(
      "telemetry",
      handleTelemetry as EventListener
    );
    robotConnectionManager.addEventListener(
      "statusChange",
      handleStatusChange as EventListener
    );
    robotConnectionManager.addEventListener(
      "debugEvent",
      handleDebugEvent as EventListener
    );

    const checkConnection = () => {
      const connectionStatus = robotConnectionManager.isConnected();
      setIsConnected(connectionStatus);
      
      // Update virtual robot state if it's a virtual robot
      if (robotType === "virtual") {
        const state = robotConnectionManager.getVirtualRobotState?.();
        if (state) {
          setVirtualRobotState(state);
        }
      }
    };

    // Check connection more frequently for responsive UI
    const interval = setInterval(checkConnection, 500);

    // Cleanup function
    return () => {
      clearInterval(interval);
      robotConnectionManager.removeEventListener(
        "telemetry",
        handleTelemetry as EventListener
      );
      robotConnectionManager.removeEventListener(
        "statusChange",
        handleStatusChange as EventListener
      );
      robotConnectionManager.removeEventListener(
        "debugEvent",
        handleDebugEvent as EventListener
      );
    };
  }, [
    robotType,
    setTelemetryData,
    setProgramStatus,
    setProgramOutputLog,
    setDebugEvents,
    setIsConnected,
    setHubInfo,
    setVirtualRobotState,
  ]);
}