import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { hoveredObjectAtom } from "../store/atoms/canvasState";
import { controlModeAtom } from "../store/atoms/gameMat";
import {
  draggedControlPointAtom,
  draggedPointIdAtom,
  draggedTangencyHandleAtom,
  isDraggingControlPointAtom,
  isDraggingMissionPointAtom,
  isDraggingPointAtom,
  isDraggingTangencyHandleAtom,
  stopAllDraggingAtom,
} from "../store/atoms/matUIState";
import { useMissionInteractions } from "./useMissionInteractions";
import { useMissionPointInteractions } from "./useMissionPointInteractions";
import { useSplineInteractions } from "./useSplineInteractions";
import { useTelemetryInteractions } from "./useTelemetryInteractions";

interface UseCanvasEventHandlersProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  showScoring: boolean;
  scoringState: any;
  setScoringState: React.Dispatch<React.SetStateAction<any>>;
  coordinateUtils: any; // TODO: Add proper typing
  // Spline-related props
  currentSplinePath: any;
  isSplinePathMode: boolean;
  justFinishedDragging: boolean;
  addSplinePointAtMousePosition: (x: number, y: number) => string | null;
  setSelectedSplinePointId: (id: string | null) => void;
  updateSplinePoint: (pointId: string, update: any) => void;
  updateControlPoint: (
    pointId: string,
    controlType: "before" | "after",
    controlPoint: any,
  ) => void;
  updateTangencyHandle: (pointId: string, handle: any) => void;
  setHoveredSplinePointId: (id: string | null) => void;
  setHoveredCurvatureHandlePointId: (id: string | null) => void;
  // Telemetry-related props
  setHoveredPoint: (point: any) => void;
  setHoveredPointIndex: (index: number) => void;
  setTooltipPosition: (position: { x: number; y: number } | null) => void;
  setMousePosition: (position: any) => void;
}

/**
 * Custom hook for handling all canvas event interactions
 */
export function useCanvasEventHandlers({
  canvasRef,
  showScoring,
  scoringState,
  setScoringState,
  coordinateUtils,
  currentSplinePath,
  isSplinePathMode,
  justFinishedDragging,
  addSplinePointAtMousePosition,
  setSelectedSplinePointId,
  updateSplinePoint,
  updateControlPoint,
  updateTangencyHandle,
  setHoveredSplinePointId,
  setHoveredCurvatureHandlePointId,
  setHoveredPoint,
  setHoveredPointIndex,
  setTooltipPosition,
  setMousePosition,
}: UseCanvasEventHandlersProps) {
  const controlMode = useAtomValue(controlModeAtom);
  const setHoveredObject = useSetAtom(hoveredObjectAtom);
  const stopAllDragging = useSetAtom(stopAllDraggingAtom);

  // Dragging state atoms
  const isDraggingPoint = useAtomValue(isDraggingPointAtom);
  const draggedPointId = useAtomValue(draggedPointIdAtom);
  const isDraggingControlPoint = useAtomValue(isDraggingControlPointAtom);
  const draggedControlPoint = useAtomValue(draggedControlPointAtom);
  const isDraggingTangencyHandle = useAtomValue(isDraggingTangencyHandleAtom);
  const draggedTangencyHandle = useAtomValue(draggedTangencyHandleAtom);
  const isDraggingMissionPoint = useAtomValue(isDraggingMissionPointAtom);

  // Import interaction hooks
  const { handleMissionClick, checkMissionClick, createToggleObjective } =
    useMissionInteractions();
  const missionPointInteractions = useMissionPointInteractions();

  const splineInteractions = useSplineInteractions({
    currentSplinePath,
    isSplinePathMode,
    justFinishedDragging,
    addSplinePointAtMousePosition,
    setSelectedSplinePointId,
    setDraggedPointId: () => {}, // Will be implemented with proper atom setters
    setIsDraggingPoint: () => {}, // Will be implemented with proper atom setters
    setDraggedControlPoint: () => {}, // Will be implemented with proper atom setters
    setIsDraggingControlPoint: () => {}, // Will be implemented with proper atom setters
    setDraggedTangencyHandle: () => {}, // Will be implemented with proper atom setters
    setIsDraggingTangencyHandle: () => {}, // Will be implemented with proper atom setters
    updateSplinePoint,
    updateControlPoint,
    updateTangencyHandle,
    setHoveredSplinePointId,
    setHoveredCurvatureHandlePointId,
  });

  const { handleTelemetryMouseMove, handleTelemetryMouseLeave } =
    useTelemetryInteractions({
      setHoveredPoint,
      setHoveredPointIndex,
      setTooltipPosition,
    });

  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      // Account for canvas scaling: convert display coordinates to actual canvas coordinates
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      // Handle mission point dragging in mission mode
      if (controlMode === "mission") {
        const handled = missionPointInteractions.handleMissionMouseDown(
          canvasX,
          canvasY,
          coordinateUtils,
        );
        if (handled) {
          event.preventDefault();
          return;
        }
      }
    },
    [canvasRef, controlMode, coordinateUtils, missionPointInteractions],
  );

  const handleCanvasClick = useCallback(
    async (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      // Account for canvas scaling: convert display coordinates to actual canvas coordinates
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      // Don't handle clicks if we're dragging
      if (isDraggingMissionPoint) return;

      // Handle mission point placement in mission mode
      if (controlMode === "mission") {
        const handled = missionPointInteractions.handleMissionClick(
          canvasX,
          canvasY,
          coordinateUtils,
        );
        if (handled) return;
      }

      // Handle spline path mode clicks
      if (isSplinePathMode) {
        const handled = splineInteractions.handleSplineClick(canvasX, canvasY);
        if (handled) return;
      }

      // Handle mission clicks
      const missionHandled = handleMissionClick(
        canvasX,
        canvasY,
        showScoring,
        controlMode,
      );
      if (missionHandled) return;
    },
    [
      canvasRef,
      controlMode,
      isDraggingMissionPoint,
      coordinateUtils,
      missionPointInteractions,
      isSplinePathMode,
      splineInteractions,
      handleMissionClick,
      showScoring,
    ],
  );

  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      // Account for canvas scaling: convert display coordinates to actual canvas coordinates
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      // Update mouse position for mission point placement preview
      // Convert canvas coordinates to mat coordinates (mm)
      const matPosition = coordinateUtils.canvasToMm(canvasX, canvasY);
      setMousePosition({
        x: matPosition.x,
        y: matPosition.y,
        heading: 0, // Default heading, not used for mouse position
      });

      // Handle mission point interactions in mission mode
      if (controlMode === "mission") {
        missionPointInteractions.handleMissionMouseMove(
          canvasX,
          canvasY,
          coordinateUtils,
          canvasRef,
        );
      }

      // Handle spline interactions
      splineInteractions.handleSplineMouseMove(
        canvasX,
        canvasY,
        isDraggingPoint,
        draggedPointId,
        isDraggingControlPoint,
        draggedControlPoint,
        isDraggingTangencyHandle,
        draggedTangencyHandle,
        canvasRef,
      );

      // Handle telemetry interactions
      handleTelemetryMouseMove(canvasX, canvasY, event.pageX, event.pageY);

      // Check for mission hover (only in program mode)
      if (showScoring && controlMode === "program") {
        const hoveredObjectId = checkMissionClick(canvasX, canvasY);
        setHoveredObject(hoveredObjectId);
      } else {
        setHoveredObject(null);
      }
    },
    [
      canvasRef,
      coordinateUtils,
      setMousePosition,
      controlMode,
      missionPointInteractions,
      splineInteractions,
      isDraggingPoint,
      draggedPointId,
      isDraggingControlPoint,
      draggedControlPoint,
      isDraggingTangencyHandle,
      draggedTangencyHandle,
      handleTelemetryMouseMove,
      showScoring,
      checkMissionClick,
      setHoveredObject,
    ],
  );

  const handleCanvasMouseUp = useCallback(() => {
    // Handle mission point mouse up
    missionPointInteractions.handleMissionMouseUp();

    // Stop all dragging when mouse is released
    stopAllDragging();
  }, [missionPointInteractions, stopAllDragging]);

  const handleCanvasMouseLeave = useCallback(() => {
    setMousePosition(null);
    setHoveredObject(null);

    // Handle mission point mouse leave
    missionPointInteractions.handleMissionMouseLeave(canvasRef);

    // Stop all dragging when mouse leaves
    stopAllDragging();

    // Handle spline mouse leave
    splineInteractions.handleSplineMouseLeave(canvasRef);

    // Handle telemetry mouse leave
    handleTelemetryMouseLeave();
  }, [
    setMousePosition,
    setHoveredObject,
    missionPointInteractions,
    stopAllDragging,
    splineInteractions,
    canvasRef,
    handleTelemetryMouseLeave,
  ]);

  // Create the toggleObjective function with bound parameters
  const toggleObjective = createToggleObjective(setScoringState, showScoring);

  return {
    handleCanvasMouseDown,
    handleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
    toggleObjective,
  };
}
