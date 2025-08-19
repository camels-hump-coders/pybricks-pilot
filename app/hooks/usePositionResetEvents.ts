import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { coordinateUtilsAtom } from "../store/atoms/canvasState";
import type { RobotPosition } from "../utils/robotPosition";
import { useJotaiGameMat } from "./useJotaiGameMat";

/**
 * Custom hook for handling position reset and set position events
 */
export function usePositionResetEvents() {
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const gameMat = useJotaiGameMat();

  useEffect(() => {
    const handlePositionResetEvent = () => {
      console.log(
        "[usePositionResetEvents] Position reset received, resetting robot to start position",
      );
      // Reset robot to the starting position but keep telemetry history
      gameMat.resetRobotToStartPosition();
    };

    const handleSetPositionEvent = (event: CustomEvent<{ position: any }>) => {
      const positionData = event.detail.position;
      console.log(
        "[usePositionResetEvents] Position set received:",
        positionData,
      );

      try {
        // Calculate robot position from edge measurements (similar to CompactRobotController logic)
        const matWidth = coordinateUtils.matDimensions.matWidthMm;
        const matHeight = coordinateUtils.matDimensions.matHeightMm;

        // Convert program position to mat coordinates
        let x: number, y: number;

        if (positionData.side === "left") {
          x = positionData.fromSide; // Distance from left edge
        } else {
          x = matWidth - positionData.fromSide; // Distance from right edge
        }

        y = matHeight - positionData.fromBottom; // Distance from bottom edge (mat coordinates are top-origin)

        const robotPosition: RobotPosition = {
          x,
          y,
          heading: positionData.heading,
        };

        console.log(
          "[usePositionResetEvents] Setting robot position to:",
          robotPosition,
        );

        // Use the existing setRobotPosition function without reset functions to preserve telemetry
        gameMat.setRobotPosition(robotPosition);
      } catch (error) {
        console.error(
          "[usePositionResetEvents] Failed to set robot position:",
          error,
        );
      }
    };

    // Listen for position reset and set events
    document.addEventListener(
      "positionReset",
      handlePositionResetEvent as EventListener,
    );
    document.addEventListener(
      "setPosition",
      handleSetPositionEvent as EventListener,
    );

    return () => {
      document.removeEventListener(
        "positionReset",
        handlePositionResetEvent as EventListener,
      );
      document.removeEventListener(
        "setPosition",
        handleSetPositionEvent as EventListener,
      );
    };
  }, [coordinateUtils, gameMat]);
}
