import { atom } from "jotai";
import { type TelemetryPoint } from "../../services/telemetryHistory";

// ============================================
// UI State Atoms
// ============================================

// Mission popover state
export const popoverObjectAtom = atom<string | null>(null);

// Accordion expansion states
export const missionsExpandedAtom = atom<boolean>(false);
export const isPseudoCodeExpandedAtom = atom<boolean>(true);
export const isTelemetryPlaybackExpandedAtom = atom<boolean>(true);

// ============================================
// Canvas Interaction State Atoms
// ============================================

// Telemetry point hover state
export const hoveredTelemetryPointAtom = atom<TelemetryPoint | null>(null);
export const tooltipPositionAtom = atom<{ x: number; y: number } | null>(null);

// Spline point dragging state
export const isDraggingPointAtom = atom<boolean>(false);
export const draggedPointIdAtom = atom<string | null>(null);
export const justFinishedDraggingAtom = atom<boolean>(false);

// Mission point dragging state
export const isDraggingMissionPointAtom = atom<boolean>(false);
export const draggedMissionPointIdAtom = atom<string | null>(null);
export const missionPointDragOffsetAtom = atom<{ x: number; y: number }>({ x: 0, y: 0 });

// Control point dragging state
export const isDraggingControlPointAtom = atom<boolean>(false);
export const draggedControlPointAtom = atom<{
  pointId: string;
  controlType: "before" | "after";
} | null>(null);

// Tangency handle dragging state
export const isDraggingTangencyHandleAtom = atom<boolean>(false);
export const draggedTangencyHandleAtom = atom<{
  pointId: string;
  gripType: "diamond" | "arrow" | "endpoint";
  initialHandle: {
    x: number;
    y: number;
    strength: number;
    isEdited: boolean;
    isTangentDriving: boolean;
  };
  initialMousePos: { x: number; y: number };
} | null>(null);

// ============================================
// Action Atoms (setters)
// ============================================

// UI State Actions
export const setPopoverObjectAtom = atom(
  null,
  (get, set, objectId: string | null) => {
    set(popoverObjectAtom, objectId);
  }
);

export const toggleMissionsExpandedAtom = atom(
  null,
  (get, set) => {
    set(missionsExpandedAtom, !get(missionsExpandedAtom));
  }
);

export const setPseudoCodeExpandedAtom = atom(
  null,
  (get, set, expanded: boolean) => {
    set(isPseudoCodeExpandedAtom, expanded);
  }
);

export const setTelemetryPlaybackExpandedAtom = atom(
  null,
  (get, set, expanded: boolean) => {
    set(isTelemetryPlaybackExpandedAtom, expanded);
  }
);

// Canvas Interaction Actions
export const setHoveredTelemetryPointAtom = atom(
  null,
  (get, set, point: TelemetryPoint | null) => {
    set(hoveredTelemetryPointAtom, point);
  }
);

export const setTooltipPositionAtom = atom(
  null,
  (get, set, position: { x: number; y: number } | null) => {
    set(tooltipPositionAtom, position);
  }
);

// Spline dragging actions
export const startDraggingPointAtom = atom(
  null,
  (get, set, pointId: string) => {
    set(isDraggingPointAtom, true);
    set(draggedPointIdAtom, pointId);
  }
);

export const stopDraggingPointAtom = atom(
  null,
  (get, set) => {
    const wasDragging = get(isDraggingPointAtom);
    set(isDraggingPointAtom, false);
    set(draggedPointIdAtom, null);
    if (wasDragging) {
      set(justFinishedDraggingAtom, true);
      // Clear the flag after a short delay
      setTimeout(() => set(justFinishedDraggingAtom, false), 100);
    }
  }
);

// Control point dragging actions
export const startDraggingControlPointAtom = atom(
  null,
  (get, set, pointId: string, controlType: "before" | "after") => {
    set(isDraggingControlPointAtom, true);
    set(draggedControlPointAtom, { pointId, controlType });
  }
);

export const stopDraggingControlPointAtom = atom(
  null,
  (get, set) => {
    const wasDragging = get(isDraggingControlPointAtom);
    set(isDraggingControlPointAtom, false);
    set(draggedControlPointAtom, null);
    if (wasDragging) {
      set(justFinishedDraggingAtom, true);
      // Clear the flag after a short delay
      setTimeout(() => set(justFinishedDraggingAtom, false), 100);
    }
  }
);

// Tangency handle dragging actions
export const startDraggingTangencyHandleAtom = atom(
  null,
  (get, set, handle: {
    pointId: string;
    gripType: "diamond" | "arrow" | "endpoint";
    initialHandle: {
      x: number;
      y: number;
      strength: number;
      isEdited: boolean;
      isTangentDriving: boolean;
    };
    initialMousePos: { x: number; y: number };
  }) => {
    set(isDraggingTangencyHandleAtom, true);
    set(draggedTangencyHandleAtom, handle);
  }
);

export const stopDraggingTangencyHandleAtom = atom(
  null,
  (get, set) => {
    const wasDragging = get(isDraggingTangencyHandleAtom);
    set(isDraggingTangencyHandleAtom, false);
    set(draggedTangencyHandleAtom, null);
    if (wasDragging) {
      set(justFinishedDraggingAtom, true);
      // Clear the flag after a short delay
      setTimeout(() => set(justFinishedDraggingAtom, false), 100);
    }
  }
);

// Combined stop all dragging action
export const stopAllDraggingAtom = atom(
  null,
  (get, set) => {
    const wasDragging = get(isDraggingPointAtom) || 
                       get(isDraggingControlPointAtom) || 
                       get(isDraggingTangencyHandleAtom) ||
                       get(isDraggingMissionPointAtom);
    
    set(isDraggingPointAtom, false);
    set(draggedPointIdAtom, null);
    set(isDraggingControlPointAtom, false);
    set(draggedControlPointAtom, null);
    set(isDraggingTangencyHandleAtom, false);
    set(draggedTangencyHandleAtom, null);
    set(isDraggingMissionPointAtom, false);
    set(draggedMissionPointIdAtom, null);
    set(missionPointDragOffsetAtom, { x: 0, y: 0 });
    
    if (wasDragging) {
      set(justFinishedDraggingAtom, true);
      // Clear the flag after a short delay
      setTimeout(() => set(justFinishedDraggingAtom, false), 100);
    }
  }
);