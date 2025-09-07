import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import type { TelemetryPoint } from "../services/telemetryHistory";
import { hoveredObjectAtom } from "../store/atoms/canvasState";
import type { SplinePath } from "../store/atoms/gameMat";
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
import type { RobotPosition } from "../utils/robotPosition";
import { useMissionInteractions } from "./useMissionInteractions";
import { useMissionPointInteractions } from "./useMissionPointInteractions";
import { useSplineInteractions } from "./useSplineInteractions";
import { useTelemetryInteractions } from "./useTelemetryInteractions";

type ScoringState = {
  [objectId: string]: {
    objectives: {
      [objectiveId: string]: {
        completed: boolean;
        points: number;
        selectedChoiceId?: string;
      };
    };
  };
};

interface UseCanvasEventHandlersProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  showScoring: boolean;
  setScoringState: React.Dispatch<React.SetStateAction<ScoringState>>;
  coordinateUtils: {
    mmToCanvas: (x: number, y: number) => { x: number; y: number };
    canvasToMm: (x: number, y: number) => { x: number; y: number };
    scale: number;
    matDimensions: {
      matX: number;
      matY: number;
      matWidthMm: number;
      matHeightMm: number;
      borderWallThickness: number;
      tableWidth: number;
      tableHeight: number;
    };
  };
  // Spline-related props
  currentSplinePath: SplinePath | null;
  isSplinePathMode: boolean;
  justFinishedDragging: boolean;
  addSplinePointAtMousePosition: (x: number, y: number) => string | null;
  setSelectedSplinePointId: (id: string | null) => void;
  updateSplinePoint: (
    pointId: string,
    update: Partial<SplinePath["points"][number]>,
  ) => void;
  updateControlPoint: (
    pointId: string,
    controlType: "before" | "after",
    controlPoint: { x: number; y: number },
  ) => void;
  updateTangencyHandle: (
    pointId: string,
    handle: {
      x: number;
      y: number;
      strength: number;
      isEdited: boolean;
      isTangentDriving: boolean;
    },
  ) => void;
  setHoveredSplinePointId: (id: string | null) => void;
  setHoveredCurvatureHandlePointId: (id: string | null) => void;
  // Telemetry-related props
  setHoveredPoint: (point: TelemetryPoint | null) => void;
  setHoveredPointIndex: (index: number) => void;
  setTooltipPosition: (position: { x: number; y: number } | null) => void;
  setMousePosition: (position: RobotPosition | null) => void;
  invalidate?: () => void;
}

/**
 * Custom hook for handling all canvas event interactions
 */
export function useCanvasEventHandlers({
  canvasRef,
  showScoring,
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
  invalidate,
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
    (event: React.PointerEvent<HTMLCanvasElement>) => {
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
          invalidate?.();
          return;
        }
      }
      invalidate?.();
    },
    [
      canvasRef,
      controlMode,
      coordinateUtils,
      missionPointInteractions,
      invalidate,
    ],
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
        if (handled) {
          invalidate?.();
          return;
        }
      }

      // Handle spline path mode clicks
      if (isSplinePathMode) {
        const handled = splineInteractions.handleSplineClick(canvasX, canvasY);
        if (handled) {
          invalidate?.();
          return;
        }
      }

      // Handle mission clicks
      const missionHandled = handleMissionClick(
        canvasX,
        canvasY,
        showScoring,
        controlMode,
      );
      if (missionHandled) {
        invalidate?.();
        return;
      }
      invalidate?.();
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
      invalidate,
    ],
  );

  // Throttle high-frequency mousemove with requestAnimationFrame
  const rafPendingRef = useRef(false);
  const lastEventRef = useRef<React.MouseEvent<HTMLCanvasElement> | null>(null);

  const flushMouseMove = useCallback(() => {
    const event = lastEventRef.current;
    rafPendingRef.current = false;
    if (!event) return;

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
  }, [
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
  ]);

  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      lastEventRef.current = event;
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(flushMouseMove);
      }
    },
    [flushMouseMove],
  );

  const handleCanvasMouseUp = useCallback(() => {
    // Handle mission point mouse up
    missionPointInteractions.handleMissionMouseUp();

    // Stop all dragging when mouse is released
    stopAllDragging();
    invalidate?.();
  }, [missionPointInteractions, stopAllDragging, invalidate]);

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
    invalidate?.();
  }, [
    setMousePosition,
    setHoveredObject,
    missionPointInteractions,
    stopAllDragging,
    splineInteractions,
    canvasRef,
    handleTelemetryMouseLeave,
    invalidate,
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
