import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { coordinateUtilsAtom } from "../store/atoms/canvasState";
import type { SplinePath } from "../store/atoms/gameMat";
import {
  findClickedControlPoint,
  findClickedTangencyHandle,
} from "../utils/canvas/splinePathDrawing";

// Use the proper SplinePath type from the atoms

interface UseSplineInteractionsProps {
  currentSplinePath: SplinePath | null;
  isSplinePathMode: boolean;
  justFinishedDragging: boolean;
  addSplinePointAtMousePosition: (x: number, y: number) => string | null;
  setSelectedSplinePointId: (id: string | null) => void;
  setDraggedPointId: (id: string | null) => void;
  setIsDraggingPoint: (dragging: boolean) => void;
  setDraggedControlPoint: (point: any) => void;
  setIsDraggingControlPoint: (dragging: boolean) => void;
  setDraggedTangencyHandle: (handle: any) => void;
  setIsDraggingTangencyHandle: (dragging: boolean) => void;
  updateSplinePoint: (pointId: string, update: any) => void;
  updateControlPoint: (
    pointId: string,
    controlType: "before" | "after",
    controlPoint: any,
  ) => void;
  updateTangencyHandle: (pointId: string, handle: any) => void;
  setHoveredSplinePointId: (id: string | null) => void;
  setHoveredCurvatureHandlePointId: (id: string | null) => void;
}

/**
 * Custom hook for handling spline path interactions
 */
export function useSplineInteractions({
  currentSplinePath,
  isSplinePathMode,
  justFinishedDragging,
  addSplinePointAtMousePosition,
  setSelectedSplinePointId,
  setDraggedPointId,
  setIsDraggingPoint,
  setDraggedControlPoint,
  setIsDraggingControlPoint,
  setDraggedTangencyHandle,
  setIsDraggingTangencyHandle,
  updateSplinePoint,
  updateControlPoint,
  updateTangencyHandle,
  setHoveredSplinePointId,
  setHoveredCurvatureHandlePointId,
}: UseSplineInteractionsProps) {
  const coordinateUtils = useAtomValue(coordinateUtilsAtom);
  const { mmToCanvas, canvasToMm, scale } = coordinateUtils;

  // Helper function to check if a click is on a spline path point
  const findClickedSplinePoint = useCallback(
    (canvasX: number, canvasY: number): string | null => {
      if (!currentSplinePath || !currentSplinePath.points.length) return null;

      const clickRadius = 15; // Click detection radius in pixels

      for (const point of currentSplinePath.points) {
        const pointCanvasPos = mmToCanvas(point.position.x, point.position.y);
        const distance = Math.sqrt(
          (canvasX - pointCanvasPos.x) ** 2 + (canvasY - pointCanvasPos.y) ** 2,
        );

        if (distance <= clickRadius) {
          return point.id;
        }
      }

      return null;
    },
    [currentSplinePath, mmToCanvas],
  );

  const handleSplineClick = useCallback(
    (canvasX: number, canvasY: number): boolean => {
      if (!isSplinePathMode) return false;

      // Ignore clicks immediately after finishing a drag operation
      if (justFinishedDragging) {
        console.log("Ignoring click immediately after drag ended");
        return true; // Click was handled (ignored)
      }

      const matPos = canvasToMm(canvasX, canvasY);

      // Check if clicking on an existing point for selection/editing or dragging
      if (currentSplinePath) {
        // First check for control point clicks
        const utils = {
          mmToCanvas: (x: number, y: number) => {
            const coords = coordinateUtils.mmToCanvas(x, y);
            return { x: coords.x, y: coords.y };
          },
          scale,
        };

        // Check for tangency handle clicks (highest priority)
        const clickedTangencyHandle = findClickedTangencyHandle(
          canvasX,
          canvasY,
          currentSplinePath,
          utils,
        );
        if (clickedTangencyHandle) {
          setSelectedSplinePointId(clickedTangencyHandle.pointId);

          // Get the current handle for initial state
          const point = currentSplinePath.points.find(
            (p) => p.id === clickedTangencyHandle.pointId,
          );
          if (point?.tangencyHandle) {
            const matPos = canvasToMm(canvasX, canvasY);
            setDraggedTangencyHandle({
              pointId: clickedTangencyHandle.pointId,
              gripType: clickedTangencyHandle.gripType,
              initialHandle: { ...point.tangencyHandle },
              initialMousePos: { x: matPos.x, y: matPos.y },
            });
            setIsDraggingTangencyHandle(true);
          }
          return true;
        }

        // Then check for control point clicks
        const clickedControlPoint = findClickedControlPoint(
          canvasX,
          canvasY,
          currentSplinePath,
          utils,
        );
        if (clickedControlPoint) {
          setSelectedSplinePointId(clickedControlPoint.pointId);
          setDraggedControlPoint(clickedControlPoint);
          setIsDraggingControlPoint(true);
          return true;
        }

        // Then check for regular point clicks
        const clickedPointId = findClickedSplinePoint(canvasX, canvasY);
        if (clickedPointId) {
          setSelectedSplinePointId(clickedPointId);
          setDraggedPointId(clickedPointId);
          setIsDraggingPoint(true);
          return true;
        }
      }

      // Add new point to the path
      const pointId = addSplinePointAtMousePosition(matPos.x, matPos.y);
      if (pointId) {
        setSelectedSplinePointId(pointId);
        console.log("Added spline point at", matPos);
      }
      return true; // Click was handled
    },
    [
      isSplinePathMode,
      justFinishedDragging,
      canvasToMm,
      currentSplinePath,
      coordinateUtils,
      scale,
      findClickedSplinePoint,
      setSelectedSplinePointId,
      setDraggedTangencyHandle,
      setIsDraggingTangencyHandle,
      setDraggedControlPoint,
      setIsDraggingControlPoint,
      setDraggedPointId,
      setIsDraggingPoint,
      addSplinePointAtMousePosition,
    ],
  );

  const handleSplineMouseMove = useCallback(
    (
      canvasX: number,
      canvasY: number,
      isDraggingPoint: boolean,
      draggedPointId: string | null,
      isDraggingControlPoint: boolean,
      draggedControlPoint: any,
      isDraggingTangencyHandle: boolean,
      draggedTangencyHandle: any,
      canvasRef: React.RefObject<HTMLCanvasElement | null>,
    ) => {
      if (!isSplinePathMode) return;

      // Handle spline point dragging
      if (isDraggingPoint && draggedPointId) {
        const matPos = canvasToMm(canvasX, canvasY);
        // Find the point and update its position
        const point = currentSplinePath?.points.find(
          (p) => p.id === draggedPointId,
        );
        if (point) {
          updateSplinePoint(draggedPointId, {
            position: {
              x: matPos.x,
              y: matPos.y,
              heading: point.position.heading, // Keep existing heading
            },
          });
        }
        return;
      }

      // Handle control point dragging
      if (isDraggingControlPoint && draggedControlPoint) {
        const matPos = canvasToMm(canvasX, canvasY);
        // Find the point and update the control point relative to the point position
        const point = currentSplinePath?.points.find(
          (p) => p.id === draggedControlPoint.pointId,
        );
        if (point) {
          const controlPoint = {
            x: matPos.x - point.position.x,
            y: matPos.y - point.position.y,
          };
          updateControlPoint(
            draggedControlPoint.pointId,
            draggedControlPoint.controlType,
            controlPoint,
          );
        }
        return;
      }

      // Handle SolidWorks-style tangency handle dragging
      if (isDraggingTangencyHandle && draggedTangencyHandle) {
        const matPos = canvasToMm(canvasX, canvasY);
        const point = currentSplinePath?.points.find(
          (p) => p.id === draggedTangencyHandle.pointId,
        );

        if (point?.tangencyHandle) {
          const currentOffset = {
            x: matPos.x - point.position.x,
            y: matPos.y - point.position.y,
          };

          const { gripType, initialHandle } = draggedTangencyHandle;
          const newHandle = { ...initialHandle, isEdited: true }; // Mark as edited (blue)

          if (gripType === "diamond") {
            // Diamond grip: Controls angle only, maintains original magnitude
            const originalLength = Math.sqrt(
              initialHandle.x * initialHandle.x +
                initialHandle.y * initialHandle.y,
            );
            const newAngle = Math.atan2(currentOffset.y, currentOffset.x);
            newHandle.x = Math.cos(newAngle) * originalLength;
            newHandle.y = Math.sin(newAngle) * originalLength;
          } else if (gripType === "arrow") {
            // Arrow grip: Controls magnitude only, maintains original angle
            const originalAngle = Math.atan2(initialHandle.y, initialHandle.x);
            const newLength = Math.sqrt(
              currentOffset.x * currentOffset.x +
                currentOffset.y * currentOffset.y,
            );
            newHandle.x = Math.cos(originalAngle) * newLength;
            newHandle.y = Math.sin(originalAngle) * newLength;

            // Update strength based on new length
            const maxDistance = 100; // 100mm max distance for full strength
            newHandle.strength = Math.min(newLength / maxDistance, 1);
          } else if (gripType === "endpoint") {
            // End-point grip: Controls both angle and magnitude
            newHandle.x = currentOffset.x;
            newHandle.y = currentOffset.y;

            // Update strength based on distance
            const distance = Math.sqrt(
              currentOffset.x * currentOffset.x +
                currentOffset.y * currentOffset.y,
            );
            const maxDistance = 100; // 100mm max distance for full strength
            newHandle.strength = Math.min(distance / maxDistance, 1);
          }

          updateTangencyHandle(draggedTangencyHandle.pointId, newHandle);
        }
        return;
      }

      // Check for spline element hover (only when not dragging)
      if (
        currentSplinePath &&
        !isDraggingPoint &&
        !isDraggingControlPoint &&
        !isDraggingTangencyHandle
      ) {
        const utils = {
          mmToCanvas: (x: number, y: number) => {
            const coords = coordinateUtils.mmToCanvas(x, y);
            return { x: coords.x, y: coords.y };
          },
          scale,
        };

        // Check for tangency handle hover (highest priority)
        const hoveredTangencyHandle = findClickedTangencyHandle(
          canvasX,
          canvasY,
          currentSplinePath,
          utils,
        );
        if (hoveredTangencyHandle) {
          setHoveredCurvatureHandlePointId(hoveredTangencyHandle.pointId);
          setHoveredSplinePointId(null);
          // Set cursor to pointer to indicate interactivity
          const canvas = canvasRef.current;
          if (canvas && canvas.style.cursor !== "grab")
            canvas.style.cursor = "grab";
        } else {
          setHoveredCurvatureHandlePointId(null);

          // Check for spline point hover
          const hoveredPointId = findClickedSplinePoint(canvasX, canvasY);
          if (hoveredPointId) {
            setHoveredSplinePointId(hoveredPointId);
            // Set cursor to pointer to indicate interactivity
            const canvas = canvasRef.current;
            if (canvas && canvas.style.cursor !== "grab")
              canvas.style.cursor = "grab";
          } else {
            setHoveredSplinePointId(null);
            // Reset cursor
            const canvas = canvasRef.current;
            if (canvas && canvas.style.cursor !== "default")
              canvas.style.cursor = "default";
          }
        }
      }
    },
    [
      isSplinePathMode,
      canvasToMm,
      currentSplinePath,
      updateSplinePoint,
      updateControlPoint,
      updateTangencyHandle,
      coordinateUtils,
      scale,
      findClickedSplinePoint,
      setHoveredCurvatureHandlePointId,
      setHoveredSplinePointId,
    ],
  );

  const handleSplineMouseLeave = useCallback(
    (canvasRef: React.RefObject<HTMLCanvasElement | null>) => {
      if (!isSplinePathMode) return;

      // Clear spline hover states
      setHoveredSplinePointId(null);
      setHoveredCurvatureHandlePointId(null);

      // Reset cursor
      const canvas = canvasRef.current;
      if (canvas && canvas.style.cursor !== "default") {
        canvas.style.cursor = "default";
      }
    },
    [
      isSplinePathMode,
      setHoveredSplinePointId,
      setHoveredCurvatureHandlePointId,
    ],
  );

  return {
    findClickedSplinePoint,
    handleSplineClick,
    handleSplineMouseMove,
    handleSplineMouseLeave,
  };
}
