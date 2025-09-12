import { useEffect, useRef } from "react";
import { telemetryHistory } from "../services/telemetryHistory";
import type { RobotPosition } from "../utils/robotPosition";

interface TelemetryReference {
  distance: number;
  angle: number;
  position: RobotPosition;
}

interface UseTelemetryUpdatesProps {
  isConnected: boolean;
  currentPosition: RobotPosition;
  telemetryReference: TelemetryReference | null;
  manualHeadingAdjustment: number;
  isCmdKeyPressed: boolean;
  onTelemetryReferenceUpdate: (ref: TelemetryReference) => void;
  onRobotPositionUpdate: (telemetryData: any) => void;
}

/**
 * Custom hook to handle telemetry updates and robot position calculations
 */
export function useTelemetryUpdates({
  isConnected,
  currentPosition,
  telemetryReference,
  manualHeadingAdjustment,
  isCmdKeyPressed,
  onTelemetryReferenceUpdate,
  onRobotPositionUpdate,
}: UseTelemetryUpdatesProps) {
  // Use refs for values that need to be accessed in event handlers
  const currentPositionRef = useRef(currentPosition);
  const telemetryReferenceRef = useRef(telemetryReference);
  const manualHeadingAdjustmentRef = useRef(manualHeadingAdjustment);
  const isCmdKeyPressedRef = useRef(isCmdKeyPressed);
  const lastProcessRef = useRef(0);

  // Update refs when values change
  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);

  useEffect(() => {
    telemetryReferenceRef.current = telemetryReference;
  }, [telemetryReference]);

  useEffect(() => {
    manualHeadingAdjustmentRef.current = manualHeadingAdjustment;
  }, [manualHeadingAdjustment]);

  useEffect(() => {
    isCmdKeyPressedRef.current = isCmdKeyPressed;
  }, [isCmdKeyPressed]);

  // Handle telemetry updates using event subscription
  useEffect(() => {
    if (!isConnected) return;

    const handleTelemetryEvent = (event: Event) => {
      const now = performance.now();
      // Throttle processing to ~50 FPS to reduce load on slower devices
      if (now - lastProcessRef.current < 20) {
        return;
      }
      lastProcessRef.current = now;

      const customEvent = event as CustomEvent;
      const receivedTelemetryData = customEvent.detail;

      // Early return if we don't have required data
      if (!receivedTelemetryData?.drivebase || !currentPositionRef.current) {
        return;
      }

      // Ensure recording is active when we have telemetry data
      telemetryHistory.ensureRecordingActive();

      const { drivebase } = receivedTelemetryData;
      const currentDistance = drivebase.distance || 0;
      const currentAngle = drivebase.angle || 0;

      // Initialize telemetry reference if not set
      if (!telemetryReferenceRef.current) {
        const newReference = {
          distance: currentDistance,
          angle: currentAngle,
          position: { ...currentPositionRef.current },
        };

        telemetryReferenceRef.current = newReference;
        onTelemetryReferenceUpdate(newReference);

        return; // Don't process movement on first telemetry data
      }

      // Calculate deltas from the telemetry reference
      const deltaDistance =
        currentDistance - telemetryReferenceRef.current.distance;
      const deltaAngle = currentAngle - telemetryReferenceRef.current.angle;

      // Calculate headings (in radians) including manual adjustment for consistent world frame
      const headingStartDeg = telemetryReferenceRef.current.position.heading;
      const manualAdjDeg = manualHeadingAdjustmentRef.current || 0;
      const heading0Rad = ((headingStartDeg + manualAdjDeg) * Math.PI) / 180;
      const thetaRad = (deltaAngle * Math.PI) / 180; // signed sweep

      // Update heading using delta + manual adjustment
      const currentHeading =
        (headingStartDeg + deltaAngle + manualAdjDeg) % 360;

      // Arc-aware displacement integration
      let dx = 0;
      let dy = 0;
      const EPS = 1e-6;
      if (Math.abs(thetaRad) < EPS) {
        // Straight-line approximation (consistent with our world frame)
        dx = deltaDistance * Math.sin(heading0Rad);
        dy = -deltaDistance * Math.cos(heading0Rad);
      } else {
        // Closed-form arc displacement for our world frame (x' = v sin h, y' = -v cos h)
        // R = s / theta, h1 = h0 + theta
        const R = deltaDistance / thetaRad; // signed radius (preserves direction)
        const h1 = heading0Rad + thetaRad;
        dx = R * (Math.cos(heading0Rad) - Math.cos(h1));
        dy = R * (Math.sin(heading0Rad) - Math.sin(h1));
      }

      const newX = telemetryReferenceRef.current.position.x + dx;
      const newY = telemetryReferenceRef.current.position.y + dy;

      const newPosition: RobotPosition = {
        x: newX,
        y: newY,
        heading: currentHeading,
      };

      // Add telemetry point to history if recording
      if (telemetryHistory.isRecordingActive() && receivedTelemetryData) {
        telemetryHistory.addTelemetryPoint(
          receivedTelemetryData,
          newPosition.x,
          newPosition.y,
          newPosition.heading,
          isCmdKeyPressedRef.current,
        );
      }

      // Create new telemetry data for position update
      const newTelemetryData = {
        timestamp: Date.now(),
        type: "telemetry",
        hub: {
          imu: {
            heading: newPosition.heading,
            acceleration: [0, 0, 0],
            angular_velocity: [0, 0, 0],
          },
        },
        drivebase: {
          distance: currentDistance,
          angle: currentAngle,
          state: {
            distance: currentDistance,
            drive_speed: 0,
            angle: currentAngle,
            turn_rate: 0,
          },
        },
      };

      // Update robot position through callback
      onRobotPositionUpdate(newTelemetryData);

      // Update telemetry reference to new position
      const newReference = {
        distance: currentDistance,
        angle: currentAngle,
        position: newPosition,
      };
      telemetryReferenceRef.current = newReference;
      onTelemetryReferenceUpdate(newReference);
    };

    // Subscribe to telemetry events from the global document
    document.addEventListener("telemetry", handleTelemetryEvent);

    return () => {
      document.removeEventListener("telemetry", handleTelemetryEvent);
    };
  }, [isConnected, onTelemetryReferenceUpdate, onRobotPositionUpdate]);
}
