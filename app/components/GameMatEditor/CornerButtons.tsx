import type { Point } from "../../schemas/GameMatConfig";

interface Corners {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

interface CornerButtonsProps {
  corners: Corners;
  currentCorner: keyof Corners | null;
  onSetCurrentCorner: (corner: keyof Corners) => void;
  onResetCorners: () => void;
  onPerformDeSkew: () => void;
  autoDeSkew: boolean;
  onSetAutoDeSkew: (auto: boolean) => void;
  areAllCornersSet: boolean;
  normalizedImageData: string;
}

export function CornerButtons({
  corners,
  currentCorner,
  onSetCurrentCorner,
  onResetCorners,
  onPerformDeSkew,
  autoDeSkew,
  onSetAutoDeSkew,
  areAllCornersSet,
  normalizedImageData,
}: CornerButtonsProps) {
  const cornerNames = [
    "topLeft",
    "topRight",
    "bottomRight",
    "bottomLeft",
  ] as const;

  const isCornerSet = (corner: keyof Corners) => {
    const cornerPoint = corners[corner];
    return (
      (corner === "topLeft" && (cornerPoint.x !== 0 || cornerPoint.y !== 0)) ||
      (corner === "topRight" && (cornerPoint.x !== 1 || cornerPoint.y !== 0)) ||
      (corner === "bottomLeft" &&
        (cornerPoint.x !== 0 || cornerPoint.y !== 1)) ||
      (corner === "bottomRight" && (cornerPoint.x !== 1 || cornerPoint.y !== 1))
    );
  };

  const formatCornerName = (corner: keyof Corners): string => {
    return corner
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  };

  return (
    <div>
      <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
        Set Corner Points
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Click on each corner of the game mat in the image. Use the magnifier for
        pixel-perfect precision.
      </p>

      <div className="space-y-2">
        {cornerNames.map((corner) => (
          <button
            key={corner}
            onClick={() => onSetCurrentCorner(corner)}
            className={`w-full text-left px-3 py-2 rounded ${
              currentCorner === corner
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {formatCornerName(corner)}
            {isCornerSet(corner) ? " ✓" : ""}
          </button>
        ))}
      </div>

      <label className="flex items-center mt-4 mb-2">
        <input
          type="checkbox"
          checked={autoDeSkew}
          onChange={(e) => onSetAutoDeSkew(e.target.checked)}
          className="mr-2"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Auto-apply corrections after setting corners
        </span>
      </label>

      <button
        onClick={onResetCorners}
        className="w-full px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Reset Corners
      </button>

      {areAllCornersSet && !normalizedImageData && (
        <button
          onClick={onPerformDeSkew}
          className="mt-2 w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Apply Corner Corrections
        </button>
      )}
    </div>
  );
}
