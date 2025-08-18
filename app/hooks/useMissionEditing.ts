import { useState, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useMissionManager } from "./useMissionManager";
import { 
  pointPlacementModeAtom, 
  actionPointHeadingAtom, 
  selectedStartEndRefAtom, 
  insertAfterPointIdAtom 
} from "../store/atoms/missionPlanner";
import type { MissionPointType, Waypoint, ActionPoint, StartPoint, EndPoint } from "../types/missionPlanner";

type PointPlacementMode = "waypoint" | "action" | "start" | "end" | null;

/**
 * Hook for managing mission editing state and point placement
 */
export function useMissionEditing() {
  const {
    editingMission,
    isEditingMission,
    insertPointAfter,
  } = useMissionManager();

  // Use atoms for shared state across components
  const [pointPlacementMode, setPointPlacementMode] = useAtom(pointPlacementModeAtom);
  const [actionPointHeading, setActionPointHeading] = useAtom(actionPointHeadingAtom);
  const [selectedStartEndRef, setSelectedStartEndRef] = useAtom(selectedStartEndRefAtom);
  const [insertAfterPointId, setInsertAfterPointId] = useAtom(insertAfterPointIdAtom);

  // Handle point placement mode changes
  const handleSetPlacementMode = useCallback((mode: PointPlacementMode, afterPointId?: string | null) => {
    console.log("handleSetPlacementMode called:", { mode, afterPointId });
    setPointPlacementMode(mode);
    setInsertAfterPointId(afterPointId || null);
    console.log("Point placement mode set to:", mode);
    if (!mode) {
      setActionPointHeading(0);
      setSelectedStartEndRef("");
      setInsertAfterPointId(null);
    }
  }, [setPointPlacementMode, setInsertAfterPointId, setActionPointHeading, setSelectedStartEndRef]);

  // Create a point at the given position
  const createPoint = useCallback((x: number, y: number): MissionPointType | null => {
    if (!pointPlacementMode || !editingMission) return null;

    const pointId = `point-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    switch (pointPlacementMode) {
      case "waypoint":
        return {
          id: pointId,
          x,
          y,
          type: "waypoint",
        } as Waypoint;

      case "action":
        return {
          id: pointId,
          x,
          y,
          type: "action",
          heading: actionPointHeading,
          actionName: "Action",
          pauseDuration: 1,
        } as ActionPoint;

      case "start":
        if (!selectedStartEndRef) return null;
        return {
          id: pointId,
          x,
          y,
          type: "start",
          heading: 0,
          referenceType: selectedStartEndRef.startsWith("mission") ? "mission" : "position",
          referenceId: selectedStartEndRef,
        } as StartPoint;

      case "end":
        if (!selectedStartEndRef) return null;
        return {
          id: pointId,
          x,
          y,
          type: "end",
          heading: 0,
          referenceType: selectedStartEndRef.startsWith("mission") ? "mission" : "position",
          referenceId: selectedStartEndRef,
        } as EndPoint;

      default:
        return null;
    }
  }, [pointPlacementMode, actionPointHeading, selectedStartEndRef, editingMission]);

  // Handle point placement on canvas click
  const handlePointPlacement = useCallback((x: number, y: number) => {
    console.log("handlePointPlacement called:", { x, y, pointPlacementMode, insertAfterPointId });
    const newPoint = createPoint(x, y);
    console.log("Created point:", newPoint);
    if (newPoint) {
      const result = insertPointAfter(insertAfterPointId, newPoint);
      console.log("Insert result:", result);
      setPointPlacementMode(null);
      setInsertAfterPointId(null);
      return newPoint;
    }
    return null;
  }, [createPoint, insertPointAfter, insertAfterPointId, pointPlacementMode]);

  // Get preview data for rendering
  const getPreviewData = useCallback(() => {
    if (!pointPlacementMode) return null;
    
    return {
      mode: pointPlacementMode,
      heading: pointPlacementMode === "action" ? actionPointHeading : 0,
      needsReference: (pointPlacementMode === "start" || pointPlacementMode === "end") && !selectedStartEndRef,
    };
  }, [pointPlacementMode, actionPointHeading, selectedStartEndRef]);

  return {
    // State
    isEditingMission,
    editingMission,
    pointPlacementMode,
    actionPointHeading,
    selectedStartEndRef,
    insertAfterPointId,
    
    // Actions
    setPointPlacementMode: handleSetPlacementMode,
    setActionPointHeading,
    setSelectedStartEndRef,
    setInsertAfterPointId,
    handlePointPlacement,
    
    // Utils
    getPreviewData,
  };
}