import { atom } from "jotai";

interface GhostPosition {
  x: number;
  y: number;
  heading: number;
}

// Ghost robot position for telemetry playback
const ghostPositionAtom = atom<GhostPosition | null>(null);

// Ghost robot visibility (whether playback has started)
const ghostVisibilityAtom = atom<boolean>(false);

// Combined atom for easy consumption
export const ghostRobotAtom = atom((get) => {
  const position = get(ghostPositionAtom);
  const isVisible = get(ghostVisibilityAtom);
  
  return {
    position,
    isVisible,
  };
});

// Write-only atom to update both position and visibility
export const updateGhostRobotAtom = atom(
  null,
  (get, set, update: { position: GhostPosition | null; isVisible?: boolean }) => {
    set(ghostPositionAtom, update.position);
    
    // If position is provided, automatically set visibility to true
    // If position is null, use the provided visibility or default to false
    if (update.position !== null) {
      set(ghostVisibilityAtom, update.isVisible ?? true);
    } else {
      set(ghostVisibilityAtom, update.isVisible ?? false);
    }
  }
);

// Write-only atom to hide the ghost robot
export const hideGhostRobotAtom = atom(
  null,
  (get, set) => {
    set(ghostPositionAtom, null);
    set(ghostVisibilityAtom, false);
  }
);