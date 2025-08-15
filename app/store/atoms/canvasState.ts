import { atom } from "jotai";

// Canvas dimensions and scaling
export const canvasSizeAtom = atom<{ width: number; height: number }>({ width: 800, height: 600 });
export const canvasScaleAtom = atom<number>(1);

// Mission interaction state
export const hoveredObjectAtom = atom<string | null>(null);
export const hoveredPointAtom = atom<number | null>(null);
export const missionBoundsAtom = atom<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());

// Canvas update trigger
export const updateCanvasAtom = atom<number>(0);

// Derived coordinate transformation functions atom
export const coordinateUtilsAtom = atom((get) => {
  const canvasSize = get(canvasSizeAtom);
  const scale = get(canvasScaleAtom);
  
  // Mat dimensions constants
  const MAT_WIDTH_MM = 2356;
  const MAT_HEIGHT_MM = 1137;
  const TABLE_WIDTH_MM = 2786;
  const TABLE_HEIGHT_MM = 1140;
  const BORDER_WALL_THICKNESS_MM = 36;

  const matOffset = BORDER_WALL_THICKNESS_MM * scale;
  const matX = matOffset + (TABLE_WIDTH_MM * scale - MAT_WIDTH_MM * scale) / 2;
  const matY = matOffset + (TABLE_HEIGHT_MM * scale - MAT_HEIGHT_MM * scale);

  const mmToCanvas = (x: number, y: number) => ({
    x: matX + x * scale,
    y: matY + y * scale,
  });

  const canvasToMm = (canvasX: number, canvasY: number) => ({
    x: (canvasX - matX) / scale,
    y: (canvasY - matY) / scale,
  });

  return {
    mmToCanvas,
    canvasToMm,
    scale,
    matDimensions: {
      matX,
      matY,
      matWidthMm: MAT_WIDTH_MM,
      matHeightMm: MAT_HEIGHT_MM,
      borderWallThickness: BORDER_WALL_THICKNESS_MM,
      tableWidth: TABLE_WIDTH_MM,
      tableHeight: TABLE_HEIGHT_MM,
    },
  };
});

// Actions for canvas state
export const setCanvasSizeAtom = atom(
  null,
  (get, set, size: { width: number; height: number }) => {
    set(canvasSizeAtom, size);
  }
);

export const setCanvasScaleAtom = atom(
  null,
  (get, set, scale: number) => {
    set(canvasScaleAtom, scale);
  }
);

export const setHoveredObjectAtom = atom(
  null,
  (get, set, objectId: string | null) => {
    set(hoveredObjectAtom, objectId);
  }
);

export const setHoveredPointAtom = atom(
  null,
  (get, set, pointIndex: number | null) => {
    set(hoveredPointAtom, pointIndex);
  }
);

export const setMissionBoundsAtom = atom(
  null,
  (get, set, bounds: Map<string, { x: number; y: number; width: number; height: number }>) => {
    set(missionBoundsAtom, bounds);
  }
);

export const triggerCanvasUpdateAtom = atom(
  null,
  (get, set) => {
    set(updateCanvasAtom, Date.now());
  }
);