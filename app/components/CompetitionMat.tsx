import { useEffect, useRef, useState } from "react";
import type { TelemetryData } from "../services/pybricksHub";
import unearthedBoard from "../assets/unearthed-board.jpg";

interface RobotPosition {
  x: number; // mm from left edge of mat (0 = left edge)
  y: number; // mm from bottom edge of mat (0 = bottom edge, positive = upward)
  heading: number; // degrees, 0 = north/forward
}

interface CompetitionMatProps {
  telemetryData: TelemetryData | null;
  isConnected: boolean;
  onRobotPositionSet?: (position: RobotPosition) => void;
  onResetTelemetry?: () => void;
}

// FLL Competition Mat dimensions (official size)
const MAT_WIDTH_MM = 2362; // 93 inches
const MAT_HEIGHT_MM = 1143; // 45 inches
const ROBOT_WIDTH_MM = 180; // Typical FLL robot width
const ROBOT_LENGTH_MM = 200; // Typical FLL robot length
const WHEEL_WIDTH_MM = 20;

export function CompetitionMat({
  telemetryData,
  isConnected,
  onRobotPositionSet,
  onResetTelemetry,
}: CompetitionMatProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const [isSettingPosition, setIsSettingPosition] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mousePosition, setMousePosition] = useState<RobotPosition | null>(null);
  const [initialPosition, setInitialPosition] = useState<RobotPosition>({
    x: 1893, // Bottom right X position (469mm from right edge: 2362 - 1893 = 469)
    y: 138, // Bottom right Y position (138mm from bottom edge)
    heading: 0,
  });
  const [currentPosition, setCurrentPosition] = useState<RobotPosition>({
    x: 1893, // Bottom right X position
    y: 138, // Bottom right Y position
    heading: 0,
  });
  
  // Reference position for telemetry calculations (tracks where movement calculations start from)
  const [telemetryReference, setTelemetryReference] = useState<RobotPosition>({
    x: 1893, // Bottom right X position
    y: 138, // Bottom right Y position
    heading: 0,
  });
  
  // Track accumulated telemetry values to handle manual heading adjustments
  const [accumulatedTelemetry, setAccumulatedTelemetry] = useState({
    distance: 0,
    angle: 0,
  });
  
  // Track any manual heading adjustments made since last telemetry reset
  const [manualHeadingAdjustment, setManualHeadingAdjustment] = useState(0);

  // Load the background image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      backgroundImageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.warn("Failed to load competition board image");
      setImageLoaded(false);
    };
    img.src = unearthedBoard;
  }, []);

  // Convert mm to canvas pixels
  const getCanvasScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const containerHeight = canvas.parentElement?.clientHeight || 400;
    
    // Scale to fit container while maintaining aspect ratio
    const scaleX = containerWidth / MAT_WIDTH_MM;
    const scaleY = containerHeight / MAT_HEIGHT_MM;
    return Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1:1
  };

  const mmToPixels = (mm: number) => mm * getCanvasScale();

  // Convert canvas coordinates to mm
  const pixelsToMm = (pixels: number) => pixels / getCanvasScale();

  // Convert robot position to canvas coordinates
  const robotToCanvas = (position: RobotPosition) => {
    const scale = getCanvasScale();
    return {
      x: position.x * scale,
      y: (MAT_HEIGHT_MM - position.y) * scale, // Flip Y coordinate (canvas Y=0 is top, robot Y=0 is bottom)
    };
  };

  // Convert canvas coordinates to robot position
  const canvasToRobot = (canvasX: number, canvasY: number) => {
    const scale = getCanvasScale();
    return {
      x: canvasX / scale,
      y: MAT_HEIGHT_MM - (canvasY / scale), // Flip Y coordinate
    };
  };

  const drawMat = (ctx: CanvasRenderingContext2D) => {
    const scale = getCanvasScale();
    const canvasWidth = MAT_WIDTH_MM * scale;
    const canvasHeight = MAT_HEIGHT_MM * scale;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw background image if loaded
    if (imageLoaded && backgroundImageRef.current) {
      ctx.drawImage(backgroundImageRef.current, 0, 0, canvasWidth, canvasHeight);
    } else {
      // Fallback: Draw plain mat background
      ctx.fillStyle = "#f8f9fa";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Draw mat border
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);

    // Only draw grid lines if image failed to load (as fallback)
    if (!imageLoaded) {
      // Draw grid lines every 200mm for reference
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 1;
      
      // Vertical lines
      for (let x = 200; x < MAT_WIDTH_MM; x += 200) {
        const canvasX = mmToPixels(x);
        ctx.beginPath();
        ctx.moveTo(canvasX, 0);
        ctx.lineTo(canvasX, canvasHeight);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = 200; y < MAT_HEIGHT_MM; y += 200) {
        const canvasY = mmToPixels(y);
        ctx.beginPath();
        ctx.moveTo(0, canvasY);
        ctx.lineTo(canvasWidth, canvasY);
        ctx.stroke();
      }

      // Draw center lines
      ctx.strokeStyle = "#c0c0c0";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      // Center vertical line
      const centerX = mmToPixels(MAT_WIDTH_MM / 2);
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, canvasHeight);
      ctx.stroke();

      // Center horizontal line
      const centerY = mmToPixels(MAT_HEIGHT_MM / 2);
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(canvasWidth, centerY);
      ctx.stroke();

      ctx.setLineDash([]);
    }
  };

  const drawRobot = (ctx: CanvasRenderingContext2D, position: RobotPosition, isGhost = false) => {
    const canvasPos = robotToCanvas(position);
    const x = canvasPos.x;
    const y = canvasPos.y;
    const heading = (position.heading * Math.PI) / 180; // Convert to radians

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);

    // Robot body
    const robotWidth = mmToPixels(ROBOT_WIDTH_MM);
    const robotLength = mmToPixels(ROBOT_LENGTH_MM);
    
    ctx.fillStyle = isGhost ? "rgba(0, 100, 255, 0.3)" : "#007bff";
    ctx.strokeStyle = isGhost ? "rgba(0, 100, 255, 0.5)" : "#0056b3";
    ctx.lineWidth = 2;
    
    ctx.fillRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);
    ctx.strokeRect(-robotWidth / 2, -robotLength / 2, robotWidth, robotLength);

    // Draw wheels (showing center of rotation)
    const wheelWidth = mmToPixels(WHEEL_WIDTH_MM);
    const wheelLength = mmToPixels(60);
    const wheelOffset = robotWidth / 2 - wheelWidth / 2;

    ctx.fillStyle = isGhost ? "rgba(50, 50, 50, 0.3)" : "#333";
    
    // Left wheel
    ctx.fillRect(-wheelOffset - wheelWidth / 2, -wheelLength / 2, wheelWidth, wheelLength);
    
    // Right wheel
    ctx.fillRect(wheelOffset - wheelWidth / 2, -wheelLength / 2, wheelWidth, wheelLength);

    // Draw direction indicator (arrow pointing forward)
    if (!isGhost) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -robotLength / 3);
      ctx.lineTo(-robotWidth / 6, -robotLength / 6);
      ctx.moveTo(0, -robotLength / 3);
      ctx.lineTo(robotWidth / 6, -robotLength / 6);
      ctx.stroke();
    }

    // Draw center point
    ctx.fillStyle = isGhost ? "rgba(255, 0, 0, 0.5)" : "#ff0000";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
  };

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Update canvas size
    const scale = getCanvasScale();
    canvas.width = MAT_WIDTH_MM * scale;
    canvas.height = MAT_HEIGHT_MM * scale;

    drawMat(ctx);

    // Draw ghost robot at mouse position if setting position
    if (isSettingPosition && mousePosition) {
      drawRobot(ctx, mousePosition, true);
    }

    // Draw current robot position
    drawRobot(ctx, currentPosition, false);
  };

  // Update robot position based on telemetry
  useEffect(() => {
    if (!telemetryData?.drivebase || !isConnected) return;

    const { drivebase } = telemetryData;
    
    // Get current telemetry values
    const currentDistance = drivebase.distance || 0; // mm from drivebase
    const currentAngle = drivebase.angle || 0; // Total rotation from drivebase start
    
    // Calculate delta since last telemetry update
    const deltaDistance = currentDistance - accumulatedTelemetry.distance;
    const deltaAngle = currentAngle - accumulatedTelemetry.angle;
    
    // Update accumulated telemetry
    setAccumulatedTelemetry({
      distance: currentDistance,
      angle: currentAngle,
    });
    
    // Calculate the robot's current heading: initial heading + total rotation + manual adjustments
    const totalHeadingChange = currentAngle + manualHeadingAdjustment;
    const currentHeading = (telemetryReference.heading + totalHeadingChange) % 360;
    
    // For movement calculation, use the heading from the PREVIOUS position
    // because the robot moves in the direction it was facing when it started moving
    const movementHeading = currentPosition.heading;
    const movementHeadingRad = (movementHeading * Math.PI) / 180;
    
    // Calculate position delta based on distance moved and the heading robot was facing
    // In our coordinate system: X+ is right, Y+ is up, 0° heading is north (up)
    const deltaX = deltaDistance * Math.sin(movementHeadingRad);
    const deltaY = deltaDistance * Math.cos(movementHeadingRad);
    
    const newPosition: RobotPosition = {
      x: Math.max(0, Math.min(MAT_WIDTH_MM, currentPosition.x + deltaX)),
      y: Math.max(0, Math.min(MAT_HEIGHT_MM, currentPosition.y + deltaY)),
      heading: currentHeading, // Update heading based on total rotation
    };

    setCurrentPosition(newPosition);
  }, [telemetryData, telemetryReference, accumulatedTelemetry, manualHeadingAdjustment, currentPosition.heading]);

  // Redraw canvas when position changes or image loads
  useEffect(() => {
    redrawCanvas();
  }, [currentPosition, initialPosition, isSettingPosition, imageLoaded, mousePosition]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(redrawCanvas, 100); // Small delay to ensure container has resized
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSettingPosition) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Convert canvas coordinates to robot coordinates
    const robotCoords = canvasToRobot(canvasX, canvasY);

    const newPosition: RobotPosition = {
      x: Math.max(ROBOT_WIDTH_MM / 2, Math.min(MAT_WIDTH_MM - ROBOT_WIDTH_MM / 2, robotCoords.x)),
      y: Math.max(ROBOT_LENGTH_MM / 2, Math.min(MAT_HEIGHT_MM - ROBOT_LENGTH_MM / 2, robotCoords.y)),
      heading: initialPosition.heading,
    };

    setMousePosition(newPosition);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSettingPosition || !mousePosition) return;

    // Use the mouse position that was being tracked
    setInitialPosition(mousePosition);
    setCurrentPosition(mousePosition);
  };

  const handleSetPosition = () => {
    if (!isSettingPosition) {
      setIsSettingPosition(true);
      setMousePosition(null); // Clear mouse position when entering setting mode
    } else {
      setIsSettingPosition(false);
      setMousePosition(null); // Clear mouse position when exiting setting mode
      // Update telemetry reference to match the new position
      setTelemetryReference({ ...initialPosition });
      setAccumulatedTelemetry({ distance: 0, angle: 0 });
      setManualHeadingAdjustment(0);
      onRobotPositionSet?.(initialPosition);
    }
  };

  const handleResetPosition = () => {
    const bottomRightPosition: RobotPosition = {
      x: 1893, // Bottom right X position (469mm from right edge)
      y: 138, // Bottom right Y position (138mm from bottom edge)
      heading: 0,
    };
    setInitialPosition(bottomRightPosition);
    setCurrentPosition(bottomRightPosition);
    setTelemetryReference(bottomRightPosition);
    setAccumulatedTelemetry({ distance: 0, angle: 0 });
    setManualHeadingAdjustment(0);
    setIsSettingPosition(false);
    setMousePosition(null);
  };

  const handleSetBottomLeft = () => {
    const bottomLeftPosition: RobotPosition = {
      x: 469, // Bottom left X position (469mm from left edge, matching right side distance)
      y: 138, // Bottom left Y position (same Y as bottom right)
      heading: 0,
    };
    setInitialPosition(bottomLeftPosition);
    setCurrentPosition(bottomLeftPosition);
    setTelemetryReference(bottomLeftPosition);
    setAccumulatedTelemetry({ distance: 0, angle: 0 });
    setManualHeadingAdjustment(0);
    setIsSettingPosition(false);
    setMousePosition(null);
  };

  const adjustHeading = (delta: number) => {
    const newHeading = (currentPosition.heading + delta + 360) % 360;
    
    // Track this manual adjustment
    setManualHeadingAdjustment(prev => prev + delta);
    
    // Update current position immediately (for visual feedback)
    const newCurrentPosition: RobotPosition = {
      ...currentPosition,
      heading: newHeading
    };
    setCurrentPosition(newCurrentPosition);
    
    // Update initial position for display purposes only
    setInitialPosition(prev => ({ ...prev, heading: newHeading }));
    
    // If we're setting position and have a mouse position, update its heading too
    if (mousePosition) {
      setMousePosition({ ...mousePosition, heading: newHeading });
    }
  };

  const handleResetBoard = () => {
    // Reset robot position to initial start position
    setCurrentPosition({ ...initialPosition });
    setTelemetryReference({ ...initialPosition });
    setAccumulatedTelemetry({ distance: 0, angle: 0 });
    setManualHeadingAdjustment(0);
    
    // Reset telemetry data (if callback provided)
    onResetTelemetry?.();
    
    // Exit positioning mode if active
    setIsSettingPosition(false);
    setMousePosition(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Competition Mat Visualization
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {MAT_WIDTH_MM}mm × {MAT_HEIGHT_MM}mm (93" × 45") - Competition Mat
            {imageLoaded && <span className="text-green-600 dark:text-green-400 ml-2">🖼️ Board loaded</span>}
            {!imageLoaded && <span className="text-yellow-600 dark:text-yellow-400 ml-2">📋 Grid mode</span>}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {isSettingPosition && (
            <>
              <div className="flex items-center gap-2 mr-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Heading:</label>
                <button
                  onClick={() => adjustHeading(-15)}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-800"
                >
                  ↺ -15°
                </button>
                <span className="text-sm font-mono bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                  {initialPosition.heading}°
                </span>
                <button
                  onClick={() => adjustHeading(15)}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-800"
                >
                  ↻ +15°
                </button>
              </div>
              
              <button
                onClick={handleSetBottomLeft}
                className="px-3 py-1 text-sm bg-gray-500 dark:bg-gray-600 text-white rounded hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
              >
                ◤ Bottom Left
              </button>
              
              <button
                onClick={handleResetPosition}
                className="px-3 py-1 text-sm bg-gray-500 dark:bg-gray-600 text-white rounded hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
              >
                ◥ Bottom Right
              </button>
            </>
          )}
          
          <button
            onClick={handleResetBoard}
            className="px-3 py-1 text-sm bg-orange-500 dark:bg-orange-600 text-white rounded hover:bg-orange-600 dark:hover:bg-orange-500 transition-colors"
          >
            🔄 Reset Board
          </button>
          
          <button
            onClick={handleSetPosition}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              isSettingPosition
                ? "bg-green-500 dark:bg-green-600 text-white hover:bg-green-600 dark:hover:bg-green-500"
                : "bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-500"
            }`}
          >
            {isSettingPosition ? "✓ Confirm Position" : "📍 Set Start Position"}
          </button>
        </div>
      </div>

      {isSettingPosition && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Click on the mat</strong> to position your robot, then use the heading buttons to set initial direction. 
            Click "Confirm Position" when ready.
          </p>
        </div>
      )}

      <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800" style={{ minHeight: "400px" }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          className={`max-w-full max-h-full ${isSettingPosition ? "cursor-crosshair" : "cursor-default"}`}
          style={{ display: "block", margin: "0 auto" }}
        />
        
        {!isConnected && (
          <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 bg-opacity-75 flex items-center justify-center">
            <div className="text-center text-gray-600 dark:text-gray-300">
              <div className="text-4xl mb-2">🔌</div>
              <p className="font-medium">Connect to hub to see robot movement</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">Current Position</div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            X: {Math.round(currentPosition.x)}mm<br/>
            Y: {Math.round(currentPosition.y)}mm
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">Heading</div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            {Math.round(currentPosition.heading)}°
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">Distance Traveled</div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            {telemetryData?.drivebase?.distance ? Math.round(telemetryData.drivebase.distance) : 0}mm
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
          <div className="font-medium text-gray-700 dark:text-gray-300">Total Rotation</div>
          <div className="font-mono text-gray-600 dark:text-gray-400">
            {telemetryData?.drivebase?.angle ? Math.round(telemetryData.drivebase.angle) : 0}°
          </div>
        </div>
      </div>
    </div>
  );
}