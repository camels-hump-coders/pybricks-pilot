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
  onAccumulatedTelemetryUpdate: (data: {
    distance: number;
    angle: number;
  }) => void;
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
  onAccumulatedTelemetryUpdate,
  onRobotPositionUpdate,
}: UseTelemetryUpdatesProps) {
  // Use refs for values that need to be accessed in event handlers
  const currentPositionRef = useRef(currentPosition);
  const telemetryReferenceRef = useRef(telemetryReference);
  const manualHeadingAdjustmentRef = useRef(manualHeadingAdjustment);
  const isCmdKeyPressedRef = useRef(isCmdKeyPressed);

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

      // Calculate heading using delta from reference + manual adjustment
      const currentHeading =
        (telemetryReferenceRef.current.position.heading +
          deltaAngle +
          manualHeadingAdjustmentRef.current) %
        360;

      // Calculate movement using the current heading
      const headingRad = (currentHeading * Math.PI) / 180;

      const newX =
        telemetryReferenceRef.current.position.x +
        deltaDistance * Math.sin(headingRad);
      // SIMPLIFIED MODEL: Move center of rotation in heading direction
      // heading=0° = move UP (decrease Y), heading=180° = move DOWN (increase Y)
      const newY =
        telemetryReferenceRef.current.position.y -
        deltaDistance * Math.cos(headingRad);

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
          isCmdKeyPressedRef.current
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

      // Update accumulated telemetry state for external consumption
      onAccumulatedTelemetryUpdate({
        distance: currentDistance,
        angle: currentAngle,
      });
    };

    // Subscribe to telemetry events from the global document
    document.addEventListener("telemetry", handleTelemetryEvent);

    return () => {
      document.removeEventListener("telemetry", handleTelemetryEvent);
    };
  }, [
    isConnected,
    onTelemetryReferenceUpdate,
    onAccumulatedTelemetryUpdate,
    onRobotPositionUpdate,
  ]);
}
