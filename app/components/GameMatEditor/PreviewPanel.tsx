import type { Mission } from "../../schemas/GameMatConfig";

interface PreviewPanelProps {
  matName: string;
  calculatedDimensions: { widthMm: number; heightMm: number } | null;
  missions: Mission[];
  onSave: () => void;
  onExportTar: () => void;
  MAT_WIDTH_MM: number;
  MAT_HEIGHT_MM: number;
}

export function PreviewPanel({
  matName,
  calculatedDimensions,
  missions,
  onSave,
  onExportTar,
  MAT_WIDTH_MM,
  MAT_HEIGHT_MM,
}: PreviewPanelProps) {
  const totalPossiblePoints = missions.reduce(
    (sum, obj) =>
      sum +
      obj.objectives.reduce(
        (objSum, objective) =>
          objSum +
          (objective.choices?.reduce((cSum, c) => cSum + c.points, 0) || 0),
        0,
      ),
    0,
  );

  return (
    <div>
      <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
        Preview & Save
      </h3>
      <div className="space-y-2 mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Mat Name:</strong> {matName}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Dimensions:</strong>{" "}
          {calculatedDimensions?.widthMm.toFixed(2) || MAT_WIDTH_MM}mm ×{" "}
          {calculatedDimensions?.heightMm.toFixed(2) || MAT_HEIGHT_MM}
          mm
          {calculatedDimensions && " (calculated)"}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Missions:</strong> {missions.length}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Total Possible Points:</strong> {totalPossiblePoints}
        </p>
      </div>
      <div className="space-y-2">
        <button
          onClick={onSave}
          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Save Configuration
        </button>
        <button
          onClick={onExportTar}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          📦 Export Season Pack (.tar)
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Downloads a complete season pack with config.json, mat.png, and
          README.md in a proper directory structure
        </p>
      </div>
    </div>
  );
}
