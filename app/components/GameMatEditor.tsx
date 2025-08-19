import { TarWriter } from "@gera2ld/tarjs";
import { useEffect, useRef, useState } from "react";
import type {
  GameMatConfig,
  Mission,
  MissionObjective,
  Point,
} from "../schemas/GameMatConfig";
import { deSkewImage } from "../utils/perspectiveTransform";
import { useGameMatEditorDrawing } from "../hooks/useGameMatEditorDrawing";
import { UploadInterface } from "./GameMatEditor/UploadInterface";
import { CanvasArea } from "./GameMatEditor/CanvasArea";
import { SidePanel } from "./GameMatEditor/SidePanel";

// Re-export types for backward compatibility;

interface GameMatEditorProps {
  onSave: (config: GameMatConfig, imageFile?: File) => void;
  onCancel: () => void;
  initialConfig?: GameMatConfig;
}

const MAT_WIDTH_MM = 2356; // Official FLL mat width
const MAT_HEIGHT_MM = 1137; // Official FLL mat height
const MAGNIFIER_SIZE = 150;

type EditorMode = "upload" | "corners" | "calibration" | "objects" | "preview";

export function GameMatEditor({
  onSave,
  onCancel,
  initialConfig,
}: GameMatEditorProps) {
  // When editing, start in objects mode if we have an existing image
  const hasExistingImage = initialConfig?.imageUrl || initialConfig?.imageData;
  const [mode, setMode] = useState<EditorMode>(
    hasExistingImage ? "objects" : "upload",
  );
  const [matName, setMatName] = useState(
    initialConfig?.name || "Custom Game Mat",
  );
  const [originalImageData, setOriginalImageData] = useState<string>(
    initialConfig?.originalImageData || initialConfig?.imageUrl || "",
  );
  const [normalizedImageData, setNormalizedImageData] = useState<string>(
    initialConfig?.imageData || initialConfig?.imageUrl || "",
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
    initialConfig?.missions || [],
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

  // Continuous canvas drawing hook
  const { redraw } = useGameMatEditorDrawing({
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
    areAllCornersSet: areAllCornersSet(),
  });

  // Load image when imageData changes
  useEffect(() => {
    const imageToLoad =
      mode === "corners" ? originalImageData : normalizedImageData;
    if (imageToLoad) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        // The continuous drawing hook will handle drawing automatically
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
    if (file?.type.startsWith("image/")) {
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
            e.target?.result as string,
          ) as GameMatConfig;
          if (config.version === "1.0") {
            setMatName(config.name);
            if (config.imageData) {
              setNormalizedImageData(config.imageData);
            }
            if (config.originalImageData || config.imageData) {
              setOriginalImageData(
                config.originalImageData || config.imageData || "",
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



  const canvasToNormalized = (
    canvasX: number,
    canvasY: number,
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
        MAT_HEIGHT_MM,
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

    // Get the de-skewed image dimensions
    const img = imageRef.current;
    if (!img) return null;

    // Calculate X axis distance in normalized coordinates (0-1) - only consider X coordinate
    const xDistanceNormalized = Math.abs(
      calibrationPoints.xAxis.second.x - calibrationPoints.xAxis.first.x,
    );

    // Calculate Y axis distance in normalized coordinates (0-1) - only consider Y coordinate
    const yDistanceNormalized = Math.abs(
      calibrationPoints.yAxis.second.y - calibrationPoints.yAxis.first.y,
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
    imgHeight: number,
  ): string | null => {
    const clickRadius = 15; // pixels

    for (const obj of missions) {
      const objX = imgX + obj.position.x * imgWidth;
      const objY = imgY + obj.position.y * imgHeight;
      const distance = Math.sqrt((x - objX) ** 2 + (y - objY) ** 2);

      if (distance <= clickRadius) {
        return obj.id;
      }
    }

    return null;
  };

  const handleCanvasMouseDown = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "objects") return;

    const rect = canvas.getBoundingClientRect();
    // Scale mouse coordinates from visual canvas size to internal canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

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
      imgHeight,
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
    // Scale mouse coordinates from visual canvas size to internal canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

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
        imgHeight,
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

    redraw();
  };

  const handleCanvasMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Scale mouse coordinates from visual canvas size to internal canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    setMousePos({ x, y });
    setShowMagnifier(
      (mode === "corners" && currentCorner !== null) ||
        (mode === "calibration" && currentCalibrationPoint !== null),
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
            : obj,
        ),
      );

      // Redraw canvas
      redraw();
    } else if (mode === "objects" && !placingObject) {
      // Update hover state when not dragging
      const hoveredObjectId = getObjectAtPosition(
        x,
        y,
        imgX,
        imgY,
        imgWidth,
        imgHeight,
      );
      if (hoveredObjectId !== hoveredObject) {
        setHoveredObject(hoveredObjectId);
        redraw(); // Redraw to show/hide hover effects
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
                  MAGNIFIER_SIZE,
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
        obj.id === selectedObject ? { ...obj, ...updates } : obj,
      ),
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
          : obj,
      ),
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
          : obj,
      ),
    );
  };

  const updateObjectiveInSelected = (
    objectiveId: string,
    updates: Partial<MissionObjective>,
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
                  : objective,
              ),
            }
          : obj,
      ),
    );
  };

  const handleSave = async () => {
    if (!normalizedImageData) {
      alert(
        "Please complete the image processing (corners and calibration) before saving",
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
        `✅ Exported ${matName} season pack as ${seasonDirName}.tar\n\nExtract to app/assets/seasons/ and restart your dev server to use.`,
      );
    } catch (error) {
      console.error("Export failed:", error);
      alert(
        `❌ Failed to export tar file: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    redraw();
  };

  useEffect(() => {
    redraw();
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
              <UploadInterface
                originalImageData={originalImageData}
                onFileUpload={handleFileUpload}
                onImportConfig={handleImportConfig}
                onKeepCurrentImage={() => setMode("objects")}
                canvasRef={canvasRef}
              />
            ) : (
              <CanvasArea
                mode={mode}
                canvasRef={canvasRef}
                draggingObject={draggingObject}
                hoveredObject={hoveredObject}
                placingObject={placingObject}
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
                drawMagnifier={drawMagnifier}
              />
            )}
          </div>

          {/* Side panel */}
          <SidePanel
            mode={mode}
            corners={corners}
            currentCorner={currentCorner}
            autoDeSkew={autoDeSkew}
            normalizedImageData={normalizedImageData}
            onSetCurrentCorner={setCurrentCorner}
            onResetCorners={() => {
              setCorners({
                topLeft: { x: 0, y: 0 },
                topRight: { x: 1, y: 0 },
                bottomLeft: { x: 0, y: 1 },
                bottomRight: { x: 1, y: 1 },
              });
              setCurrentCorner("topLeft");
              setNormalizedImageData(""); // Clear normalized image when resetting
            }}
            onPerformDeSkew={performDeSkew}
            onSetAutoDeSkew={setAutoDeSkew}
            areAllCornersSet={areAllCornersSet()}
            calibrationPoints={calibrationPoints}
            currentCalibrationPoint={currentCalibrationPoint}
            calculatedDimensions={calculatedDimensions}
            onSetCurrentCalibrationPoint={setCurrentCalibrationPoint}
            onCalibrationComplete={handleCalibrationComplete}
            onResetCalibration={resetCalibration}
            missions={missions}
            selectedObject={selectedObject}
            placingObject={placingObject}
            onSetPlacingObject={setPlacingObject}
            onSetSelectedObject={setSelectedObject}
            onUpdateObject={updateSelectedObject}
            onDeleteObject={deleteSelectedObject}
            onAddObjective={addObjectiveToSelected}
            onRemoveObjective={removeObjectiveFromSelected}
            onUpdateObjective={updateObjectiveInSelected}
            matName={matName}
            onSave={handleSave}
            onExportTar={handleExportTar}
            MAT_WIDTH_MM={MAT_WIDTH_MM}
            MAT_HEIGHT_MM={MAT_HEIGHT_MM}
          />
        </div>
      </div>
    </div>
  );
}
