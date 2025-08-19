import { atom } from "jotai";
import { customMatConfigAtom } from "./gameMat";

// Canvas dimensions and scaling
export const canvasSizeAtom = atom<{ width: number; height: number }>({
  width: 800,
  height: 600,
});
export const canvasScaleAtom = atom<number>(1);

// Mission interaction state
export const hoveredObjectAtom = atom<string | null>(null);
export const hoveredPointAtom = atom<number | null>(null);
export const missionBoundsAtom = atom<
  Map<string, { x: number; y: number; width: number; height: number }>
>(new Map());

// Canvas update trigger
const updateCanvasAtom = atom<number>(0);

// Derived coordinate transformation functions atom
export const coordinateUtilsAtom = atom((get) => {
  const scale = get(canvasScaleAtom);
  const customMatConfig = get(customMatConfigAtom);

  // Default FLL mat dimensions (2024 season)
  const DEFAULT_MAT_WIDTH_MM = 2356;
  const DEFAULT_MAT_HEIGHT_MM = 1137;
  const DEFAULT_TABLE_WIDTH_MM = 2786;
  const DEFAULT_TABLE_HEIGHT_MM = 1140;
  const DEFAULT_BORDER_WALL_THICKNESS_MM = 36;

  // Get mat dimensions from current mat configuration with fallbacks
  const MAT_WIDTH_MM =
    customMatConfig?.dimensions?.widthMm || DEFAULT_MAT_WIDTH_MM;
  const MAT_HEIGHT_MM =
    customMatConfig?.dimensions?.heightMm || DEFAULT_MAT_HEIGHT_MM;
  const TABLE_WIDTH_MM = DEFAULT_TABLE_WIDTH_MM; // Table dimensions are constant
  const TABLE_HEIGHT_MM = DEFAULT_TABLE_HEIGHT_MM; // Table dimensions are constant
  const BORDER_WALL_THICKNESS_MM = DEFAULT_BORDER_WALL_THICKNESS_MM; // Border wall thickness is constant

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
