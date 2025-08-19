import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import {
  canvasScaleAtom,
  canvasSizeAtom,
  coordinateUtilsAtom,
} from "../store/atoms/canvasState";

/**
 * Custom hook for managing canvas size and scale calculations
 */
export function useCanvasSize(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const [scale, setScale] = useAtom(canvasScaleAtom);
  const [canvasSize, setCanvasSize] = useAtom(canvasSizeAtom);
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Check if container has valid dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }

    // Include border walls in total dimensions
    const totalWidth =
      coordinateUtils.matDimensions.tableWidth +
      2 * coordinateUtils.matDimensions.borderWallThickness;
    const totalHeight =
      coordinateUtils.matDimensions.tableHeight +
      2 * coordinateUtils.matDimensions.borderWallThickness;

    // PRIORITIZE USING FULL CONTAINER WIDTH
    // Always use the full available container width for the canvas
    const newScale = containerWidth / totalWidth; // Scale to fill container width
    const calculatedHeight = totalHeight * newScale;

    // Only update if scale actually changed to avoid infinite loops
    setScale((prevScale) => {
      if (Math.abs(prevScale - newScale) < 0.001) {
        return prevScale; // No change
      }
      return newScale;
    });

    setCanvasSize((prevSize) => {
      // Round dimensions to avoid floating-point precision issues
      // Use full container width and calculated height based on aspect ratio
      const newWidth = Math.round(containerWidth);
      const newHeight = Math.round(calculatedHeight);

      // Only update if rounded values actually changed
      if (prevSize.width === newWidth && prevSize.height === newHeight) {
        return prevSize; // No change after rounding
      }

      return {
        width: newWidth,
        height: newHeight,
      };
    });
  }, [coordinateUtils, setScale, setCanvasSize]);

  // Handle resize events
  useEffect(() => {
    updateCanvasSize();

    // Throttle resize events to prevent excessive updates
    let resizeTimeout: NodeJS.Timeout;
    const throttledResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateCanvasSize, 100);
    };

    window.addEventListener("resize", throttledResize);

    // Use ResizeObserver for more reliable container size detection
    let resizeObserver: ResizeObserver | null = null;
    const container = canvasRef.current?.parentElement;
    if (container) {
      resizeObserver = new ResizeObserver(throttledResize);
      resizeObserver.observe(container);
    }

    return () => {
      window.removeEventListener("resize", throttledResize);
      clearTimeout(resizeTimeout);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateCanvasSize]);

  // Additional canvas size update when component becomes visible
  useEffect(() => {
    const checkVisibility = () => {
      if (document.visibilityState === "visible") {
        // Component became visible, update canvas size
        setTimeout(() => updateCanvasSize(), 100);
      }
    };

    document.addEventListener("visibilitychange", checkVisibility);
    return () =>
      document.removeEventListener("visibilitychange", checkVisibility);
  }, [updateCanvasSize]);

  return {
    updateCanvasSize,
    scale,
    canvasSize,
  };
}
