import { useSetAtom } from "jotai";
import { useEffect } from "react";
import type { ProgramStatus, TelemetryData, DebugEvent } from "../services/pybricksHub";
import { pybricksHubService } from "../services/pybricksHub";
import { transformTelemetryData } from "../utils/coordinateTransformations";
import {
  debugEventsAtom,
  hubInfoAtom,
  isConnectedAtom,
  programOutputLogAtom,
  programStatusAtom,
  telemetryDataAtom,
} from "../store/atoms/robotConnection";

// Singleton flag to prevent multiple registrations
let eventListenersRegistered = false;

/**
 * Hook that manages Pybricks hub event listeners centrally.
 * This should only be called once at the app root level to prevent duplicate event handling.
 */
export function usePybricksHubEventManager() {
  const setTelemetryData = useSetAtom(telemetryDataAtom);
  const setProgramStatus = useSetAtom(programStatusAtom);
  const setProgramOutputLog = useSetAtom(programOutputLogAtom);
  const setDebugEvents = useSetAtom(debugEventsAtom);
  const setHubInfo = useSetAtom(hubInfoAtom);
  const setIsConnected = useSetAtom(isConnectedAtom);

  useEffect(() => {
    // Prevent multiple registrations
    if (eventListenersRegistered) {
      console.warn("[PybricksHubEventManager] Event listeners already registered, skipping");
      return;
    }

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

    const handleDebugEvent = (event: CustomEvent<DebugEvent>) => {
      const debugEvent = event.detail;

      // Add debug event to the list
      setDebugEvents((prev) => [...prev, debugEvent].slice(-500)); // Keep last 500 events

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

    eventListenersRegistered = true;
    console.log("[PybricksHubEventManager] Event listeners registered");

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
      eventListenersRegistered = false;
      console.log("[PybricksHubEventManager] Event listeners removed");
    };
  }, [
    setTelemetryData,
    setProgramStatus,
    setProgramOutputLog,
    setDebugEvents,
    setHubInfo,
    setIsConnected,
  ]);
}