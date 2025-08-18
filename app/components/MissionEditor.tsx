import { useState, useEffect, useRef, useCallback } from "react";
import { useAtomValue } from "jotai";
import { useMissionManager } from "../hooks/useMissionManager";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { customMatConfigAtom } from "../store/atoms/gameMat";
import { usePositionManager } from "../hooks/usePositionManager";
import type { MissionPointType, Waypoint, ActionPoint, StartPoint, EndPoint } from "../types/missionPlanner";
import { LEGO_STUD_SIZE_MM } from "../schemas/RobotConfig";

interface MissionEditorProps {
  className?: string;
}

type PointPlacementMode = "waypoint" | "action" | "start" | "end" | null;

/**
 * Mission Editor interface for visual point placement and editing
 */
export function MissionEditor({ className = "" }: MissionEditorProps) {
  const {
    isMissionEditorOpen,
    setIsMissionEditorOpen,
    editingMission,
    saveEditingMission,
    cancelEditingMission,
    addPoint,
    removePoint,
    updatePoint,
    selectedPointId,
    selectPoint,
  } = useMissionManager();

  const { positions } = usePositionManager();
  const robotConfig = useAtomValue(robotConfigAtom);
  const customMatConfig = useAtomValue(customMatConfigAtom);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pointPlacementMode, setPointPlacementMode] = useState<PointPlacementMode>(null);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [actionPointHeading, setActionPointHeading] = useState(0);
  const [selectedStartEndRef, setSelectedStartEndRef] = useState("");

  // Canvas dimensions and scaling
  const canvasWidth = 800;
  const canvasHeight = 400;
  const matWidthMm = customMatConfig?.dimensions?.widthMm || 2356;
  const matHeightMm = customMatConfig?.dimensions?.heightMm || 1137;
  const scaleX = canvasWidth / matWidthMm;
  const scaleY = canvasHeight / matHeightMm;

  // Convert between canvas coordinates and mat coordinates
  const canvasToMat = useCallback((canvasX: number, canvasY: number) => {
    return {
      x: canvasX / scaleX,
      y: canvasY / scaleY,
    };
  }, [scaleX, scaleY]);

  const matToCanvas = useCallback((matX: number, matY: number) => {
    return {
      x: matX * scaleX,
      y: matY * scaleY,
    };
  }, [scaleX, scaleY]);

  // Draw robot ghost preview for action points
  const drawRobotGhost = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, heading: number) => {
    if (!robotConfig) return;

    const robotWidthMm = robotConfig.dimensions.width * LEGO_STUD_SIZE_MM;
    const robotLengthMm = robotConfig.dimensions.length * LEGO_STUD_SIZE_MM;
    const centerOfRotationFromLeftMm = robotConfig.centerOfRotation.distanceFromLeftEdge * LEGO_STUD_SIZE_MM;
    const centerOfRotationFromTopMm = robotConfig.centerOfRotation.distanceFromTop * LEGO_STUD_SIZE_MM;

    // Convert to canvas coordinates
    const robotWidthPx = robotWidthMm * scaleX;
    const robotLengthPx = robotLengthMm * scaleY;
    const centerOffsetX = centerOfRotationFromLeftMm * scaleX;
    const centerOffsetY = centerOfRotationFromTopMm * scaleY;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((heading * Math.PI) / 180);

    // Draw robot outline (semi-transparent)
    ctx.fillStyle = "rgba(59, 130, 246, 0.3)"; // blue-500 with opacity
    ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
    ctx.lineWidth = 2;

    const rectX = -centerOffsetX;
    const rectY = -centerOffsetY;

    ctx.fillRect(rectX, rectY, robotWidthPx, robotLengthPx);
    ctx.strokeRect(rectX, rectY, robotWidthPx, robotLengthPx);

    // Draw heading indicator (arrow)
    ctx.strokeStyle = "rgba(239, 68, 68, 0.8)"; // red-500
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -centerOffsetY);
    ctx.lineTo(0, -centerOffsetY - 20);
    ctx.moveTo(-5, -centerOffsetY - 15);
    ctx.lineTo(0, -centerOffsetY - 20);
    ctx.lineTo(5, -centerOffsetY - 15);
    ctx.stroke();

    // Draw center of rotation point
    ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [robotConfig, scaleX, scaleY]);

  // Draw the canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editingMission) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw mat background
    ctx.fillStyle = "#f3f4f6"; // gray-100
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw mat border
    ctx.strokeStyle = "#374151"; // gray-700
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvasWidth - 2, canvasHeight - 2);

    // Draw grid
    ctx.strokeStyle = "#e5e7eb"; // gray-200
    ctx.lineWidth = 1;
    const gridSpacingMm = 100; // 10cm grid
    const gridSpacingX = gridSpacingMm * scaleX;
    const gridSpacingY = gridSpacingMm * scaleY;

    for (let x = gridSpacingX; x < canvasWidth; x += gridSpacingX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    for (let y = gridSpacingY; y < canvasHeight; y += gridSpacingY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // Draw existing points
    editingMission.points.forEach((point) => {
      const canvasPos = matToCanvas(point.x, point.y);
      
      // Point styling based on type
      let color = "#6b7280"; // gray-500
      let size = 6;
      let strokeColor = "#374151"; // gray-700
      
      switch (point.type) {
        case "start":
          color = "#10b981"; // emerald-500
          size = 8;
          break;
        case "end":
          color = "#ef4444"; // red-500
          size = 8;
          break;
        case "waypoint":
          color = "#3b82f6"; // blue-500
          size = 6;
          break;
        case "action":
          color = "#8b5cf6"; // violet-500
          size = 8;
          // Draw robot ghost for action points
          drawRobotGhost(ctx, canvasPos.x, canvasPos.y, (point as ActionPoint).heading);
          break;
      }

      // Highlight selected point
      if (selectedPointId === point.id) {
        ctx.strokeStyle = "#fbbf24"; // amber-400
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, size + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw point
      ctx.fillStyle = color;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw point label
      ctx.fillStyle = "#111827"; // gray-900
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        point.type.charAt(0).toUpperCase() + point.type.slice(1),
        canvasPos.x,
        canvasPos.y - size - 8
      );
    });

    // Draw preview point
    if (previewPoint) {
      ctx.fillStyle = "rgba(156, 163, 175, 0.7)"; // gray-400 with opacity
      ctx.strokeStyle = "#374151";
      ctx.lineWidth = 2;
      
      if (pointPlacementMode === "action") {
        drawRobotGhost(ctx, previewPoint.x, previewPoint.y, actionPointHeading);
      }
      
      ctx.beginPath();
      ctx.arc(previewPoint.x, previewPoint.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Draw segments (connections between points)
    ctx.strokeStyle = "#9ca3af"; // gray-400
    ctx.lineWidth = 2;
    editingMission.segments.forEach((segment) => {
      const fromPos = matToCanvas(segment.fromPoint.x, segment.fromPoint.y);
      const toPos = matToCanvas(segment.toPoint.x, segment.toPoint.y);
      
      ctx.beginPath();
      ctx.moveTo(fromPos.x, fromPos.y);
      ctx.lineTo(toPos.x, toPos.y);
      ctx.stroke();
    });
  }, [editingMission, selectedPointId, previewPoint, pointPlacementMode, actionPointHeading, matToCanvas, drawRobotGhost]);

  // Handle canvas mouse events
  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pointPlacementMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    setPreviewPoint({ x: canvasX, y: canvasY });
  }, [pointPlacementMode]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pointPlacementMode || !editingMission) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const matPos = canvasToMat(canvasX, canvasY);

    // Create new point based on mode
    let newPoint: MissionPointType;
    const pointId = `point-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    switch (pointPlacementMode) {
      case "waypoint":
        newPoint = {
          id: pointId,
          x: matPos.x,
          y: matPos.y,
          type: "waypoint",
        } as Waypoint;
        break;

      case "action":
        newPoint = {
          id: pointId,
          x: matPos.x,
          y: matPos.y,
          type: "action",
          heading: actionPointHeading,
          actionName: "Action",
          pauseDuration: 1,
        } as ActionPoint;
        break;

      case "start":
        newPoint = {
          id: pointId,
          x: matPos.x,
          y: matPos.y,
          type: "start",
          heading: 0,
          referenceType: selectedStartEndRef.startsWith("mission") ? "mission" : "position",
          referenceId: selectedStartEndRef,
        } as StartPoint;
        break;

      case "end":
        newPoint = {
          id: pointId,
          x: matPos.x,
          y: matPos.y,
          type: "end",
          heading: 0,
          referenceType: selectedStartEndRef.startsWith("mission") ? "mission" : "position",
          referenceId: selectedStartEndRef,
        } as EndPoint;
        break;

      default:
        return;
    }

    addPoint(newPoint);
    setPointPlacementMode(null);
    setPreviewPoint(null);
  }, [pointPlacementMode, editingMission, canvasToMat, actionPointHeading, selectedStartEndRef, addPoint]);

  // Redraw canvas when dependencies change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  if (!isMissionEditorOpen || !editingMission) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Mission Editor: {editingMission.name}
          </h3>
          <button
            onClick={cancelEditingMission}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-6">
          {/* Canvas Area */}
          <div className="flex-1">
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="cursor-crosshair"
                onMouseMove={handleCanvasMouseMove}
                onClick={handleCanvasClick}
                onMouseLeave={() => setPreviewPoint(null)}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Click to place points • Grid: 10cm spacing
            </p>
          </div>

          {/* Controls Panel */}
          <div className="w-64 space-y-4">
            {/* Point Placement Tools */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Add Points
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPointPlacementMode("waypoint")}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    pointPlacementMode === "waypoint"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
                  }`}
                >
                  📍 Waypoint
                </button>
                <button
                  onClick={() => setPointPlacementMode("action")}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    pointPlacementMode === "action"
                      ? "bg-violet-500 text-white"
                      : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
                  }`}
                >
                  🎯 Action
                </button>
                <button
                  onClick={() => setPointPlacementMode("start")}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    pointPlacementMode === "start"
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
                  }`}
                >
                  🏁 Start
                </button>
                <button
                  onClick={() => setPointPlacementMode("end")}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    pointPlacementMode === "end"
                      ? "bg-red-500 text-white"
                      : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
                  }`}
                >
                  🏁 End
                </button>
              </div>
            </div>

            {/* Action Point Configuration */}
            {pointPlacementMode === "action" && (
              <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg">
                <h5 className="text-xs font-medium text-violet-900 dark:text-violet-100 mb-2">
                  Action Point Settings
                </h5>
                <div>
                  <label className="block text-xs text-violet-700 dark:text-violet-300 mb-1">
                    Heading: {actionPointHeading}°
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="359"
                    value={actionPointHeading}
                    onChange={(e) => setActionPointHeading(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-violet-600 dark:text-violet-400 mt-1">
                    <span>0° (North)</span>
                    <span>180° (South)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Start/End Point Reference Selection */}
            {(pointPlacementMode === "start" || pointPlacementMode === "end") && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h5 className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Reference Position
                </h5>
                <select
                  value={selectedStartEndRef}
                  onChange={(e) => setSelectedStartEndRef(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700"
                >
                  <option value="">Select reference...</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      📍 {pos.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Mission Points List */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Points ({editingMission.points.length})
              </h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {editingMission.points.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    No points added yet
                  </p>
                ) : (
                  editingMission.points.map((point) => (
                    <div
                      key={point.id}
                      className={`flex items-center justify-between p-2 text-xs rounded cursor-pointer ${
                        selectedPointId === point.id
                          ? "bg-amber-100 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700"
                          : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                      onClick={() => selectPoint(point.id)}
                    >
                      <span className="truncate">
                        {point.type.charAt(0).toUpperCase() + point.type.slice(1)}
                        {point.type === "action" && ` (${(point as ActionPoint).heading}°)`}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePoint(point.id);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={saveEditingMission}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                💾 Save Mission
              </button>
              <button
                onClick={cancelEditingMission}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                ✖️ Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}