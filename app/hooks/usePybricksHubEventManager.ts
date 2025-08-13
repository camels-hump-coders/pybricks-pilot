import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
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
  clearProgramOutputLogAtom,
} from "../store/atoms/robotConnection";

// Track if listeners are actually attached to the service
// This is more reliable than a simple boolean flag
let attachedHandlers: {
  telemetry?: EventListener;
  statusChange?: EventListener;
  debugEvent?: EventListener;
  clearProgramOutput?: EventListener;
} = {};

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
  const clearProgramOutputLog = useSetAtom(clearProgramOutputLogAtom);
  const hasRegisteredListeners = useRef(false);

  useEffect(() => {
    // Prevent multiple registrations by checking if handlers are already attached
    if (attachedHandlers.telemetry && attachedHandlers.statusChange && 
        attachedHandlers.debugEvent && attachedHandlers.clearProgramOutput) {
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

    const handleClearProgramOutput = (event: CustomEvent) => {
      console.log("[PybricksHub] Clearing program output log");
      clearProgramOutputLog();
    };

    // Add event listeners to Pybricks hub service
    // Store handler references and register them
    attachedHandlers.telemetry = handleTelemetry as EventListener;
    attachedHandlers.statusChange = handleStatusChange as EventListener;
    attachedHandlers.debugEvent = handleDebugEvent as EventListener;
    attachedHandlers.clearProgramOutput = handleClearProgramOutput as EventListener;

    pybricksHubService.addEventListener("telemetry", attachedHandlers.telemetry);
    pybricksHubService.addEventListener("statusChange", attachedHandlers.statusChange);
    pybricksHubService.addEventListener("debugEvent", attachedHandlers.debugEvent);
    pybricksHubService.addEventListener("clearProgramOutput", attachedHandlers.clearProgramOutput);

    hasRegisteredListeners.current = true;
    console.log("[PybricksHubEventManager] Event listeners registered");

    return () => {
      // Only remove listeners if this component registered them
      if (hasRegisteredListeners.current && attachedHandlers.telemetry) {
        pybricksHubService.removeEventListener("telemetry", attachedHandlers.telemetry);
        pybricksHubService.removeEventListener("statusChange", attachedHandlers.statusChange!);
        pybricksHubService.removeEventListener("debugEvent", attachedHandlers.debugEvent!);
        pybricksHubService.removeEventListener("clearProgramOutput", attachedHandlers.clearProgramOutput!);
        
        // Clear the global handler references
        attachedHandlers = {};
        hasRegisteredListeners.current = false;
        console.log("[PybricksHubEventManager] Event listeners removed");
      }
    };
  }, []); // Empty dependency array since Jotai setters are stable
}