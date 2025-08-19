import { useEffect, useRef } from "react";
import { telemetryHistory } from "../services/telemetryHistory";
import type { RobotPosition } from "../utils/robotPosition";

/**
 * Custom hook for managing telemetry recording lifecycle
 */
export function useTelemetryRecording(
  isConnected: boolean,
  currentPosition: RobotPosition | null,
) {
  // Track if we've already initialized recording for this connection
  const recordingInitializedRef = useRef(false);

  // Start telemetry recording when robot connects (only once per connection)
  useEffect(() => {
    if (isConnected && currentPosition && !recordingInitializedRef.current) {
      telemetryHistory.onMatReset(); // This will start a new recording session

      // Mark as initialized
      recordingInitializedRef.current = true;
    } else if (!isConnected) {
      // Reset the flag when disconnected
      recordingInitializedRef.current = false;
    }
  }, [isConnected, currentPosition]);
}
