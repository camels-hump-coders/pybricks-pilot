import type { Mission, MissionObjective, Point } from "../../schemas/GameMatConfig";
import { CornerButtons } from "./CornerButtons";
import { CalibrationPanel } from "./CalibrationPanel";
import { ObjectsPanel } from "./ObjectsPanel";
import { PreviewPanel } from "./PreviewPanel";

interface Corners {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

interface CalibrationPoints {
  xAxis: { first: Point | null; second: Point | null };
  yAxis: { first: Point | null; second: Point | null };
}

interface CurrentCalibrationPoint {
  axis: "xAxis" | "yAxis";
  point: "first" | "second";
}

interface SidePanelProps {
  mode: "upload" | "corners" | "calibration" | "objects" | "preview";
  // Corner props
  corners: Corners;
  currentCorner: keyof Corners | null;
  autoDeSkew: boolean;
  normalizedImageData: string;
  onSetCurrentCorner: (corner: keyof Corners) => void;
  onResetCorners: () => void;
  onPerformDeSkew: () => void;
  onSetAutoDeSkew: (auto: boolean) => void;
  areAllCornersSet: boolean;
  // Calibration props
  calibrationPoints: CalibrationPoints;
  currentCalibrationPoint: CurrentCalibrationPoint | null;
  calculatedDimensions: { widthMm: number; heightMm: number } | null;
  onSetCurrentCalibrationPoint: (point: CurrentCalibrationPoint) => void;
  onCalibrationComplete: () => void;
  onResetCalibration: () => void;
  // Objects props
  missions: Mission[];
  selectedObject: string | null;
  placingObject: boolean;
  onSetPlacingObject: (placing: boolean) => void;
  onSetSelectedObject: (objectId: string | null) => void;
  onUpdateObject: (updates: Partial<Mission>) => void;
  onDeleteObject: () => void;
  onAddObjective: () => void;
  onRemoveObjective: (objectiveId: string) => void;
  onUpdateObjective: (objectiveId: string, updates: Partial<MissionObjective>) => void;
  // Preview props
  matName: string;
  onSave: () => void;
  onExportTar: () => void;
  MAT_WIDTH_MM: number;
  MAT_HEIGHT_MM: number;
}

export function SidePanel({
  mode,
  // Corner props
  corners,
  currentCorner,
  autoDeSkew,
  normalizedImageData,
  onSetCurrentCorner,
  onResetCorners,
  onPerformDeSkew,
  onSetAutoDeSkew,
  areAllCornersSet,
  // Calibration props
  calibrationPoints,
  currentCalibrationPoint,
  calculatedDimensions,
  onSetCurrentCalibrationPoint,
  onCalibrationComplete,
  onResetCalibration,
  // Objects props
  missions,
  selectedObject,
  placingObject,
  onSetPlacingObject,
  onSetSelectedObject,
  onUpdateObject,
  onDeleteObject,
  onAddObjective,
  onRemoveObjective,
  onUpdateObjective,
  // Preview props
  matName,
  onSave,
  onExportTar,
  MAT_WIDTH_MM,
  MAT_HEIGHT_MM,
}: SidePanelProps) {
  const renderPanelContent = () => {
    switch (mode) {
      case "corners":
        return (
          <CornerButtons
            corners={corners}
            currentCorner={currentCorner}
            onSetCurrentCorner={onSetCurrentCorner}
            onResetCorners={onResetCorners}
            onPerformDeSkew={onPerformDeSkew}
            autoDeSkew={autoDeSkew}
            onSetAutoDeSkew={onSetAutoDeSkew}
            areAllCornersSet={areAllCornersSet}
            normalizedImageData={normalizedImageData}
          />
        );

      case "calibration":
        return (
          <CalibrationPanel
            calibrationPoints={calibrationPoints}
            currentCalibrationPoint={currentCalibrationPoint}
            calculatedDimensions={calculatedDimensions}
            onSetCurrentCalibrationPoint={onSetCurrentCalibrationPoint}
            onCalibrationComplete={onCalibrationComplete}
            onResetCalibration={onResetCalibration}
          />
        );

      case "objects":
        return (
          <ObjectsPanel
            missions={missions}
            selectedObject={selectedObject}
            placingObject={placingObject}
            onSetPlacingObject={onSetPlacingObject}
            onSetSelectedObject={onSetSelectedObject}
            onUpdateObject={onUpdateObject}
            onDeleteObject={onDeleteObject}
            onAddObjective={onAddObjective}
            onRemoveObjective={onRemoveObjective}
            onUpdateObjective={onUpdateObjective}
          />
        );

      case "preview":
        return (
          <PreviewPanel
            matName={matName}
            calculatedDimensions={calculatedDimensions}
            missions={missions}
            onSave={onSave}
            onExportTar={onExportTar}
            MAT_WIDTH_MM={MAT_WIDTH_MM}
            MAT_HEIGHT_MM={MAT_HEIGHT_MM}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-80 p-4 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
      {renderPanelContent()}
    </div>
  );
}