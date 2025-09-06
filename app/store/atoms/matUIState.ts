import { atom } from "jotai";
import type { TelemetryPoint } from "../../services/telemetryHistory";

// ============================================
// UI State Atoms
// ============================================

// Mission popover state
export const popoverObjectAtom = atom<string | null>(null);

// Accordion expansion states
export const missionsExpandedAtom = atom<boolean>(false);
export const isPseudoCodeExpandedAtom = atom<boolean>(true);
export const isTelemetryPlaybackExpandedAtom = atom<boolean>(false);

// Global UI toggles
export const showScoringAtom = atom<boolean>(false);
export const showMapSelectorAtom = atom<boolean>(false);
export const showMatEditorAtom = atom<boolean>(false);
export const matEditorModeAtom = atom<"edit" | "new">("edit");
export const isMatConfigLoadingAtom = atom<boolean>(true);

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
export const missionPointDragOffsetAtom = atom<{ x: number; y: number }>({
  x: 0,
  y: 0,
});

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

// Combined stop all dragging action
export const stopAllDraggingAtom = atom(null, (get, set) => {
  const wasDragging =
    get(isDraggingPointAtom) ||
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
});
