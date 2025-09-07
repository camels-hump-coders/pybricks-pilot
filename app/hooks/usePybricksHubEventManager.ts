import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type {
  DebugEvent,
  ProgramStatus,
  TelemetryData,
} from "../services/pybricksHub";
import { pybricksHubService } from "../services/pybricksHub";
import {
  checkProgramRunningTimeoutAtom,
  updateTelemetryTimestampAtom,
} from "../store/atoms/programRunning";
import {
  clearProgramOutputLogAtom,
  debugEventsAtom,
  hubInfoAtom,
  isConnectedAtom,
  programOutputLogAtom,
  programStatusAtom,
  telemetryDataAtom,
} from "../store/atoms/robotConnection";
import { transformTelemetryData } from "../utils/coordinateTransformations";
import { normalizeProgramLine } from "../utils/logs";

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
  const updateTelemetryTimestamp = useSetAtom(updateTelemetryTimestampAtom);
  const checkProgramRunningTimeout = useSetAtom(checkProgramRunningTimeoutAtom);
  const hasRegisteredListeners = useRef(false);

  useEffect(() => {
    // Prevent multiple registrations using ref
    if (hasRegisteredListeners.current) {
      console.warn(
        "[PybricksHubEventManager] Event listeners already registered for this component, skipping",
      );
      return;
    }

    const handleTelemetry = (event: CustomEvent<TelemetryData>) => {
      // Transform telemetry data to use our standardized coordinate system
      const transformedTelemetry = transformTelemetryData(event.detail);
      setTelemetryData(transformedTelemetry);

      // Update program running state based on telemetry reception
      updateTelemetryTimestamp(transformedTelemetry);
      checkProgramRunningTimeout();

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
      if (status.output?.trim()) {
        const timestamp = new Date().toLocaleTimeString();
        const raw = status.output.trim();
        const normalized = normalizeProgramLine(raw) || "";
        const logEntry = `[${timestamp}] ${normalized}`;
        setProgramOutputLog((prev) => [...prev, logEntry].slice(-200)); // Keep last 200 lines

        // Check for hub menu status messages
        const output = normalized;
        if (output.includes("[PILOT:MENU_STATUS]")) {
          try {
            // Parse hub menu status: [PILOT:MENU_STATUS] selected=1 total=3 state=menu
            const match = output.match(
              /\[PILOT:MENU_STATUS\]\s+selected=(\d+)\s+total=(\d+)\s+state=(\w+)/,
            );
            if (match) {
              const [, selectedProgram, totalPrograms, menuState] = match;
              const hubMenuEvent = new CustomEvent("hubMenuStatus", {
                detail: {
                  selectedProgram: parseInt(selectedProgram, 10),
                  totalPrograms: parseInt(totalPrograms, 10),
                  state: menuState,
                  timestamp: Date.now(),
                },
              });
              document.dispatchEvent(hubMenuEvent);
            }
          } catch (_e) {
            console.warn("Failed to parse hub menu status:", output);
          }
        }
      }
    };

    const handleDebugEvent = (event: CustomEvent<DebugEvent>) => {
      const debugEvent = event.detail;

      // Add debug event to the list
      setDebugEvents((prev) => [...prev, debugEvent].slice(-500)); // Keep last 500 events

      // Handle position reset events (make this resilient to plain text too)
      if (
        debugEvent.type === "stdout" &&
        (debugEvent.message.includes("[PILOT:POSITION_RESET]") ||
          debugEvent.message.includes(
            "Drivebase telemetry reset - distance and angle set to 0",
          ))
      ) {
        console.log("[PybricksHub] Position reset command received");
        // Dispatch a custom event for position reset
        const resetEvent = new CustomEvent("positionReset", {
          detail: { timestamp: Date.now() },
        });
        document.dispatchEvent(resetEvent);
      }

      // Handle position set events
      if (
        debugEvent.type === "stdout" &&
        debugEvent.message.includes("[PILOT:SET_POSITION]")
      ) {
        try {
          // Extract position data from message
          const match = debugEvent.message.match(
            /\[PILOT:SET_POSITION\]\s*({.*})/,
          );
          if (match) {
            const positionData = JSON.parse(match[1]);
            console.log(
              "[PybricksHub] Position set command received:",
              positionData,
            );

            // Dispatch a custom event for position setting
            const setPositionEvent = new CustomEvent("setPosition", {
              detail: {
                position: positionData,
                timestamp: Date.now(),
              },
            });
            document.dispatchEvent(setPositionEvent);
          }
        } catch (error) {
          console.error("[PybricksHub] Failed to parse position data:", error);
        }
      }

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

    const handleClearProgramOutput = (_event: CustomEvent) => {
      console.log("[PybricksHub] Clearing program output log");
      clearProgramOutputLog();
    };

    // Register event listeners directly
    pybricksHubService.addEventListener(
      "telemetry",
      handleTelemetry as EventListener,
    );
    pybricksHubService.addEventListener(
      "statusChange",
      handleStatusChange as EventListener,
    );
    pybricksHubService.addEventListener(
      "debugEvent",
      handleDebugEvent as EventListener,
    );
    pybricksHubService.addEventListener(
      "clearProgramOutput",
      handleClearProgramOutput as EventListener,
    );

    hasRegisteredListeners.current = true;
    console.log("[PybricksHubEventManager] Event listeners registered");

    return () => {
      // Cleanup event listeners
      if (hasRegisteredListeners.current) {
        pybricksHubService.removeEventListener(
          "telemetry",
          handleTelemetry as EventListener,
        );
        pybricksHubService.removeEventListener(
          "statusChange",
          handleStatusChange as EventListener,
        );
        pybricksHubService.removeEventListener(
          "debugEvent",
          handleDebugEvent as EventListener,
        );
        pybricksHubService.removeEventListener(
          "clearProgramOutput",
          handleClearProgramOutput as EventListener,
        );

        hasRegisteredListeners.current = false;
        console.log("[PybricksHubEventManager] Event listeners removed");
      }
    };
  }, [
    setTelemetryData,
    setProgramStatus,
    setProgramOutputLog,
    setDebugEvents,
    setHubInfo,
    setIsConnected,
    clearProgramOutputLog,
    updateTelemetryTimestamp,
    checkProgramRunningTimeout,
  ]); // Include setters to ensure they're captured in closure
}
