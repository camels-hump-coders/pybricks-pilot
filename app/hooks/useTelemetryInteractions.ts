import { useAtomValue } from "jotai";
import { useCallback } from "react";
import type { TelemetryPoint } from "../services/telemetryHistory";
import { coordinateUtilsAtom } from "../store/atoms/canvasState";
import {
  pathVisualizationOptionsAtom,
  selectedPathPointsAtom,
} from "../store/atoms/telemetryPoints";

interface UseTelemetryInteractionsProps {
  setHoveredPoint: (point: TelemetryPoint | null) => void;
  setHoveredPointIndex: (index: number) => void;
  setTooltipPosition: (position: { x: number; y: number } | null) => void;
}

/**
 * Custom hook for handling telemetry point interactions
 */
export function useTelemetryInteractions({
  setHoveredPoint,
  setHoveredPointIndex,
  setTooltipPosition,
}: UseTelemetryInteractionsProps) {
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const selectedPathPoints = useAtomValue(selectedPathPointsAtom);
  const pathOptions = useAtomValue(pathVisualizationOptionsAtom);

  const { mmToCanvas } = coordinateUtils;

  const checkTelemetryPointHover = useCallback(
    (canvasX: number, canvasY: number, pageX: number, pageY: number) => {
      // Use selected path points from atom
      const allPoints: {
        point: TelemetryPoint;
        pathIndex: number;
        pointIndex: number;
      }[] = [];

      // Collect points from selected path
      selectedPathPoints.forEach((point, pointIndex) => {
        allPoints.push({ point, pathIndex: 1, pointIndex });
      });

      // Find closest point within hover radius
      let closestPoint = null;
      let closestDistance = Infinity;
      let closestIndex = -1;
      const hoverRadius = 10; // pixels

      allPoints.forEach(({ point, pointIndex }) => {
        // SIMPLIFIED MODEL: telemetry points are already in center-of-rotation coordinates
        const pos = mmToCanvas(point.x, point.y);
        const distance = Math.sqrt(
          (canvasX - pos.x) ** 2 + (canvasY - pos.y) ** 2,
        );

        if (distance <= hoverRadius && distance < closestDistance) {
          closestDistance = distance;
          closestPoint = point;
          closestIndex = pointIndex;
        }
      });

      setHoveredPoint(closestPoint);
      setHoveredPointIndex(closestIndex);

      if (closestPoint) {
        setTooltipPosition({ x: pageX, y: pageY });
      } else {
        setTooltipPosition(null);
      }
    },
    [
      selectedPathPoints,
      mmToCanvas,
      setHoveredPoint,
      setHoveredPointIndex,
      setTooltipPosition,
    ],
  );

  const handleTelemetryMouseMove = useCallback(
    (canvasX: number, canvasY: number, pageX: number, pageY: number) => {
      // Check for telemetry point hover (if path visualization is enabled)
      if (pathOptions.showMarkers) {
        checkTelemetryPointHover(canvasX, canvasY, pageX, pageY);
      } else {
        setHoveredPoint(null);
        setHoveredPointIndex(-1);
        setTooltipPosition(null);
      }
    },
    [
      pathOptions.showMarkers,
      checkTelemetryPointHover,
      setHoveredPoint,
      setHoveredPointIndex,
      setTooltipPosition,
    ],
  );

  const handleTelemetryMouseLeave = useCallback(() => {
    setHoveredPoint(null);
    setHoveredPointIndex(-1);
    setTooltipPosition(null);
  }, [setHoveredPoint, setHoveredPointIndex, setTooltipPosition]);

  return {
    checkTelemetryPointHover,
    handleTelemetryMouseMove,
    handleTelemetryMouseLeave,
  };
}
