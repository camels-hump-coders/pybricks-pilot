import { useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  isDraggingMissionPointAtom,
  draggedMissionPointIdAtom,
  missionPointDragOffsetAtom,
} from "../store/atoms/matUIState";
import { useMissionManager } from "./useMissionManager";
import { useMissionEditing } from "./useMissionEditing";
import type { MissionPointType } from "../types/missionPlanner";

/**
 * Hook for handling mission point interactions including drag-and-drop
 */
export function useMissionPointInteractions() {
  const { editingMission, updatePoint, selectPoint } = useMissionManager();
  const { pointPlacementMode, handlePointPlacement } = useMissionEditing();
  
  // Dragging state
  const [isDraggingMissionPoint, setIsDraggingMissionPoint] = useAtom(isDraggingMissionPointAtom);
  const [draggedMissionPointId, setDraggedMissionPointId] = useAtom(draggedMissionPointIdAtom);
  const [dragOffset, setDragOffset] = useAtom(missionPointDragOffsetAtom);
  
  // Find a mission point at the given canvas position
  const findMissionPointAtPosition = useCallback((
    canvasX: number,
    canvasY: number,
    coordinateUtils: any
  ): MissionPointType | null => {
    if (!editingMission) return null;
    
    const clickRadius = 15; // Pixels
    
    for (const point of editingMission.points) {
      // Skip start/end points as they don't have x,y coordinates
      if (point.type === "start" || point.type === "end") continue;
      
      // Get the canvas position of the point
      const pointCanvasPos = coordinateUtils.mmToCanvas(
        (point as any).x,
        (point as any).y
      );
      
      const dx = canvasX - pointCanvasPos.x;
      const dy = canvasY - pointCanvasPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= clickRadius) {
        return point;
      }
    }
    
    return null;
  }, [editingMission]);
  
  // Handle mouse down - start dragging or place new point
  const handleMissionMouseDown = useCallback((
    canvasX: number,
    canvasY: number,
    coordinateUtils: any
  ): boolean => {
    // If we're in point placement mode, don't handle dragging
    if (pointPlacementMode) {
      return false;
    }
    
    // Check if we're clicking on an existing mission point
    const clickedPoint = findMissionPointAtPosition(canvasX, canvasY, coordinateUtils);
    if (clickedPoint && (clickedPoint.type === "waypoint" || clickedPoint.type === "action")) {
      // Start dragging
      setIsDraggingMissionPoint(true);
      setDraggedMissionPointId(clickedPoint.id);
      selectPoint(clickedPoint.id);
      
      // Calculate offset from point center to mouse position
      const pointCanvasPos = coordinateUtils.mmToCanvas(
        (clickedPoint as any).x,
        (clickedPoint as any).y
      );
      setDragOffset({
        x: canvasX - pointCanvasPos.x,
        y: canvasY - pointCanvasPos.y,
      });
      
      return true; // Click was handled
    }
    
    return false;
  }, [pointPlacementMode, findMissionPointAtPosition, selectPoint, setIsDraggingMissionPoint, setDraggedMissionPointId, setDragOffset]);
  
  // Handle mouse move - update dragged point position
  const handleMissionMouseMove = useCallback((
    canvasX: number,
    canvasY: number,
    coordinateUtils: any,
    canvasRef: React.RefObject<HTMLCanvasElement | null>
  ): void => {
    if (isDraggingMissionPoint && draggedMissionPointId && editingMission) {
      // Update the point position
      const newMatPos = coordinateUtils.canvasToMm(
        canvasX - dragOffset.x,
        canvasY - dragOffset.y
      );
      
      const pointToUpdate = editingMission.points.find(p => p.id === draggedMissionPointId);
      if (pointToUpdate && (pointToUpdate.type === "waypoint" || pointToUpdate.type === "action")) {
        updatePoint(draggedMissionPointId, {
          ...pointToUpdate,
          x: newMatPos.x,
          y: newMatPos.y,
        });
      }
    } else if (!pointPlacementMode && canvasRef.current) {
      // Show grab cursor when hovering over draggable points
      const hoveredPoint = findMissionPointAtPosition(canvasX, canvasY, coordinateUtils);
      if (hoveredPoint && (hoveredPoint.type === "waypoint" || hoveredPoint.type === "action")) {
        canvasRef.current.style.cursor = 'grab';
      } else {
        canvasRef.current.style.cursor = 'default';
      }
    }
  }, [isDraggingMissionPoint, draggedMissionPointId, dragOffset, editingMission, pointPlacementMode, findMissionPointAtPosition, updatePoint]);
  
  // Handle mouse up - stop dragging
  const handleMissionMouseUp = useCallback((): void => {
    if (isDraggingMissionPoint) {
      setIsDraggingMissionPoint(false);
      setDraggedMissionPointId(null);
      setDragOffset({ x: 0, y: 0 });
    }
  }, [isDraggingMissionPoint, setIsDraggingMissionPoint, setDraggedMissionPointId, setDragOffset]);
  
  // Handle mouse leave - cancel dragging
  const handleMissionMouseLeave = useCallback((
    canvasRef: React.RefObject<HTMLCanvasElement | null>
  ): void => {
    if (isDraggingMissionPoint) {
      setIsDraggingMissionPoint(false);
      setDraggedMissionPointId(null);
      setDragOffset({ x: 0, y: 0 });
    }
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
  }, [isDraggingMissionPoint, setIsDraggingMissionPoint, setDraggedMissionPointId, setDragOffset]);
  
  // Handle click - for point placement
  const handleMissionClick = useCallback((
    canvasX: number,
    canvasY: number,
    coordinateUtils: any
  ): boolean => {
    // If we're in point placement mode, handle the placement
    if (pointPlacementMode) {
      const matPos = coordinateUtils.canvasToMm(canvasX, canvasY);
      const newPoint = handlePointPlacement(matPos.x, matPos.y);
      return !!newPoint;
    }
    
    return false;
  }, [pointPlacementMode, handlePointPlacement]);
  
  return {
    // State
    isDraggingMissionPoint,
    draggedMissionPointId,
    
    // Handlers
    handleMissionMouseDown,
    handleMissionMouseMove,
    handleMissionMouseUp,
    handleMissionMouseLeave,
    handleMissionClick,
    
    // Utils
    findMissionPointAtPosition,
  };
}