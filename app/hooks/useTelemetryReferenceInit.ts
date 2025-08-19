import { useEffect } from "react";
import type { RobotPosition } from "../utils/robotPosition";

interface TelemetryReference {
  distance: number;
  angle: number;
  position: RobotPosition;
}

/**
 * Custom hook for initializing telemetry reference when robot position is available
 */
export function useTelemetryReferenceInit(
  currentPosition: RobotPosition | null,
  telemetryReference: TelemetryReference | null,
  isConnected: boolean,
  setTelemetryReference: (ref: TelemetryReference) => void,
) {
  // Initialize telemetry reference when robot position is available but reference is not set
  useEffect(() => {
    if (currentPosition && !telemetryReference && isConnected) {
      setTelemetryReference({
        distance: 0,
        angle: 0,
        position: currentPosition,
      });
    }
  }, [currentPosition, telemetryReference, isConnected, setTelemetryReference]);
}
