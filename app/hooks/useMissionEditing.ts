import { useState, useCallback } from "react";
import { useMissionManager } from "./useMissionManager";
import type { MissionPointType, Waypoint, ActionPoint, StartPoint, EndPoint } from "../types/missionPlanner";

type PointPlacementMode = "waypoint" | "action" | "start" | "end" | null;

/**
 * Hook for managing mission editing state and point placement
 */
export function useMissionEditing() {
  const {
    editingMission,
    isEditingMission,
    addPoint,
  } = useMissionManager();

  const [pointPlacementMode, setPointPlacementMode] = useState<PointPlacementMode>(null);
  const [actionPointHeading, setActionPointHeading] = useState(0);
  const [selectedStartEndRef, setSelectedStartEndRef] = useState("");

  // Handle point placement mode changes
  const handleSetPlacementMode = useCallback((mode: PointPlacementMode) => {
    setPointPlacementMode(mode);
    if (!mode) {
      setActionPointHeading(0);
      setSelectedStartEndRef("");
    }
  }, []);

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
    const newPoint = createPoint(x, y);
    if (newPoint) {
      addPoint(newPoint);
      setPointPlacementMode(null);
      return newPoint;
    }
    return null;
  }, [createPoint, addPoint]);

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
    
    // Actions
    setPointPlacementMode: handleSetPlacementMode,
    setActionPointHeading,
    setSelectedStartEndRef,
    handlePointPlacement,
    
    // Utils
    getPreviewData,
  };
}