import { atom } from "jotai";

// Define the position interface
export interface NamedPosition {
  id: string;
  name: string;
  x: number; // X coordinate in mm (center of rotation)
  y: number; // Y coordinate in mm (center of rotation)
  heading: number; // Heading in degrees
  isDefault: boolean; // True for bottom left and bottom right
  isCustom: boolean; // True for user-created positions
}

// Edge-based position interface for the form
export interface EdgeBasedPosition {
  side: "left" | "right";
  fromBottom: number; // mm from bottom edge
  fromSide: number; // mm from side edge
  heading: number; // degrees
}

// Default edge-based positions that will be converted to center-of-rotation coordinates
export const DEFAULT_EDGE_POSITIONS: { [key: string]: EdgeBasedPosition } = {
  "bottom-left": {
    side: "left",
    fromBottom: 0,
    fromSide: 0,
    heading: 0,
  },
  "bottom-right": {
    side: "right",
    fromBottom: 0,
    fromSide: 0,
    heading: 0,
  },
};

// Base atom for all positions (defaults + custom)
// Default positions will be calculated dynamically based on robot config and mat dimensions
export const positionsAtom = atom<NamedPosition[]>([]);

// Derived atom for only custom positions (user-created)
export const customPositionsAtom = atom(
  (get) => get(positionsAtom).filter((pos) => pos.isCustom),
  (get, set, newCustomPositions: NamedPosition[]) => {
    const defaultPositions = get(positionsAtom).filter((pos) => pos.isDefault);
    set(positionsAtom, [...defaultPositions, ...newCustomPositions]);
  },
);

// Selected position atom - defaults to bottom-right
export const selectedPositionIdAtom = atom<string | null>("bottom-right");

// Derived atom for the currently selected position
export const selectedPositionAtom = atom((get) => {
  const selectedId = get(selectedPositionIdAtom);
  if (!selectedId) return null;
  return get(positionsAtom).find((pos) => pos.id === selectedId) || null;
});

// Atom for tracking if position management UI is open
export const isPositionManagementOpenAtom = atom<boolean>(false);

// Atom for tracking if add position dialog is open
export const isAddPositionDialogOpenAtom = atom<boolean>(false);

// Action to add a new custom position
export const addCustomPositionAtom = atom(
  null,
  (
    get,
    set,
    newPosition: Omit<NamedPosition, "id" | "isDefault" | "isCustom">,
  ) => {
    const positions = get(positionsAtom);
    const customPosition: NamedPosition = {
      ...newPosition,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isDefault: false,
      isCustom: true,
    };
    set(positionsAtom, [...positions, customPosition]);
    return customPosition;
  },
);

// Action to remove a custom position (cannot remove default positions)
export const removeCustomPositionAtom = atom(
  null,
  (get, set, positionId: string) => {
    const positions = get(positionsAtom);
    const positionToRemove = positions.find((pos) => pos.id === positionId);

    // Prevent removal of default positions
    if (!positionToRemove || positionToRemove.isDefault) {
      console.warn(
        `Cannot remove position ${positionId}: position is protected or doesn't exist`,
      );
      return false;
    }

    const updatedPositions = positions.filter((pos) => pos.id !== positionId);
    set(positionsAtom, updatedPositions);

    // If the removed position was selected, reset to bottom-right
    const selectedId = get(selectedPositionIdAtom);
    if (selectedId === positionId) {
      set(selectedPositionIdAtom, "bottom-right");
    }

    return true;
  },
);

// Action to update a custom position (cannot edit default positions)
export const updateCustomPositionAtom = atom(
  null,
  (
    get,
    set,
    positionId: string,
    updates: Partial<Omit<NamedPosition, "id" | "isDefault" | "isCustom">>,
  ) => {
    const positions = get(positionsAtom);
    const positionToUpdate = positions.find((pos) => pos.id === positionId);

    // Prevent editing of default positions
    if (!positionToUpdate || positionToUpdate.isDefault) {
      console.warn(
        `Cannot update position ${positionId}: position is protected or doesn't exist`,
      );
      return false;
    }

    const updatedPositions = positions.map((pos) =>
      pos.id === positionId ? { ...pos, ...updates } : pos,
    );
    set(positionsAtom, updatedPositions);
    return true;
  },
);

// Action to update default position coordinates (when mat dimensions change)
const updateDefaultPositionCoordinatesAtom = atom(
  null,
  (get, set, matWidthMm: number, _matHeightMm: number) => {
    const positions = get(positionsAtom);
    const updatedPositions = positions.map((pos) => {
      if (pos.id === "bottom-right") {
        return { ...pos, x: matWidthMm };
      }
      return pos;
    });
    set(positionsAtom, updatedPositions);
  },
);

// Action to reset the position selection to bottom-right
export const clearPositionSelectionAtom = atom(null, (_get, set) => {
  set(selectedPositionIdAtom, "bottom-right");
});
