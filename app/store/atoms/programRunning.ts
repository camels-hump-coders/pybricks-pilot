import { atom } from "jotai";

// Track the last time telemetry was received
const lastTelemetryTimestampAtom = atom<number>(0);

// Track if we're currently running a program based on telemetry reception
export const isProgramRunningAtom = atom<boolean>(false);

// Action atom to update telemetry timestamp and program running state
export const updateTelemetryTimestampAtom = atom(
  null,
  (get, set, telemetryData: any) => {
    const now = Date.now();

    // Only update if we have meaningful telemetry data (motors or drivebase)
    if (telemetryData && (telemetryData.motors || telemetryData.drivebase)) {
      set(lastTelemetryTimestampAtom, now);

      // If program wasn't running, mark it as running
      const wasRunning = get(isProgramRunningAtom);
      if (!wasRunning) {
        console.log("[ProgramRunning] Program started - telemetry received");
        set(isProgramRunningAtom, true);
      }
    }
  },
);

// Timer-based atom that checks for telemetry timeout
let timeoutId: NodeJS.Timeout | null = null;

export const checkProgramRunningTimeoutAtom = atom(null, (get, set) => {
  const lastTimestamp = get(lastTelemetryTimestampAtom);
  const isProgramRunning = get(isProgramRunningAtom);

  if (isProgramRunning) {
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set a new timeout to check if telemetry has stopped
    timeoutId = setTimeout(() => {
      const currentTimestamp = get(lastTelemetryTimestampAtom);
      const timeSinceLastTelemetry = Date.now() - currentTimestamp;

      if (timeSinceLastTelemetry >= 1000) {
        console.log(
          "[ProgramRunning] Program stopped - no telemetry for 1 second",
        );
        set(isProgramRunningAtom, false);
        set(lastTelemetryTimestampAtom, 0);
      }
    }, 1000);
  }
});

// Helper atom to manually stop the program (for manual stop button)
const stopProgramAtom = atom(null, (get, set) => {
  console.log("[ProgramRunning] Program manually stopped");
  set(isProgramRunningAtom, false);
  set(lastTelemetryTimestampAtom, 0);

  // Clear timeout
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
});
