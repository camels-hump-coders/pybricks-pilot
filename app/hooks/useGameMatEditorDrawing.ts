import { useCallback, useEffect, useRef } from "react";
import type { Mission, Point } from "../schemas/GameMatConfig";

interface UseGameMatEditorDrawingProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  mode: "upload" | "corners" | "calibration" | "objects" | "preview";
  corners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  };
  currentCorner: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | null;
  calibrationPoints: {
    xAxis: { first: Point | null; second: Point | null };
    yAxis: { first: Point | null; second: Point | null };
  };
  currentCalibrationPoint: {
    axis: "xAxis" | "yAxis";
    point: "first" | "second";
  } | null;
  missions: Mission[];
  selectedObject: string | null;
  draggingObject: string | null;
  hoveredObject: string | null;
  originalImageData: string;
  normalizedImageData: string;
  areAllCornersSet: boolean;
}

/**
 * Custom hook for continuous canvas drawing in GameMatEditor
 */
export function useGameMatEditorDrawing(props: UseGameMatEditorDrawingProps) {
  const {
    canvasRef,
    imageRef,
    mode,
    corners,
    currentCorner,
    calibrationPoints,
    currentCalibrationPoint,
    missions,
    selectedObject,
    draggingObject,
    hoveredObject,
    originalImageData,
    normalizedImageData,
    areAllCornersSet,
  } = props;

  // Store refs for always-current data access
  const dataRefs = useRef({
    mode,
    corners,
    currentCorner,
    calibrationPoints,
    currentCalibrationPoint,
    missions,
    selectedObject,
    draggingObject,
    hoveredObject,
    originalImageData,
    normalizedImageData,
    areAllCornersSet,
  });

  // Store transformation data in a ref for immediate access
  const transformRef = useRef({
    imgX: 0,
    imgY: 0,
    imgWidth: 0,
    imgHeight: 0,
  });

  // Update refs with latest data
  dataRefs.current = {
    mode,
    corners,
    currentCorner,
    calibrationPoints,
    currentCalibrationPoint,
    missions,
    selectedObject,
    draggingObject,
    hoveredObject,
    originalImageData,
    normalizedImageData,
    areAllCornersSet,
  };

  // Animation loop control
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const lerp2D = (p1: Point, p2: Point, t: number): Point => {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
  };

  const drawCorners = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number,
    corners: typeof dataRefs.current.corners,
    currentCorner: typeof dataRefs.current.currentCorner,
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
        y - 10,
      );
      ctx.fillText(
        cornerLabels[key as keyof typeof cornerLabels],
        x + 10,
        y - 10,
      );
    });
  };

  const drawPerspectiveGrid = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number,
    corners: typeof dataRefs.current.corners,
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

  const drawCalibrationPoint = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    color: string,
  ) => {
    // Draw point marker
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw label
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.font = "12px sans-serif";
    ctx.strokeText(label, x + 10, y - 5);
    ctx.fillText(label, x + 10, y - 5);
  };

  const drawCalibrationPoints = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number,
    calibrationPoints: typeof dataRefs.current.calibrationPoints,
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
    }

    // Draw connecting lines if both points exist
    if (calibrationPoints.xAxis.first && calibrationPoints.xAxis.second) {
      const x1 = imgX + calibrationPoints.xAxis.first.x * imgWidth;
      const y1 = imgY + calibrationPoints.xAxis.first.y * imgHeight;
      const x2 = imgX + calibrationPoints.xAxis.second.x * imgWidth;
      const y2 = imgY + calibrationPoints.xAxis.second.y * imgHeight;

      ctx.strokeStyle = "rgba(255, 107, 107, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (calibrationPoints.yAxis.first && calibrationPoints.yAxis.second) {
      const x1 = imgX + calibrationPoints.yAxis.first.x * imgWidth;
      const y1 = imgY + calibrationPoints.yAxis.first.y * imgHeight;
      const x2 = imgX + calibrationPoints.yAxis.second.x * imgWidth;
      const y2 = imgY + calibrationPoints.yAxis.second.y * imgHeight;

      ctx.strokeStyle = "rgba(78, 205, 196, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };

  const drawMissions = (
    ctx: CanvasRenderingContext2D,
    imgX: number,
    imgY: number,
    imgWidth: number,
    imgHeight: number,
    missions: Mission[],
    selectedObject: string | null,
    draggingObject: string | null,
    hoveredObject: string | null,
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
              0,
            )),
        0,
      );
      const text = `${obj.name} (${totalPoints}pts)`;
      ctx.strokeText(text, canvasPos.x + 12, canvasPos.y - 5);
      ctx.fillText(text, canvasPos.x + 12, canvasPos.y - 5);
    });
  };

  // Main drawing function that uses refs for always-current data
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;

    if (!canvas || !ctx) return;
    
    // If no image yet, just clear the canvas and return
    if (!img || !img.complete || img.naturalWidth === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Get current data from refs (always up-to-date)
    const data = dataRefs.current;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image to fit canvas
    const scale = Math.min(
      canvas.width / img.width,
      canvas.height / img.height,
    );
    const width = img.width * scale;
    const height = img.height * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(img, x, y, width, height);

    // Store transform for later use (both in dataset and ref)
    canvas.dataset.imgX = x.toString();
    canvas.dataset.imgY = y.toString();
    canvas.dataset.imgWidth = width.toString();
    canvas.dataset.imgHeight = height.toString();
    
    // Also store in ref for immediate synchronous access
    transformRef.current = {
      imgX: x,
      imgY: y,
      imgWidth: width,
      imgHeight: height,
    };

    // Draw corners if in corners mode
    if (data.mode === "corners") {
      drawCorners(ctx, x, y, width, height, data.corners, data.currentCorner);
      // Draw perspective grid if corners are set
      if (data.areAllCornersSet) {
        drawPerspectiveGrid(ctx, x, y, width, height, data.corners);
      }
    }

    // Draw calibration points if in calibration mode
    if (data.mode === "calibration") {
      drawCalibrationPoints(ctx, x, y, width, height, data.calibrationPoints);
    }

    // Draw scoring objects (only on normalized image)
    if ((data.mode === "objects" || data.mode === "preview") && data.normalizedImageData) {
      drawMissions(
        ctx,
        x,
        y,
        width,
        height,
        data.missions,
        data.selectedObject,
        data.draggingObject,
        data.hoveredObject,
      );
    }
  }, [canvasRef, imageRef]);

  // Start animation loop
  const startDrawing = useCallback(() => {
    if (isRunningRef.current) return;

    isRunningRef.current = true;

    const animate = () => {
      if (!isRunningRef.current) return;

      drawCanvas();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, [drawCanvas]);

  // Stop animation loop
  const stopDrawing = useCallback(() => {
    isRunningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Start drawing loop when component mounts
  useEffect(() => {
    startDrawing();
    
    return () => {
      stopDrawing();
    };
  }, [startDrawing, stopDrawing]);

  // Provide function to manually trigger redraw (for compatibility)
  const redraw = useCallback(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Provide function to get current transformation data
  const getTransform = useCallback(() => {
    return transformRef.current;
  }, []);

  return { redraw, startDrawing, stopDrawing, getTransform };
}