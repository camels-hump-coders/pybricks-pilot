import { TarWriter } from "@gera2ld/tarjs";
import { useEffect, useRef, useState } from "react";
import type {
  GameMatConfig,
  Mission,
  MissionObjective,
  Point,
} from "../schemas/GameMatConfig";
import { deSkewImage } from "../utils/perspectiveTransform";

// Re-export types for backward compatibility;

interface GameMatEditorProps {
  onSave: (config: GameMatConfig, imageFile?: File) => void;
  onCancel: () => void;
  initialConfig?: GameMatConfig;
}

const MAT_WIDTH_MM = 2356; // Official FLL mat width
const MAT_HEIGHT_MM = 1137; // Official FLL mat height
const MAGNIFIER_SIZE = 150;
const MAGNIFIER_ZOOM = 3;

type EditorMode = "upload" | "corners" | "calibration" | "objects" | "preview";

export function GameMatEditor({
  onSave,
  onCancel,
  initialConfig,
}: GameMatEditorProps) {
  // When editing, start in objects mode if we have an existing image
  const hasExistingImage = initialConfig?.imageUrl || initialConfig?.imageData;
  const [mode, setMode] = useState<EditorMode>(
    hasExistingImage ? "objects" : "upload"
  );
  const [matName, setMatName] = useState(
    initialConfig?.name || "Custom Game Mat"
  );
  const [originalImageData, setOriginalImageData] = useState<string>(
    initialConfig?.originalImageData || initialConfig?.imageUrl || ""
  );
  const [normalizedImageData, setNormalizedImageData] = useState<string>(
    initialConfig?.imageData || initialConfig?.imageUrl || ""
  );
  const [corners, setCorners] = useState<{
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  }>({
    topLeft: { x: 0, y: 0 },
    topRight: { x: 1, y: 0 },
    bottomLeft: { x: 0, y: 1 },
    bottomRight: { x: 1, y: 1 },
  });
  const [missions, setMissions] = useState<Mission[]>(
    initialConfig?.missions || []
  );
  const [currentCorner, setCurrentCorner] = useState<
    keyof typeof corners | null
  >(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [placingObject, setPlacingObject] = useState(false);
  const [draggingObject, setDraggingObject] = useState<string | null>(null);
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [autoDeSkew, setAutoDeSkew] = useState(true); // Auto de-skew after setting corners

  // Add calibration state
  const [calibrationPoints, setCalibrationPoints] = useState<{
    xAxis: { first: Point | null; second: Point | null };
    yAxis: { first: Point | null; second: Point | null };
  }>({
    xAxis: { first: null, second: null },
    yAxis: { first: null, second: null },
  });
  const [currentCalibrationPoint, setCurrentCalibrationPoint] = useState<{
    axis: "xAxis" | "yAxis";
    point: "first" | "second";
  } | null>(null);

  // Add calculated dimensions state
  const [calculatedDimensions, setCalculatedDimensions] = useState<{
    widthMm: number;
    heightMm: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load image when imageData changes
  useEffect(() => {
    const imageToLoad =
      mode === "corners" ? originalImageData : normalizedImageData;
    if (imageToLoad) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        drawCanvas();
      };
      img.src = imageToLoad;
    }
  }, [originalImageData, normalizedImageData, mode]);

  // Initialize from initialConfig if editing
  useEffect(() => {
    if (initialConfig?.imageUrl && !originalImageData && !normalizedImageData) {
      // If we have an imageUrl but no image data, use it for both
      setOriginalImageData(initialConfig.imageUrl);
      setNormalizedImageData(initialConfig.imageUrl);
    }
  }, [initialConfig]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setOriginalImageData(result);
        setNormalizedImageData(""); // Clear normalized until corners are set
        setMode("corners");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImportConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const config = JSON.parse(
            e.target?.result as string
          ) as GameMatConfig;
          if (config.version === "1.0") {
            setMatName(config.name);
            if (config.imageData) {
              setNormalizedImageData(config.imageData);
            }
            if (config.originalImageData || config.imageData) {
              setOriginalImageData(
                config.originalImageData || config.imageData || ""
              );
            }
            if (config.corners) {
              setCorners(config.corners);
            }
            setMissions(config.missions);
            setMode("preview");
          }
        } catch (error) {
          console.error("Failed to import configuration:", error);
        }
      };
      reader.readAsText(file);
    }
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;

    if (!canvas || !ctx || !img) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image to fit canvas
    const scale = Math.min(
      canvas.width / img.width,
      canvas.height / img.height
    );
    const width = img.width * scale;
    const height = img.height * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(img, x, y, width, height);

    // Store transform for later use
    canvas.dataset.imgX = x.toString();
    canvas.dataset.imgY = y.toString();
    canvas.dataset.imgWidth = width.toString();
    canvas.dataset.imgHeight = height.toString();

    // Draw corners if in corners mode
    if (mode === "corners") {
      drawCorners(ctx, x, y, width, height);
      // Draw perspective grid if corners are set
      if (areAllCornersSet()) {
        drawPerspectiveGrid(ctx, x, y, width, height);
      }
    }

    // Draw calibration points if in calibration mode
    if (mode === "calibration") {
      drawCalibrationPoints(ctx, x, y, width, height);
    }

    // Draw scoring objects (only on normalized image)
    if ((mode === "objects" || mode === "preview") && normalizedImageData) {
      drawMissions(ctx, x, y, width, height);
    }
  };

  const areAllCornersSet = () => {
    // Check if all corners have been set (moved from default positions)
    // At least one coordinate should be different from the defaults
    const hasTopLeft = corners.topLeft.x !== 0 || corners.topLeft.y !== 0;
    const hasTopRight = corners.topRight.x !== 1 || corners.topRight.y !== 0;
    const hasBottomLeft =
      corners.bottomLeft.x !== 0 || corners.bottomLeft.y !== 1;
    const hasBottomRight =
      corners.bottomRight.x !== 1 || corners.bottomRight.y !== 1;

    return hasTopLeft && hasTopRight && hasBottomLeft && hasBottomRight;
  };

  const drawCorners = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number
  ) => {
    const cornerLabels = {
      topLeft: "Top Left",
      topRight: "Top Right",
      bottomLeft: "Bottom Left",
      bottomRight: "Bottom Right",
    };

    Object.entries(corners).forEach(([key, point]) => {
      const x = imgX + point.x * imgWidth;
      const y = imgY + point.y * imgHeight;

      // Draw corner marker
      ctx.strokeStyle = currentCorner === key ? "#ff0000" : "#00ff00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw crosshair
      ctx.beginPath();
      ctx.moveTo(x - 15, y);
      ctx.lineTo(x + 15, y);
      ctx.moveTo(x, y - 15);
      ctx.lineTo(x, y + 15);
      ctx.stroke();

      // Draw label
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.font = "14px sans-serif";
      ctx.strokeText(
        cornerLabels[key as keyof typeof cornerLabels],
        x + 10,
        y - 10
      );
      ctx.fillText(
        cornerLabels[key as keyof typeof cornerLabels],
        x + 10,
        y - 10
      );
    });
  };

  const drawPerspectiveGrid = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number
  ) => {
    // Transform corners to canvas coordinates
    const tl = {
      x: imgX + corners.topLeft.x * imgWidth,
      y: imgY + corners.topLeft.y * imgHeight,
    };
    const tr = {
      x: imgX + corners.topRight.x * imgWidth,
      y: imgY + corners.topRight.y * imgHeight,
    };
    const bl = {
      x: imgX + corners.bottomLeft.x * imgWidth,
      y: imgY + corners.bottomLeft.y * imgHeight,
    };
    const br = {
      x: imgX + corners.bottomRight.x * imgWidth,
      y: imgY + corners.bottomRight.y * imgHeight,
    };

    ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
    ctx.lineWidth = 1;

    // Draw border
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();

    // Draw grid lines (10x5 grid)
    for (let i = 1; i < 10; i++) {
      const t = i / 10;

      // Vertical lines
      const topPoint = lerp2D(tl, tr, t);
      const bottomPoint = lerp2D(bl, br, t);
      ctx.beginPath();
      ctx.moveTo(topPoint.x, topPoint.y);
      ctx.lineTo(bottomPoint.x, bottomPoint.y);
      ctx.stroke();
    }

    for (let i = 1; i < 5; i++) {
      const t = i / 5;

      // Horizontal lines
      const leftPoint = lerp2D(tl, bl, t);
      const rightPoint = lerp2D(tr, br, t);
      ctx.beginPath();
      ctx.moveTo(leftPoint.x, leftPoint.y);
      ctx.lineTo(rightPoint.x, rightPoint.y);
      ctx.stroke();
    }
  };

  const drawCalibrationPoints = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number
  ) => {
    // Draw X-axis calibration points
    if (calibrationPoints.xAxis.first) {
      const x1 = imgX + calibrationPoints.xAxis.first.x * imgWidth;
      const y1 = imgY + calibrationPoints.xAxis.first.y * imgHeight;
      drawCalibrationPoint(ctx, x1, y1, "X1", "#ff6b6b");
    }

    if (calibrationPoints.xAxis.second) {
      const x2 = imgX + calibrationPoints.xAxis.second.x * imgWidth;
      const y2 = imgY + calibrationPoints.xAxis.second.y * imgHeight;
      drawCalibrationPoint(ctx, x2, y2, "X2", "#ff6b6b");

      // Draw line between X-axis points
      if (calibrationPoints.xAxis.first) {
        const x1 = imgX + calibrationPoints.xAxis.first.x * imgWidth;
        const y1 = imgY + calibrationPoints.xAxis.first.y * imgHeight;
        ctx.strokeStyle = "#ff6b6b";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw Y-axis calibration points
    if (calibrationPoints.yAxis.first) {
      const x1 = imgX + calibrationPoints.yAxis.first.x * imgWidth;
      const y1 = imgY + calibrationPoints.yAxis.first.y * imgHeight;
      drawCalibrationPoint(ctx, x1, y1, "Y1", "#4ecdc4");
    }

    if (calibrationPoints.yAxis.second) {
      const x2 = imgX + calibrationPoints.yAxis.second.x * imgWidth;
      const y2 = imgY + calibrationPoints.yAxis.second.y * imgHeight;
      drawCalibrationPoint(ctx, x2, y2, "Y2", "#4ecdc4");

      // Draw line between Y-axis points
      if (calibrationPoints.yAxis.first) {
        const x1 = imgX + calibrationPoints.yAxis.first.x * imgWidth;
        const y1 = imgY + calibrationPoints.yAxis.first.y * imgHeight;
        ctx.strokeStyle = "#4ecdc4";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };

  const drawCalibrationPoint = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    color: string
  ) => {
    // Draw point marker
    ctx.fillStyle = color;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Draw crosshair
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y + 15);
    ctx.stroke();

    // Draw label
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.font = "12px sans-serif";
    ctx.strokeText(label, x + 10, y - 10);
    ctx.fillText(label, x + 10, y - 10);
  };

  const drawMissions = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number
  ) => {
    missions.forEach((obj) => {
      // Direct mapping since image is already normalized
      const canvasX = imgX + obj.position.x * imgWidth;
      const canvasY = imgY + obj.position.y * imgHeight;
      const canvasPos = { x: canvasX, y: canvasY };

      const isSelected = selectedObject === obj.id;
      const isDragging = draggingObject === obj.id;
      const isHovered = hoveredObject === obj.id;

      // Draw hover ring if hovered (and not selected)
      if (isHovered && !isSelected && !isDragging) {
        ctx.strokeStyle = "rgba(100, 150, 255, 0.6)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, 15, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw selection ring if selected
      if (isSelected) {
        ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, 15, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw object marker
      const radius = isHovered || isSelected || isDragging ? 12 : 10;
      ctx.fillStyle = isDragging
        ? "rgba(255, 165, 0, 0.9)"
        : isSelected
          ? "rgba(255, 0, 0, 0.8)"
          : isHovered
            ? "rgba(100, 150, 255, 0.9)"
            : "rgba(0, 100, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, radius, 0, 2 * Math.PI);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = isDragging
        ? "#ff8800"
        : isSelected
          ? "#cc0000"
          : isHovered
            ? "#4080ff"
            : "#0066cc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw label
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.font = "12px sans-serif";
      const totalPoints = obj.objectives.reduce(
        (sum, objective) =>
          sum +
          (objective.points ||
            objective.choices.reduce(
              (objSum, choice) => objSum + choice.points,
              0
            )),
        0
      );
      const text = `${obj.name} (${totalPoints}pts)`;
      ctx.strokeText(text, canvasPos.x + 12, canvasPos.y - 5);
      ctx.fillText(text, canvasPos.x + 12, canvasPos.y - 5);
    });
  };

  const lerp2D = (p1: Point, p2: Point, t: number): Point => {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
  };

  const canvasToNormalized = (
    canvasX: number,
    canvasY: number
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const imgX = parseFloat(canvas.dataset.imgX || "0");
    const imgY = parseFloat(canvas.dataset.imgY || "0");
    const imgWidth = parseFloat(canvas.dataset.imgWidth || "0");
    const imgHeight = parseFloat(canvas.dataset.imgHeight || "0");

    // Direct mapping since image is already normalized
    const relX = (canvasX - imgX) / imgWidth;
    const relY = (canvasY - imgY) / imgHeight;

    return {
      x: Math.max(0, Math.min(1, relX)),
      y: Math.max(0, Math.min(1, relY)), // Direct mapping - no flip yet
    };
  };

  // Add function to perform de-skewing
  const performDeSkew = () => {
    if (!originalImageData || !areAllCornersSet()) return;

    const img = new Image();
    img.onload = () => {
      const deSkewedCanvas = deSkewImage(
        img,
        corners,
        MAT_WIDTH_MM,
        MAT_HEIGHT_MM
      );
      const normalizedData = deSkewedCanvas.toDataURL("image/png");
      setNormalizedImageData(normalizedData);
      setMode("calibration"); // Move to calibration instead of objects
    };
    img.src = originalImageData;
  };

  // Add calibration functions
  const calculateDimensionsFromCalibration = () => {
    if (
      !calibrationPoints.xAxis.first ||
      !calibrationPoints.xAxis.second ||
      !calibrationPoints.yAxis.first ||
      !calibrationPoints.yAxis.second
    ) {
      return null;
    }

    // Get canvas scaling information
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const imgWidth = parseFloat(canvas.dataset.imgWidth || "0");
    const imgHeight = parseFloat(canvas.dataset.imgHeight || "0");

    // Get the de-skewed image dimensions
    const img = imageRef.current;
    if (!img) return null;

    // Calculate X axis distance in normalized coordinates (0-1) - only consider X coordinate
    const xDistanceNormalized = Math.abs(
      calibrationPoints.xAxis.second.x - calibrationPoints.xAxis.first.x
    );

    // Calculate Y axis distance in normalized coordinates (0-1) - only consider Y coordinate
    const yDistanceNormalized = Math.abs(
      calibrationPoints.yAxis.second.y - calibrationPoints.yAxis.first.y
    );

    // Convert normalized distances to actual image pixel distances
    const xDistancePixels = xDistanceNormalized * img.width;
    const yDistancePixels = yDistanceNormalized * img.height;

    // Calculate scale factors (image pixels per mm)
    const xScale = xDistancePixels / 100; // 100mm reference
    const yScale = yDistancePixels / 100; // 100mm reference

    // Calculate mat dimensions in mm
    const widthMm = img.width / xScale;
    const heightMm = img.height / yScale;

    return { widthMm, heightMm };
  };

  const handleCalibrationComplete = () => {
    const dimensions = calculateDimensionsFromCalibration();
    if (dimensions) {
      setCalculatedDimensions(dimensions);
      setMode("objects");
    }
  };

  const resetCalibration = () => {
    setCalibrationPoints({
      xAxis: { first: null, second: null },
      yAxis: { first: null, second: null },
    });
    setCurrentCalibrationPoint(null);
    setCalculatedDimensions(null);
  };

  const getObjectAtPosition = (
    x: number,
    y: number,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number
  ): string | null => {
    const clickRadius = 15; // pixels

    for (const obj of missions) {
      const objX = imgX + obj.position.x * imgWidth;
      const objY = imgY + obj.position.y * imgHeight;
      const distance = Math.sqrt(Math.pow(x - objX, 2) + Math.pow(y - objY, 2));

      if (distance <= clickRadius) {
        return obj.id;
      }
    }

    return null;
  };

  const handleCanvasMouseDown = (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "objects") return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const imgX = parseFloat(canvas.dataset.imgX || "0");
    const imgY = parseFloat(canvas.dataset.imgY || "0");
    const imgWidth = parseFloat(canvas.dataset.imgWidth || "0");
    const imgHeight = parseFloat(canvas.dataset.imgHeight || "0");

    // Check if clicking on an existing object
    const clickedObjectId = getObjectAtPosition(
      x,
      y,
      imgX,
      imgY,
      imgWidth,
      imgHeight
    );

    if (clickedObjectId && !placingObject) {
      // Start dragging the object
      setDraggingObject(clickedObjectId);
      setSelectedObject(clickedObjectId);

      // Calculate offset between mouse and object center
      const obj = missions.find((o) => o.id === clickedObjectId);
      if (obj) {
        const objX = imgX + obj.position.x * imgWidth;
        const objY = imgY + obj.position.y * imgHeight;
        setDragOffset({ x: x - objX, y: y - objY });
      }

      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleCanvasMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingObject) {
      setDraggingObject(null);
      setDragOffset({ x: 0, y: 0 });
      // Set a flag to prevent click handler from firing immediately after drag
      setTimeout(() => setHasDragged(false), 10);
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Don't handle clicks if we were just dragging
    if (hasDragged) {
      setHasDragged(false);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const imgX = parseFloat(canvas.dataset.imgX || "0");
    const imgY = parseFloat(canvas.dataset.imgY || "0");
    const imgWidth = parseFloat(canvas.dataset.imgWidth || "0");
    const imgHeight = parseFloat(canvas.dataset.imgHeight || "0");

    if (mode === "corners" && currentCorner) {
      // Set corner position
      const relX = (x - imgX) / imgWidth;
      const relY = (y - imgY) / imgHeight;

      // Update corners and check if this is the last corner
      const cornerOrder: (
        | "topLeft"
        | "topRight"
        | "bottomRight"
        | "bottomLeft"
      )[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
      const currentIndex = cornerOrder.indexOf(currentCorner);
      const isLastCorner = currentIndex === cornerOrder.length - 1;

      // Create the new corners object
      const newCorners = {
        ...corners,
        [currentCorner]: { x: relX, y: relY },
      };

      setCorners(newCorners);

      // Move to next corner or finish
      if (!isLastCorner) {
        setCurrentCorner(cornerOrder[currentIndex + 1]);
      } else {
        setCurrentCorner(null);
        // Don't perform de-skew here - let the user click the button
        // This ensures all state is properly updated
      }
    } else if (mode === "calibration" && currentCalibrationPoint) {
      // Set calibration point position
      const relX = (x - imgX) / imgWidth;
      const relY = (y - imgY) / imgHeight;

      // Update calibration points
      const newCalibrationPoints = {
        ...calibrationPoints,
        [currentCalibrationPoint.axis]: {
          ...calibrationPoints[currentCalibrationPoint.axis],
          [currentCalibrationPoint.point]: { x: relX, y: relY },
        },
      };
      setCalibrationPoints(newCalibrationPoints);
      setCurrentCalibrationPoint(null);
    } else if (mode === "objects") {
      // Check if clicking on an existing object
      const clickedObjectId = getObjectAtPosition(
        x,
        y,
        imgX,
        imgY,
        imgWidth,
        imgHeight
      );

      if (clickedObjectId) {
        // Select the clicked object
        setSelectedObject(clickedObjectId);
      } else if (placingObject) {
        // Add new object at clicked position
        const normalized = canvasToNormalized(x, y);
        if (normalized) {
          const newObject: Mission = {
            id: Date.now().toString(),
            name: "New Mission",
            position: normalized,
            description: "New mission description",
            objectives: [
              {
                id: `${Date.now()}-1`,
                description: "Complete objective",
                choices: [
                  {
                    id: `${Date.now()}-choice-1`,
                    description: "Complete objective",
                    points: 10,
                    type: "primary",
                  },
                ],
                scoringMode: "multi-select",
              },
            ],
          };
          setMissions((prev) => [...prev, newObject]);
          setSelectedObject(newObject.id);
          setPlacingObject(false);
        }
      } else {
        // Deselect if clicking on empty space
        setSelectedObject(null);
      }
    }

    drawCanvas();
  };

  const handleCanvasMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setMousePos({ x, y });
    setShowMagnifier(
      (mode === "corners" && currentCorner !== null) ||
        (mode === "calibration" && currentCalibrationPoint !== null)
    );

    const imgX = parseFloat(canvas.dataset.imgX || "0");
    const imgY = parseFloat(canvas.dataset.imgY || "0");
    const imgWidth = parseFloat(canvas.dataset.imgWidth || "0");
    const imgHeight = parseFloat(canvas.dataset.imgHeight || "0");

    // Handle object dragging
    if (draggingObject && mode === "objects") {
      setHasDragged(true);

      // Calculate new position (accounting for drag offset)
      const newX = (x - dragOffset.x - imgX) / imgWidth;
      const newY = (y - dragOffset.y - imgY) / imgHeight;

      // Clamp to valid range
      const clampedX = Math.max(0, Math.min(1, newX));
      const clampedY = Math.max(0, Math.min(1, newY));

      // Update the object's position
      setMissions((prev) =>
        prev.map((obj) =>
          obj.id === draggingObject
            ? { ...obj, position: { x: clampedX, y: clampedY } }
            : obj
        )
      );

      // Redraw canvas
      drawCanvas();
    } else if (mode === "objects" && !placingObject) {
      // Update hover state when not dragging
      const hoveredObjectId = getObjectAtPosition(
        x,
        y,
        imgX,
        imgY,
        imgWidth,
        imgHeight
      );
      if (hoveredObjectId !== hoveredObject) {
        setHoveredObject(hoveredObjectId);
        drawCanvas(); // Redraw to show/hide hover effects
      }
    }
  };

  const drawMagnifier = () => {
    if (!showMagnifier || !imageRef.current) return null;

    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    return (
      <div
        className="absolute pointer-events-none border-2 border-gray-800 rounded-full overflow-hidden shadow-lg"
        style={{
          left: `${mousePos.x - MAGNIFIER_SIZE / 2}px`,
          top: `${mousePos.y - MAGNIFIER_SIZE / 2}px`,
          width: `${MAGNIFIER_SIZE}px`,
          height: `${MAGNIFIER_SIZE}px`,
        }}
      >
        <canvas
          width={MAGNIFIER_SIZE}
          height={MAGNIFIER_SIZE}
          ref={(magnifierCanvas) => {
            if (magnifierCanvas && imageRef.current) {
              const mCtx = magnifierCanvas.getContext("2d");
              if (mCtx) {
                const imgX = parseFloat(canvas.dataset.imgX || "0");
                const imgY = parseFloat(canvas.dataset.imgY || "0");
                const imgWidth = parseFloat(canvas.dataset.imgWidth || "0");
                const imgHeight = parseFloat(canvas.dataset.imgHeight || "0");

                // Calculate source position on original image
                const sourceX =
                  ((mousePos.x - imgX) / imgWidth) * imageRef.current.width;
                const sourceY =
                  ((mousePos.y - imgY) / imgHeight) * imageRef.current.height;
                const sourceSize = 50; // Size of area to magnify from original image

                // Draw magnified portion
                mCtx.drawImage(
                  imageRef.current,
                  sourceX - sourceSize / 2,
                  sourceY - sourceSize / 2,
                  sourceSize,
                  sourceSize,
                  0,
                  0,
                  MAGNIFIER_SIZE,
                  MAGNIFIER_SIZE
                );

                // Draw crosshair
                mCtx.strokeStyle = "#ff0000";
                mCtx.lineWidth = 1;
                mCtx.beginPath();
                mCtx.moveTo(MAGNIFIER_SIZE / 2, 0);
                mCtx.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE);
                mCtx.moveTo(0, MAGNIFIER_SIZE / 2);
                mCtx.lineTo(MAGNIFIER_SIZE, MAGNIFIER_SIZE / 2);
                mCtx.stroke();
              }
            }
          }}
        />
      </div>
    );
  };

  const updateSelectedObject = (updates: Partial<Mission>) => {
    if (!selectedObject) return;

    setMissions((prev) =>
      prev.map((obj) =>
        obj.id === selectedObject ? { ...obj, ...updates } : obj
      )
    );
  };

  const deleteSelectedObject = () => {
    if (!selectedObject) return;

    setMissions((prev) => prev.filter((obj) => obj.id !== selectedObject));
    setSelectedObject(null);
  };

  const addObjectiveToSelected = () => {
    if (!selectedObject) return;

    const newObjective: MissionObjective = {
      id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      description: "New objective",
      choices: [
        {
          id: `choice_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          description: "Complete objective",
          points: 10,
          type: "primary",
        },
      ],
      scoringMode: "multi-select",
    };

    setMissions((prev) =>
      prev.map((obj) =>
        obj.id === selectedObject
          ? { ...obj, objectives: [...obj.objectives, newObjective] }
          : obj
      )
    );
  };

  const removeObjectiveFromSelected = (objectiveId: string) => {
    if (!selectedObject) return;

    setMissions((prev) =>
      prev.map((obj) =>
        obj.id === selectedObject
          ? {
              ...obj,
              objectives: obj.objectives.filter((o) => o.id !== objectiveId),
            }
          : obj
      )
    );
  };

  const updateObjectiveInSelected = (
    objectiveId: string,
    updates: Partial<MissionObjective>
  ) => {
    if (!selectedObject) return;

    setMissions((prev) =>
      prev.map((obj) =>
        obj.id === selectedObject
          ? {
              ...obj,
              objectives: obj.objectives.map((objective) =>
                objective.id === objectiveId
                  ? { ...objective, ...updates }
                  : objective
              ),
            }
          : obj
      )
    );
  };

  const handleSave = async () => {
    if (!normalizedImageData) {
      alert(
        "Please complete the image processing (corners and calibration) before saving"
      );
      return;
    }

    try {
      // Convert the de-skewed image to a file
      let imageFile: File;

      if (normalizedImageData.startsWith("data:")) {
        // Handle base64 data URLs (uploaded images)
        const base64Data = normalizedImageData.split(",")[1];
        if (!base64Data) {
          throw new Error("Invalid base64 data URL");
        }
        const binaryString = atob(base64Data);
        const imageBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imageBytes[i] = binaryString.charCodeAt(i);
        }

        // Create a blob and then a file
        const blob = new Blob([imageBytes], { type: "image/png" });
        imageFile = new File([blob], "mat.png", { type: "image/png" });
      } else {
        // Handle regular URLs (Vite imports) - fetch the image
        const response = await fetch(normalizedImageData);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const blob = await response.blob();
        imageFile = new File([blob], "mat.png", { type: "image/png" });
      }

      const config: GameMatConfig = {
        version: "1.0",
        name: matName,
        displayName: matName,
        imageUrl: normalizedImageData, // Use the de-skewed image
        missions,
        dimensions: {
          widthMm: calculatedDimensions?.widthMm || MAT_WIDTH_MM,
          heightMm: calculatedDimensions?.heightMm || MAT_HEIGHT_MM,
        },
        createdAt: initialConfig?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Pass both the config and the image file to the save handler
      onSave(config, imageFile);
    } catch (error) {
      console.error("Failed to prepare image for saving:", error);
      alert("Failed to prepare image for saving. Please try again.");
    }
  };

  const handleExportTar = async () => {
    if (!normalizedImageData) {
      alert("Please upload and process an image first");
      return;
    }

    try {
      // Create the config object
      const config: GameMatConfig = {
        version: "1.0",
        name: matName,
        displayName: matName,
        missions,
        dimensions: {
          widthMm: calculatedDimensions?.widthMm || MAT_WIDTH_MM,
          heightMm: calculatedDimensions?.heightMm || MAT_HEIGHT_MM,
        },
        createdAt: initialConfig?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Convert image to binary data - handle both base64 data URLs and regular URLs
      let imageBytes: Uint8Array;

      if (normalizedImageData.startsWith("data:")) {
        // Handle base64 data URLs (uploaded images)
        const base64Data = normalizedImageData.split(",")[1];
        if (!base64Data) {
          throw new Error("Invalid base64 data URL");
        }
        const binaryString = atob(base64Data);
        imageBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imageBytes[i] = binaryString.charCodeAt(i);
        }
      } else {
        // Handle regular URLs (Vite imports) - fetch the image
        const response = await fetch(normalizedImageData);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        imageBytes = new Uint8Array(arrayBuffer);
      }

      // Create config JSON as bytes
      const configJson = JSON.stringify(config, null, 2);
      const configBytes = new TextEncoder().encode(configJson);

      // Create directory name (sanitized)
      const seasonDirName = matName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

      // Create tar archive with proper directory structure
      const tar = new TarWriter();

      // Add config.json to the season directory
      tar.addFile(`${seasonDirName}/config.json`, configBytes, {
        mode: 0o644,
        mtime: Math.floor(Date.now() / 1000),
      });

      // Add mat.png to the season directory
      tar.addFile(`${seasonDirName}/mat.png`, imageBytes, {
        mode: 0o644,
        mtime: Math.floor(Date.now() / 1000),
      });

      // Add a README file with instructions
      const readmeContent = `# ${matName} Season Pack

## Installation Instructions

1. Extract this tar file to your PyBricks Pilot directory:
   \`\`\`bash
   tar -xf ${seasonDirName}.tar -C app/assets/seasons/
   \`\`\`

2. Or manually copy the extracted \`${seasonDirName}/\` directory to:
   \`\`\`
   app/assets/seasons/${seasonDirName}/
   \`\`\`

3. Restart your development server to auto-discover the new season.

## Contents

- \`config.json\` - Season configuration with ${missions.length} missions
- \`mat.png\` - De-skewed game mat image (${calculatedDimensions?.widthMm || MAT_WIDTH_MM}x${calculatedDimensions?.heightMm || MAT_HEIGHT_MM}mm)

## Missions Included

${missions.map((obj, i) => `${i + 1}. **${obj.name}** - ${obj.objectives.length} objective${obj.objectives.length !== 1 ? "s" : ""} (${obj.objectives.reduce((sum, o) => sum + (o.points || o.choices.reduce((choiceSum, choice) => choiceSum + choice.points, 0)), 0)} points)`).join("\\n")}

---
Generated by PyBricks Pilot Game Mat Editor
${new Date().toISOString()}
`;

      const readmeBytes = new TextEncoder().encode(readmeContent);
      tar.addFile(`${seasonDirName}/README.md`, readmeBytes, {
        mode: 0o644,
        mtime: Math.floor(Date.now() / 1000),
      });

      // Get the tar file as a Blob
      const tarBlob = await tar.write();
      const downloadUrl = URL.createObjectURL(tarBlob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${seasonDirName}.tar`;
      link.click();

      URL.revokeObjectURL(downloadUrl);

      alert(
        `✅ Exported ${matName} season pack as ${seasonDirName}.tar\n\nExtract to app/assets/seasons/ and restart your dev server to use.`
      );
    } catch (error) {
      console.error("Export failed:", error);
      alert(
        `❌ Failed to export tar file: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const handleStartFresh = () => {
    setMatName("Custom Game Mat");
    setOriginalImageData("");
    setNormalizedImageData("");
    setCorners({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomLeft: { x: 0, y: 1 },
      bottomRight: { x: 1, y: 1 },
    });
    setCalibrationPoints({
      xAxis: { first: null, second: null },
      yAxis: { first: null, second: null },
    });
    setCurrentCalibrationPoint(null);
    setCalculatedDimensions(null);
    setMissions([]);
    setCurrentCorner(null);
    setSelectedObject(null);
    setPlacingObject(false);
    setMode("upload");
    imageRef.current = null;
    drawCanvas();
  };

  useEffect(() => {
    drawCanvas();
  }, [
    mode,
    corners,
    calibrationPoints,
    missions,
    selectedObject,
    hoveredObject,
    draggingObject,
  ]);

  // Auto de-skew when all corners are set
  useEffect(() => {
    if (
      mode === "corners" &&
      autoDeSkew &&
      areAllCornersSet() &&
      !currentCorner &&
      originalImageData &&
      !normalizedImageData
    ) {
      performDeSkew();
    }
  }, [
    corners,
    currentCorner,
    mode,
    autoDeSkew,
    originalImageData,
    normalizedImageData,
  ]);

  // Reset calibration when starting fresh
  useEffect(() => {
    if (mode === "upload" && !originalImageData) {
      setCalibrationPoints({
        xAxis: { first: null, second: null },
        yAxis: { first: null, second: null },
      });
      setCurrentCalibrationPoint(null);
      setCalculatedDimensions(null);
    }
  }, [mode, originalImageData]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                Game Mat Editor
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {initialConfig
                  ? `Editing: ${initialConfig.name}`
                  : "Creating new mat"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={matName}
                onChange={(e) => setMatName(e.target.value)}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                placeholder="Mat name"
              />
              <button
                onClick={handleStartFresh}
                className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                title="Clear everything and start over"
              >
                🔄 Start Fresh
              </button>
              <button
                onClick={onCancel}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setMode("upload")}
              className={`px-4 py-2 rounded ${mode === "upload" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
            >
              1. Upload Image
            </button>
            <button
              onClick={() => setMode("corners")}
              disabled={!originalImageData}
              className={`px-4 py-2 rounded ${mode === "corners" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"} disabled:opacity-50`}
            >
              2. Set Corners
            </button>
            <button
              onClick={() => setMode("calibration")}
              disabled={!normalizedImageData}
              className={`px-4 py-2 rounded ${mode === "calibration" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"} disabled:opacity-50`}
            >
              3. Calibrate Dimensions
            </button>
            <button
              onClick={() => setMode("objects")}
              disabled={!calculatedDimensions}
              className={`px-4 py-2 rounded ${mode === "objects" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"} disabled:opacity-50`}
            >
              4. Add Objects
            </button>
            <button
              onClick={() => setMode("preview")}
              disabled={!calculatedDimensions}
              className={`px-4 py-2 rounded ${mode === "preview" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"} disabled:opacity-50`}
            >
              5. Preview
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas area */}
          <div className="flex-1 p-4 relative">
            {mode === "upload" ? (
              originalImageData ? (
                // Show existing image with option to replace
                <div className="h-full flex flex-col">
                  <div className="mb-4 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      Current mat image - You can keep this or upload a new one
                    </p>
                    <div className="flex justify-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Replace Image
                      </button>
                      <button
                        onClick={() => setMode("objects")}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        Keep Current Image
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 relative">
                    <canvas
                      ref={canvasRef}
                      width={800}
                      height={600}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                // No image - show upload interface
                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <div className="text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Upload an image of your game mat
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
                    >
                      Choose Image
                    </button>
                    <label className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 cursor-pointer">
                      Import Config
                      <input
                        type="file"
                        accept="application/json"
                        onChange={handleImportConfig}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )
            ) : (
              <div className="relative h-full">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={600}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseUp={handleCanvasMouseUp}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => {
                    setShowMagnifier(false);
                    setHoveredObject(null);
                    if (draggingObject) {
                      setDraggingObject(null);
                      setDragOffset({ x: 0, y: 0 });
                    }
                  }}
                  className={`w-full h-full object-contain ${
                    mode === "objects" && !placingObject
                      ? draggingObject
                        ? "cursor-move"
                        : hoveredObject
                          ? "cursor-pointer"
                          : "cursor-default"
                      : mode === "objects" && placingObject
                        ? "cursor-crosshair"
                        : mode === "corners"
                          ? "cursor-crosshair"
                          : "cursor-default"
                  }`}
                />
                {drawMagnifier()}
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="w-80 p-4 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
            {mode === "corners" && (
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
                  Set Corner Points
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Click on each corner of the game mat in the image. Use the
                  magnifier for pixel-perfect precision.
                </p>
                <div className="space-y-2">
                  {(
                    [
                      "topLeft",
                      "topRight",
                      "bottomRight",
                      "bottomLeft",
                    ] as const
                  ).map((corner) => (
                    <button
                      key={corner}
                      onClick={() => setCurrentCorner(corner)}
                      className={`w-full text-left px-3 py-2 rounded ${
                        currentCorner === corner
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {corner
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (str) => str.toUpperCase())}
                      {(corner === "topLeft" &&
                        (corners.topLeft.x !== 0 || corners.topLeft.y !== 0)) ||
                      (corner === "topRight" &&
                        (corners.topRight.x !== 1 ||
                          corners.topRight.y !== 0)) ||
                      (corner === "bottomLeft" &&
                        (corners.bottomLeft.x !== 0 ||
                          corners.bottomLeft.y !== 1)) ||
                      (corner === "bottomRight" &&
                        (corners.bottomRight.x !== 1 ||
                          corners.bottomRight.y !== 1))
                        ? " ✓"
                        : ""}
                    </button>
                  ))}
                </div>
                <label className="flex items-center mt-4 mb-2">
                  <input
                    type="checkbox"
                    checked={autoDeSkew}
                    onChange={(e) => setAutoDeSkew(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Auto-apply corrections after setting corners
                  </span>
                </label>
                <button
                  onClick={() => {
                    setCorners({
                      topLeft: { x: 0, y: 0 },
                      topRight: { x: 1, y: 0 },
                      bottomLeft: { x: 0, y: 1 },
                      bottomRight: { x: 1, y: 1 },
                    });
                    setCurrentCorner("topLeft");
                    setNormalizedImageData(""); // Clear normalized image when resetting
                  }}
                  className="w-full px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Reset Corners
                </button>
                {areAllCornersSet() && !normalizedImageData && (
                  <button
                    onClick={performDeSkew}
                    className="mt-2 w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Apply Corner Corrections
                  </button>
                )}
              </div>
            )}

            {mode === "calibration" && (
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">
                  Calibrate Mat Dimensions
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Click on two points on the X-axis and two points on the Y-axis
                  that represent 100mm distances. This will allow us to
                  automatically calculate the mat's actual dimensions.
                </p>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      X-Axis (Horizontal) - 100mm reference
                    </h4>
                    <div className="space-y-2">
                      <button
                        onClick={() =>
                          setCurrentCalibrationPoint({
                            axis: "xAxis",
                            point: "first",
                          })
                        }
                        className={`w-full text-left px-3 py-2 rounded ${
                          currentCalibrationPoint?.axis === "xAxis" &&
                          currentCalibrationPoint?.point === "first"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        First Point {calibrationPoints.xAxis.first ? "✓" : ""}
                      </button>
                      <button
                        onClick={() =>
                          setCurrentCalibrationPoint({
                            axis: "xAxis",
                            point: "second",
                          })
                        }
                        className={`w-full text-left px-3 py-2 rounded ${
                          currentCalibrationPoint?.axis === "xAxis" &&
                          currentCalibrationPoint?.point === "second"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        Second Point {calibrationPoints.xAxis.second ? "✓" : ""}
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      Y-Axis (Vertical) - 100mm reference
                    </h4>
                    <div className="space-y-2">
                      <button
                        onClick={() =>
                          setCurrentCalibrationPoint({
                            axis: "yAxis",
                            point: "first",
                          })
                        }
                        className={`w-full text-left px-3 py-2 rounded ${
                          currentCalibrationPoint?.axis === "yAxis" &&
                          currentCalibrationPoint?.point === "first"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        First Point {calibrationPoints.yAxis.first ? "✓" : ""}
                      </button>
                      <button
                        onClick={() =>
                          setCurrentCalibrationPoint({
                            axis: "yAxis",
                            point: "second",
                          })
                        }
                        className={`w-full text-left px-3 py-2 rounded ${
                          currentCalibrationPoint?.axis === "yAxis" &&
                          currentCalibrationPoint?.point === "second"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        Second Point {calibrationPoints.yAxis.second ? "✓" : ""}
                      </button>
                    </div>
                  </div>

                  {currentCalibrationPoint && (
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        Click on the mat to set{" "}
                        {currentCalibrationPoint.axis === "xAxis" ? "X" : "Y"}
                        -axis point{" "}
                        {currentCalibrationPoint.point === "first" ? "1" : "2"}
                      </p>
                    </div>
                  )}

                  {calibrationPoints.xAxis.first &&
                    calibrationPoints.xAxis.second &&
                    calibrationPoints.yAxis.first &&
                    calibrationPoints.yAxis.second && (
                      <div className="space-y-2">
                        <button
                          onClick={handleCalibrationComplete}
                          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          Calculate Dimensions & Continue
                        </button>
                        <button
                          onClick={resetCalibration}
                          className="w-full px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Reset Calibration
                        </button>
                      </div>
                    )}

                  {calculatedDimensions && (
                    <div className="mt-4 p-3 bg-green-100 dark:bg-green-900 rounded">
                      <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                        Calculated Dimensions
                      </h4>
                      <p className="text-sm text-green-700 dark:text-green-200">
                        Width: {calculatedDimensions.widthMm.toFixed(2)}mm
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-200">
                        Height: {calculatedDimensions.heightMm.toFixed(2)}mm
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mode === "objects" && (
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">
                  Scoring Objects
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Click "Add New Object" to place markers. Click and drag
                  existing markers to move them.
                </p>
                <button
                  onClick={() => setPlacingObject(true)}
                  className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 mb-4"
                >
                  {placingObject ? "Click on mat to place" : "Add New Object"}
                </button>

                {selectedObject &&
                  missions.find((obj) => obj.id === selectedObject) && (
                    <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded">
                      <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                        Edit Object
                      </h4>
                      <input
                        type="text"
                        value={
                          missions.find((obj) => obj.id === selectedObject)
                            ?.name
                        }
                        onChange={(e) =>
                          updateSelectedObject({ name: e.target.value })
                        }
                        className="w-full px-2 py-1 mb-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                        placeholder="Object name"
                      />
                      <textarea
                        value={
                          missions.find((obj) => obj.id === selectedObject)
                            ?.description
                        }
                        onChange={(e) =>
                          updateSelectedObject({ description: e.target.value })
                        }
                        className="w-full px-2 py-1 mb-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                        placeholder="Description (optional)"
                        rows={2}
                      />

                      {/* Scoring Mode Selector */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Scoring Mode
                        </label>
                        <select
                          value="multi-select"
                          disabled
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 opacity-50"
                        >
                          <option value="multi-select">
                            Multi-select (check any/all objectives)
                          </option>
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Multi-select allows multiple objectives to be
                          completed simultaneously. Single-select allows only
                          one objective at a time (like Precision Tokens).
                        </p>
                      </div>

                      {/* Objectives Editor */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Objectives
                          </h4>
                          <button
                            onClick={() => addObjectiveToSelected()}
                            className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                          >
                            + Add Objective
                          </button>
                        </div>

                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {missions
                            .find((obj) => obj.id === selectedObject)
                            ?.objectives.map((objective, index) => (
                              <div
                                key={objective.id}
                                className="border border-gray-200 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-700"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Objective {index + 1}
                                  </span>
                                  <button
                                    onClick={() =>
                                      removeObjectiveFromSelected(objective.id)
                                    }
                                    className="text-red-500 hover:text-red-700 text-xs"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={objective.description || ""}
                                  onChange={(e) =>
                                    updateObjectiveInSelected(objective.id, {
                                      description: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 mb-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                                  placeholder="Objective description (optional)"
                                />

                                {/* Scoring Mode */}
                                <select
                                  value={
                                    objective.scoringMode || "multi-select"
                                  }
                                  onChange={(e) =>
                                    updateObjectiveInSelected(objective.id, {
                                      scoringMode: e.target.value as
                                        | "multi-select"
                                        | "single-select",
                                    })
                                  }
                                  className="w-full px-2 py-1 mb-2 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                                >
                                  <option value="multi-select">
                                    Multi-select (can complete multiple)
                                  </option>
                                  <option value="single-select">
                                    Single-select (only one at a time)
                                  </option>
                                </select>

                                {/* Choices for this objective */}
                                <div className="space-y-1 mt-2">
                                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Choices ({objective.choices?.length || 0}):
                                  </div>
                                  {objective.choices?.map(
                                    (choice, choiceIndex) => (
                                      <div
                                        key={choice.id}
                                        className="flex gap-1 items-center"
                                      >
                                        <input
                                          type="text"
                                          value={choice.description}
                                          onChange={(e) => {
                                            const updatedChoices = [
                                              ...(objective.choices || []),
                                            ];
                                            updatedChoices[choiceIndex] = {
                                              ...choice,
                                              description: e.target.value,
                                            };
                                            updateObjectiveInSelected(
                                              objective.id,
                                              {
                                                choices: updatedChoices,
                                              }
                                            );
                                          }}
                                          className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                                          placeholder="Choice description"
                                        />
                                        <input
                                          type="number"
                                          value={choice.points}
                                          onChange={(e) => {
                                            const updatedChoices = [
                                              ...(objective.choices || []),
                                            ];
                                            updatedChoices[choiceIndex] = {
                                              ...choice,
                                              points:
                                                parseInt(e.target.value) || 0,
                                            };
                                            updateObjectiveInSelected(
                                              objective.id,
                                              {
                                                choices: updatedChoices,
                                              }
                                            );
                                          }}
                                          className="w-16 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                                          placeholder="Pts"
                                        />
                                        <select
                                          value={choice.type || "primary"}
                                          onChange={(e) => {
                                            const updatedChoices = [
                                              ...(objective.choices || []),
                                            ];
                                            updatedChoices[choiceIndex] = {
                                              ...choice,
                                              type: e.target.value as
                                                | "primary"
                                                | "bonus",
                                            };
                                            updateObjectiveInSelected(
                                              objective.id,
                                              {
                                                choices: updatedChoices,
                                              }
                                            );
                                          }}
                                          className="px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                                        >
                                          <option value="primary">Pri</option>
                                          <option value="bonus">Bon</option>
                                        </select>
                                        <button
                                          onClick={() => {
                                            const updatedChoices =
                                              objective.choices?.filter(
                                                (_, i) => i !== choiceIndex
                                              );
                                            updateObjectiveInSelected(
                                              objective.id,
                                              {
                                                choices: updatedChoices,
                                              }
                                            );
                                          }}
                                          className="text-red-500 hover:text-red-700 text-xs px-1"
                                          disabled={
                                            objective.choices?.length === 1
                                          }
                                          title={
                                            objective.choices?.length === 1
                                              ? "Must have at least one choice"
                                              : "Remove choice"
                                          }
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )
                                  )}
                                  <button
                                    onClick={() => {
                                      const newChoice = {
                                        id: `choice_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                                        description: "New choice",
                                        points: 5,
                                        type: "primary" as const,
                                      };
                                      updateObjectiveInSelected(objective.id, {
                                        choices: [
                                          ...(objective.choices || []),
                                          newChoice,
                                        ],
                                      });
                                    }}
                                    className="text-xs text-blue-500 hover:text-blue-700"
                                  >
                                    + Add Choice
                                  </button>
                                </div>
                              </div>
                            ))}
                          {!missions.find((obj) => obj.id === selectedObject)
                            ?.objectives.length && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                              No objectives yet. Click "Add Objective" to get
                              started.
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={deleteSelectedObject}
                        className="w-full px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete Object
                      </button>
                    </div>
                  )}

                <div className="space-y-2">
                  {missions.map((obj) => (
                    <button
                      key={obj.id}
                      onClick={() => setSelectedObject(obj.id)}
                      className={`w-full text-left px-3 py-2 rounded ${
                        selectedObject === obj.id
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {obj.name} (
                      {obj.objectives.reduce(
                        (sum, o) =>
                          sum +
                          (o.choices?.reduce((cSum, c) => cSum + c.points, 0) ||
                            0),
                        0
                      )}
                      pts)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === "preview" && (
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
                    {calculatedDimensions?.widthMm.toFixed(2) || MAT_WIDTH_MM}mm
                    ×{" "}
                    {calculatedDimensions?.heightMm.toFixed(2) || MAT_HEIGHT_MM}
                    mm
                    {calculatedDimensions && " (calculated)"}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Missions:</strong> {missions.length}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Total Possible Points:</strong>{" "}
                    {missions.reduce(
                      (sum, obj) =>
                        sum +
                        obj.objectives.reduce(
                          (objSum, objective) =>
                            objSum +
                            (objective.choices?.reduce(
                              (cSum, c) => cSum + c.points,
                              0
                            ) || 0),
                          0
                        ),
                      0
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleSave}
                    className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Save Configuration
                  </button>
                  <button
                    onClick={handleExportTar}
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    📦 Export Season Pack (.tar)
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Downloads a complete season pack with config.json, mat.png,
                    and README.md in a proper directory structure
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
