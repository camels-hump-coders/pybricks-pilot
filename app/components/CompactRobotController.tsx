import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { useUploadProgress } from "../hooks/useUploadProgress";
import { LEGO_STUD_SIZE_MM } from "../schemas/RobotConfig";
import { telemetryHistory } from "../services/telemetryHistory";
import {
  robotPositionAtom,
  setRobotPositionAtom,
  showGridOverlayAtom,
  showTrajectoryOverlayAtom,
  perpendicularPreviewAtom,
} from "../store/atoms/gameMat";
import { isUploadingProgramAtom } from "../store/atoms/hubConnection";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { ControlModeToggle } from "./ControlModeToggle";
import { HubMenuInterface } from "./HubMenuInterface";
import { ManualControls } from "./ManualControls";
import { MotorControls } from "./MotorControls";
import {
  calculatePreviewPosition,
  calculateTrajectoryProjection,
} from "./MovementPreview";
import { SplineControls } from "./SplineControls";

interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top edge, positive = downward)
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
}

interface CompactRobotControllerProps {
  onDriveCommand?: (direction: number, speed: number) => Promise<void>;
  onTurnCommand?: (angle: number, speed: number) => Promise<void>;
  onStopCommand?: () => Promise<void>;
  onContinuousDriveCommand?: (speed: number, turnRate: number) => Promise<void>;
  onMotorCommand?: (
    motor: string,
    angle: number,
    speed: number
  ) => Promise<void>;
  onContinuousMotorCommand?: (motor: string, speed: number) => Promise<void>;
  onMotorStopCommand?: (motor: string) => Promise<void>;
  telemetryData?: any;
  isConnected: boolean;
  className?: string;
  // Robot position now comes from Jotai atoms
  robotType?: "real" | "virtual" | null;
  onResetTelemetry?: (startNewPath?: boolean) => Promise<void>;
  onSetPosition?: (x: number, y: number, heading: number) => void;
  customMatConfig?: any | null; // Add mat config as prop
  // Program control props
  onStopProgram?: () => Promise<void>;
  onUploadAndRunFile?: (
    file: any,
    content: string,
    allPrograms: any[]
  ) => Promise<void>;
  isUploading?: boolean;
  debugEvents?: any[];
  onPreviewUpdate?: (preview: {
    type: "drive" | "turn" | null;
    direction: "forward" | "backward" | "left" | "right" | null;
    positions: {
      primary: RobotPosition | null;
      secondary: RobotPosition | null;
    };
    trajectoryProjection?: {
      nextMoveEnd: RobotPosition | null;
      boardEndProjection: RobotPosition | null;
      trajectoryPath: RobotPosition[];
    };
    secondaryTrajectoryProjection?: {
      nextMoveEnd: RobotPosition | null;
      boardEndProjection: RobotPosition | null;
      trajectoryPath: RobotPosition[];
    };
  }) => void;
  onPerpendicularPreviewUpdate?: (preview: {
    show: boolean;
    hoveredButtonType?: "drive" | "turn";
    direction?: "forward" | "backward" | "left" | "right";
    positions?: RobotPosition[];
    trajectories?: RobotPosition[][];
  }) => void;
}

// Radial Heading Selector Component
interface HeadingSelectorProps {
  heading: number;
  onChange: (heading: number) => void;
  size?: number;
}

function RadialHeadingSelector({
  heading,
  onChange,
  size = 80,
}: HeadingSelectorProps) {
  const radius = size / 2 - 8;
  const centerX = size / 2;
  const centerY = size / 2;
  const [isDragging, setIsDragging] = useState(false);

  // Convert heading to angle for display (0° = north/up, clockwise)
  const displayAngle = heading - 90; // Offset so 0° points up
  const radians = (displayAngle * Math.PI) / 180;
  const indicatorX = centerX + radius * 0.7 * Math.cos(radians);
  const indicatorY = centerY + radius * 0.7 * Math.sin(radians);

  const calculateAngleFromMouse = (
    clientX: number,
    clientY: number,
    rect: DOMRect
  ) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = clientX - centerX;
    const mouseY = clientY - centerY;

    // Calculate angle from center (0° = north/up, clockwise)
    let angle = Math.atan2(mouseY, mouseX) * (180 / Math.PI);
    angle = angle + 90; // Convert to our heading system

    // Normalize to -180 to 180 range
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;

    return Math.round(angle);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = calculateAngleFromMouse(event.clientX, event.clientY, rect);
    onChange(angle);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = calculateAngleFromMouse(event.clientX, event.clientY, rect);
    onChange(angle);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (event: MouseEvent) => {
        const selector = document.querySelector(
          "[data-heading-selector]"
        ) as HTMLElement;
        if (selector) {
          const rect = selector.getBoundingClientRect();
          const angle = calculateAngleFromMouse(
            event.clientX,
            event.clientY,
            rect
          );
          onChange(angle);
        }
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDragging, onChange]);

  // Common direction markers
  const directions = [
    { angle: 0, label: "N", desc: "Forward" },
    { angle: 90, label: "E", desc: "Right" },
    { angle: 180, label: "S", desc: "Backward" },
    { angle: -90, label: "W", desc: "Left" },
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-gray-600 dark:text-gray-400">
        Robot Heading
      </div>
      <div
        className={`relative cursor-pointer bg-gray-100 dark:bg-gray-700 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:border-blue-400 transition-colors select-none ${isDragging ? "border-blue-500" : ""}`}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        title={`Click or drag to set heading (currently ${heading}°)`}
        data-heading-selector
      >
        {/* Direction markers */}
        {directions.map(({ angle, label }) => {
          const markerAngle = angle - 90; // Offset for display
          const markerRadians = (markerAngle * Math.PI) / 180;
          const markerX = centerX + (radius - 4) * Math.cos(markerRadians);
          const markerY = centerY + (radius - 4) * Math.sin(markerRadians);

          return (
            <div
              key={angle}
              className="absolute text-xs font-bold text-gray-600 dark:text-gray-300 pointer-events-none flex items-center justify-center"
              style={{
                left: markerX,
                top: markerY,
                transform: "translate(-50%, -50%)",
                width: "12px",
                height: "12px",
              }}
            >
              {label}
            </div>
          );
        })}

        {/* Robot direction indicator */}
        <div
          className="absolute w-3 h-3 bg-blue-500 rounded-full border border-white shadow-md pointer-events-none"
          style={{
            left: indicatorX - 6,
            top: indicatorY - 6,
          }}
        />

        {/* Center dot */}
        <div
          className="absolute w-2 h-2 bg-gray-400 rounded-full pointer-events-none"
          style={{
            left: centerX - 4,
            top: centerY - 4,
          }}
        />
      </div>
      <div className="text-xs text-center text-gray-500 dark:text-gray-400">
        {heading}° (
        {directions.find((d) => d.angle === heading)?.desc || "Custom"})
      </div>
    </div>
  );
}

interface ExecutingCommand {
  type: "drive" | "turn";
  direction: "forward" | "backward" | "left" | "right";
  originalParams: { distance?: number; angle?: number; speed: number };
}

export function CompactRobotController({
  onDriveCommand,
  onTurnCommand,
  onStopCommand,
  onContinuousDriveCommand,
  onMotorCommand,
  onContinuousMotorCommand,
  onMotorStopCommand,
  telemetryData,
  isConnected,
  className = "",
  robotType = "real",
  onResetTelemetry,
  onSetPosition,
  customMatConfig,
  onStopProgram,
  onUploadAndRunFile,
  isUploading,
  debugEvents = [],
  onPreviewUpdate,
}: CompactRobotControllerProps) {
  // State
  const [distance, setDistance] = useState(100);
  const [angle, setAngle] = useState(45);
  const [driveSpeed, setDriveSpeed] = useState(50);
  const [motorSpeed, setMotorSpeed] = useState(50);
  const [motorAngle, setMotorAngle] = useState(45);
  const [executingCommand, setExecutingCommand] =
    useState<ExecutingCommand | null>(null);
  const [activeMotor, setActiveMotor] = useState<string | null>(null);
  const [hubMenuOpen, setHubMenuOpen] = useState(false);

  // Refs
  const commandChainRef = useRef<Promise<void>>(Promise.resolve());

  // Atoms
  const robotConfig = useAtomValue(robotConfigAtom);
  const currentRobotPosition = useAtomValue(robotPositionAtom);
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const isUploadingProgram = useAtomValue(isUploadingProgramAtom);
  const setRobotPosition = useSetAtom(setRobotPositionAtom);
  const [showGridOverlay, setShowGridOverlay] = useAtom(showGridOverlayAtom);
  const [showTrajectoryOverlay, setShowTrajectoryOverlay] = useAtom(showTrajectoryOverlayAtom);
  const [perpendicularPreview, setPerpendicularPreview] = useAtom(perpendicularPreviewAtom);

  // Position setting state
  const [isSettingPosition, setIsSettingPosition] = useState(false);
  const [edgePositionSettings, setEdgePositionSettings] = useState({
    side: "right" as "left" | "right",
    fromBottom: 100, // mm from bottom edge
    fromSide: 50, // mm from side edge
    heading: 0, // degrees (0 = north/forward, 90 = east/right, 180 = south/backward, 270 = west/left)
  });
  const [positionPreview, setPositionPreview] = useState<RobotPosition | null>(
    null
  );

  // Effect to initialize trajectory overlay when enabled
  useEffect(() => {
    if (showTrajectoryOverlay) {
      // Just enable the trajectory overlay - let the distance/angle effect handle the ghosts
    }
  }, [showTrajectoryOverlay]); // Only depend on the toggle, not position or config

  // Effect to update trajectory overlay ghosts when distance/angle changes
  useEffect(() => {
    if (showTrajectoryOverlay && currentRobotPosition && robotConfig) {
      // Only update if there are no hover ghosts currently
      setPerpendicularPreview(prev => {
        const hasHoverGhosts = prev.ghosts.some((g: any) => g.isHover);
        if (hasHoverGhosts) {
          // Don't update trajectory ghosts if there are hover ghosts
          return prev;
        }
        
        // Recalculate trajectory overlay ghosts with new distance/angle
        const ghosts = [];

        // Forward drive position (green)
        const forwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig
        );
        if (forwardPosition) {
          ghosts.push({
            position: forwardPosition,
            type: "drive" as const,
            direction: "forward" as const,
            color: "#10b981", // green-500
            label: `↑ ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        // Backward drive position (orange)
        const backwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "drive",
          "backward",
          robotConfig
        );
        if (backwardPosition) {
          ghosts.push({
            position: backwardPosition,
            type: "drive" as const,
            direction: "backward" as const,
            color: "#f97316", // orange-500
            label: `↓ ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        // Left turn position (purple) - show turn + distance for trajectory overlay
        const leftTurnPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "turn",
          "left",
          robotConfig
        );
        const leftTurnThenForward = calculatePreviewPosition(
          leftTurnPosition || currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig
        );
        if (leftTurnThenForward) {
          ghosts.push({
            position: leftTurnThenForward,
            type: "turn" as const,
            direction: "left" as const,
            color: "#a855f7", // purple-500
            label: `↶ ${angle}° + ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        // Right turn position (cyan) - show turn + distance for trajectory overlay
        const rightTurnPosition = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          angle,
          "turn",
          "right",
          robotConfig
        );
        const rightTurnThenForward = calculatePreviewPosition(
          rightTurnPosition || currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig
        );
        if (rightTurnThenForward) {
          ghosts.push({
            position: rightTurnThenForward,
            type: "turn" as const,
            direction: "right" as const,
            color: "#06b6d4", // cyan-600
            label: `↷ ${angle}° + ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        }

        return {
          show: true,
          ghosts: ghosts,
          distance: distance,
          angle: angle,
        };
      });
    }
  }, [distance, angle, showTrajectoryOverlay, currentRobotPosition, robotConfig]);

  // Separate effect to clear trajectory overlay when disabled
  useEffect(() => {
    if (!showTrajectoryOverlay) {
      // Only clear if the current ghosts are trajectory overlay ghosts
      setPerpendicularPreview(prev => {
        // If all current ghosts are trajectory overlay ghosts, clear them
        const hasOnlyTrajectoryGhosts = prev.ghosts.every(ghost => (ghost as any).isTrajectoryOverlay);
        if (hasOnlyTrajectoryGhosts && prev.ghosts.length > 0) {
          return {
            show: false,
            ghosts: [],
            distance: distance,
            angle: angle,
          };
        }
        return prev; // Don't change if there are hover ghosts
      });
    }
  }, [showTrajectoryOverlay, distance, angle]);

  // Track last applied position for reset functionality
  const [lastPositionSettings, setLastPositionSettings] = useState({
    side: "right" as "left" | "right", // Default to bottom-right
    fromBottom: 0, // Default to 0 edge offset
    fromSide: 0,
    heading: 0, // Default to forward facing
  });

  // Game mat state
  const {
    controlMode,
    setControlMode,
    currentSplinePath,
    splinePaths,
    enterSplinePathMode,
    exitSplinePathMode,
  } = useJotaiGameMat();

  // Upload progress (for UI display)
  const { uploadProgress } = useUploadProgress();

  // Get shared program state
  const { programCount, allPrograms } = useJotaiFileSystem();

  // Calculate robot position from edge-based measurements
  const calculateRobotPositionFromEdges = (
    side: "left" | "right",
    fromBottomMm: number,
    fromSideMm: number,
    heading: number = 0
  ): RobotPosition => {
    const robotWidthMm = robotConfig.dimensions.width * LEGO_STUD_SIZE_MM;
    const robotLengthMm = robotConfig.dimensions.length * LEGO_STUD_SIZE_MM;
    const centerOfRotationFromLeftMm =
      robotConfig.centerOfRotation.distanceFromLeftEdge * LEGO_STUD_SIZE_MM;
    const centerOfRotationFromTopMm =
      robotConfig.centerOfRotation.distanceFromTop * LEGO_STUD_SIZE_MM;

    // Mat dimensions from current mat config (fallback to FLL default)
    const matWidthMm = customMatConfig?.dimensions?.widthMm || 2356;
    const matHeightMm = customMatConfig?.dimensions?.heightMm || 1137;

    let x: number;
    let y: number;

    if (side === "left") {
      // fromSideMm is distance from left edge to the left edge of robot
      x = fromSideMm + centerOfRotationFromLeftMm;
    } else {
      // fromSideMm is distance from right edge to the right edge of robot
      x = matWidthMm - fromSideMm - (robotWidthMm - centerOfRotationFromLeftMm);
    }

    // fromBottomMm is distance from bottom edge to the bottom edge of robot
    y =
      matHeightMm - fromBottomMm - (robotLengthMm - centerOfRotationFromTopMm);

    return {
      x,
      y,
      heading,
    };
  };
  // For virtual robots, manual controls should work when connected regardless of program status
  // For real robots, manual controls work when connected and hub menu program is running
  const isFullyConnected =
    isConnected &&
    !isUploadingProgram &&
    (robotType === "virtual" || isProgramRunning);

  // Position controls should work whenever connected (even during hub menu)
  const canSetPosition = isConnected && !isUploadingProgram;

  // Available motors (exclude drivebase motors)
  const availableMotors = telemetryData?.motors
    ? Object.keys(telemetryData.motors).filter(
        (name) => !["left", "right"].includes(name)
      )
    : [];

  // Helper functions for continuous control
  function queueCommand(commandFn: () => Promise<any>) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return Promise.resolve();
    }

    const currentPromise = commandChainRef.current;
    const newPromise = currentPromise.finally(async () => {
      try {
        await commandFn();
      } catch (error) {
        console.warn("Robot command failed:", error);
      }
    });
    commandChainRef.current = newPromise;
    return newPromise;
  }

  function sendContinuousMovement(driveSpeed: number, turnRate: number) {
    return queueCommand(async () => {
      await onContinuousDriveCommand?.(driveSpeed, turnRate);
    });
  }

  async function sendStepDrive(distance: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }

    const direction = distance > 0 ? "forward" : "backward";
    setExecutingCommand({
      type: "drive",
      direction,
      originalParams: { distance: Math.abs(distance), speed },
    });

    try {
      await onDriveCommand?.(distance, speed);
    } finally {
      setExecutingCommand(null);
    }
  }

  async function sendStepTurn(angle: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }

    const direction = angle > 0 ? "right" : "left";
    setExecutingCommand({
      type: "turn",
      direction,
      originalParams: { angle: Math.abs(angle), speed },
    });

    try {
      await onTurnCommand?.(angle, speed);
    } finally {
      setExecutingCommand(null);
    }
  }

  function stopExecutingCommand() {
    if (executingCommand) {
      sendStop();
      setExecutingCommand(null);
    }
  }

  function sendStop() {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }
    onStopCommand?.();
  }

  function sendMotorCommand(motorName: string, angle: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded"
      );
      return;
    }
    onMotorCommand?.(motorName, angle, speed);
  }

  function sendStopCommand() {
    return queueCommand(() => onStopCommand?.() || Promise.resolve());
  }

  function startContinuousDrive(direction: "forward" | "backward") {
    if (controlMode !== "continuous") return;
    const speed = direction === "forward" ? driveSpeed * 10 : -driveSpeed * 10;
    sendContinuousMovement(speed, 0);
  }

  function stopContinuousDrive() {
    sendStopCommand();
  }

  function startContinuousTurn(direction: "left" | "right") {
    if (controlMode !== "continuous") return;
    const turnRate =
      direction === "left" ? -driveSpeed * 3.6 : driveSpeed * 3.6;
    sendContinuousMovement(0, turnRate);
  }

  function stopContinuousTurn() {
    sendStopCommand();
  }

  function startContinuousMotor(motorName: string, direction: "ccw" | "cw") {
    if (controlMode !== "continuous") return;
    setActiveMotor(motorName);
    const speed = direction === "ccw" ? -motorSpeed * 10 : motorSpeed * 10;
    queueCommand(async () => {
      await onContinuousMotorCommand?.(motorName, speed);
    });
  }

  function stopContinuousMotor() {
    if (activeMotor) {
      queueCommand(async () => {
        await onMotorStopCommand?.(activeMotor);
      });
      setActiveMotor(null);
    }
  }

  function updateDualPreview(
    type: "drive" | "turn",
    overrideDistance?: number,
    overrideAngle?: number
  ) {
    if (onPreviewUpdate && currentRobotPosition) {
      const currentDistance = overrideDistance ?? distance;
      const currentAngle = overrideAngle ?? angle;

      if (type === "drive") {
        // Show both forward and backward previews for drive
        const forwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "forward",
          robotConfig
        );
        const backwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "backward",
          robotConfig
        );

        // Calculate trajectory projections for both directions
        const forwardTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "forward",
          2356,
          1137,
          robotConfig
        );
        const backwardTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "backward",
          2356,
          1137,
          robotConfig
        );

        onPreviewUpdate({
          type: "drive",
          direction: "forward",
          positions: {
            primary: forwardPosition,
            secondary: backwardPosition,
          },
          trajectoryProjection: forwardTrajectory,
          secondaryTrajectoryProjection: backwardTrajectory,
        });
      } else if (type === "turn") {
        // Show both left and right turn previews
        const leftPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "left",
          robotConfig
        );
        const rightPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "right",
          robotConfig
        );

        // Calculate trajectory projections for both directions
        const leftTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "left",
          2356,
          1137,
          robotConfig
        );
        const rightTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "right",
          2356,
          1137,
          robotConfig
        );

        onPreviewUpdate({
          type: "turn",
          direction: "left",
          positions: {
            primary: leftPosition,
            secondary: rightPosition,
          },
          trajectoryProjection: leftTrajectory,
          secondaryTrajectoryProjection: rightTrajectory,
        });
      }
    }
  }

  function updatePreview(
    type: "drive" | "turn" | null,
    direction: "forward" | "backward" | "left" | "right" | null
  ) {
    if (onPreviewUpdate && currentRobotPosition && type && direction) {
      const previewPosition = calculatePreviewPosition(
        currentRobotPosition,
        distance,
        angle,
        type,
        direction,
        robotConfig
      );

      const trajectoryProjection = calculateTrajectoryProjection(
        currentRobotPosition,
        distance,
        angle,
        type,
        direction,
        2356,
        1137,
        robotConfig
      );

      onPreviewUpdate({
        type,
        direction,
        positions: {
          primary: previewPosition,
          secondary: null,
        },
        trajectoryProjection,
      });

      // Also update perpendicular preview for hover effect - always show to draw attention
      let ghostPosition = previewPosition;
      
      // For turn previews, just show the turn (no forward movement)
      
      const hoverGhost = {
        position: ghostPosition,
        type: type as "drive" | "turn",
        direction: direction as "forward" | "backward" | "left" | "right",
        color: type === "drive" 
          ? (direction === "forward" ? "#10b981" : "#f97316")  // green for forward, orange for backward
          : (direction === "left" ? "#a855f7" : "#06b6d4"),  // purple for left, cyan for right
        label: type === "drive"
          ? `${direction === "forward" ? "↑" : "↓"} ${distance}mm`
          : `${direction === "left" ? "↶" : "↷"} ${angle}°`,
        isHover: true,  // Mark this as a hover ghost for bolder rendering
      };
      
      
      // If trajectory overlay is on, add the hover ghost to existing ghosts
      // Otherwise, just show the hover ghost
      if (showTrajectoryOverlay) {
        // Keep existing ghosts and add hover ghost with higher opacity
        const newPreview = {
          show: true,
          ghosts: [...perpendicularPreview.ghosts.filter((g: any) => 
            // Remove any previous hover ghost (identified by isHover flag)
            // Don't remove trajectory overlay ghosts, we want both turn ghosts visible
            !g.isHover
          ), hoverGhost],
          distance: distance,
          angle: angle,
        };
        setPerpendicularPreview(newPreview);
      } else {
        const newPreview = {
          show: true,
          ghosts: [hoverGhost],
          distance: distance,
          angle: angle,
        };
        setPerpendicularPreview(newPreview);
      }
    } else if (onPreviewUpdate) {
      onPreviewUpdate({
        type: null,
        direction: null,
        positions: { primary: null, secondary: null },
        trajectoryProjection: undefined,
        secondaryTrajectoryProjection: undefined,
      });
      
      // Clear hover ghost on mouse leave
      if (showTrajectoryOverlay) {
        // Keep the trajectory overlay ghosts, just remove hover ghosts
        setPerpendicularPreview(prev => ({
          ...prev,
          ghosts: prev.ghosts.filter((g: any) => !g.isHover),
        }));
      } else {
        // Clear all ghosts when not hovering and trajectory overlay is off
        setPerpendicularPreview({
          show: false,
          ghosts: [],
          distance: distance,
          angle: angle,
        });
      }
    }
  }

  // Spline path execution handler
  const handleExecutePath = async (path: any) => {
    const { executeSplinePath } = await import("../utils/splinePathCommands");

    const executeCommands = async (commands: any[]) => {
      for (const cmd of commands) {
        if (cmd.action === "turn" && onTurnCommand) {
          await onTurnCommand(cmd.angle, cmd.speed);
        } else if (cmd.action === "drive" && onDriveCommand) {
          await onDriveCommand(cmd.distance, cmd.speed);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    await executeSplinePath(path, executeCommands);
  };

  // Update position preview when edge settings change
  useEffect(() => {
    if (isSettingPosition) {
      const preview = calculateRobotPositionFromEdges(
        edgePositionSettings.side,
        edgePositionSettings.fromBottom,
        edgePositionSettings.fromSide,
        edgePositionSettings.heading
      );
      setPositionPreview(preview);
    } else {
      setPositionPreview(null);
    }
  }, [isSettingPosition, edgePositionSettings, robotConfig]);

  // Send position preview to mat visualization
  useEffect(() => {
    if (positionPreview && onPreviewUpdate) {
      onPreviewUpdate({
        type: "position" as any, // Special type for position preview
        direction: null,
        positions: {
          primary: positionPreview,
          secondary: null,
        },
      });
    } else if (
      !positionPreview &&
      onPreviewUpdate &&
      isSettingPosition === false
    ) {
      // Clear preview when exiting position setting mode
      onPreviewUpdate({
        type: null,
        direction: null,
        positions: { primary: null, secondary: null },
      });
    }
  }, [positionPreview, onPreviewUpdate, isSettingPosition]);

  return (
    <div
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Robot Controls
            </h3>
            {/* Connection Status Indicator */}
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isFullyConnected
                    ? "bg-green-500"
                    : isConnected
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isFullyConnected
                  ? "Ready"
                  : isConnected
                    ? "Waiting for robot program to run..."
                    : "Disconnected"}
                {telemetryHistory.isRecordingActive() && (
                  <span className="ml-1 text-red-500">● Rec</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Program Controls - Only show for real robots */}
      {robotType === "real" && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 sm:mb-2 uppercase tracking-wide">
            Quick Program Control
          </div>
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {/* Stop button - only when program is running */}
            {isProgramRunning && (
              <button
                onClick={() => {
                  if (onStopProgram) {
                    onStopProgram().catch(console.error);
                  }
                }}
                disabled={!onStopProgram}
                className="px-2 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                title="Stop Program"
              >
                ⏹️ Stop
              </button>
            )}

            {/* Up&Run button - always visible when there are programs */}
            {programCount > 0 && (
              <button
                onClick={async () => {
                  if (onUploadAndRunFile && allPrograms.length > 0) {
                    // If program is running, this will stop it and re-upload
                    const firstProgram = allPrograms[0];
                    try {
                      const content = await firstProgram.handle
                        .getFile()
                        .then((f) => f.text());
                      await onUploadAndRunFile(
                        firstProgram,
                        content,
                        allPrograms
                      );
                    } catch (error) {
                      console.error(
                        "Failed to upload and run programs:",
                        error
                      );
                    }
                  }
                }}
                disabled={!isConnected || programCount === 0}
                className="w-full px-2 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
                title={
                  programCount === 0
                    ? "Add programs using the # button in Program Manager"
                    : isProgramRunning
                      ? "Stop current program and upload & run new program"
                      : "Upload & Run Program Menu"
                }
              >
                🚀 Up&Run
              </button>
            )}
          </div>
          {/* Active Program Display */}
          {uploadProgress.isVisible && (
            <div className="mt-2 text-xs">
              <div className="mt-1">
                <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
                  <span>
                    {uploadProgress.total > 0 ? "Uploading..." : "Preparing..."}
                  </span>
                  {uploadProgress.total > 0 && (
                    <span>
                      {uploadProgress.current}/{uploadProgress.total}
                    </span>
                  )}
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1">
                  {uploadProgress.total > 0 ? (
                    <div
                      className="bg-blue-500 dark:bg-blue-400 h-1 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min((uploadProgress.current / uploadProgress.total) * 100, 100)}%`,
                      }}
                    ></div>
                  ) : (
                    <div className="bg-blue-500 dark:bg-blue-400 h-1 rounded-full animate-pulse w-full"></div>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Hub Menu Interface - Only show when menu program is running */}
          {isProgramRunning && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Hub Menu Remote
              </div>
              <HubMenuInterface />
            </div>
          )}
        </div>
      )}

      {/* Main Controls */}
      <div className="p-3">
        <div className="space-y-3 sm:space-y-4">
          {/* Position Control Buttons */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setIsSettingPosition(!isSettingPosition)}
                className={`px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSettingPosition
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
                disabled={!canSetPosition}
              >
                {isSettingPosition ? "✕ Cancel" : "📍 Set Pos"}
              </button>
              <button
                onClick={async () => {
                  try {
                    if (onResetTelemetry) {
                      await onResetTelemetry(false);
                    }

                    // Reset to the last applied position, defaulting to bottom-right with 0 offset
                    const resetPosition = calculateRobotPositionFromEdges(
                      lastPositionSettings.side,
                      lastPositionSettings.fromBottom,
                      lastPositionSettings.fromSide,
                      lastPositionSettings.heading
                    );
                    setRobotPosition(resetPosition);
                    setIsSettingPosition(false);

                    // Update UI to show the reset position settings
                    setEdgePositionSettings({
                      side: lastPositionSettings.side,
                      fromBottom: lastPositionSettings.fromBottom,
                      fromSide: lastPositionSettings.fromSide,
                      heading: lastPositionSettings.heading,
                    });
                  } catch (error) {
                    console.error("Failed to reset robot position:", error);
                    // Continue with position reset even if telemetry path start fails
                    const resetPosition = calculateRobotPositionFromEdges(
                      lastPositionSettings.side,
                      lastPositionSettings.fromBottom,
                      lastPositionSettings.fromSide,
                      lastPositionSettings.heading
                    );
                    setRobotPosition(resetPosition);
                    setIsSettingPosition(false);
                  }

                  // Start a new telemetry path (preserving history)
                  telemetryHistory.startNewPath();
                }}
                className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canSetPosition}
              >
                🔄 Reset
              </button>
            </div>

            {/* Edge-based position settings - only visible when setting position */}
            {isSettingPosition && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-3">
                <div className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
                  🎯 Position Robot by Edges
                </div>

                {/* Side Selection */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      setEdgePositionSettings((prev) => ({
                        ...prev,
                        side: "left",
                      }))
                    }
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      edgePositionSettings.side === "left"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    ← Left Side
                  </button>
                  <button
                    onClick={() =>
                      setEdgePositionSettings((prev) => ({
                        ...prev,
                        side: "right",
                      }))
                    }
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      edgePositionSettings.side === "right"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    Right Side →
                  </button>
                </div>

                {/* Distance Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      From Bottom (mm)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={edgePositionSettings.fromBottom}
                      onChange={(e) =>
                        setEdgePositionSettings((prev) => ({
                          ...prev,
                          fromBottom: Math.max(
                            0,
                            parseInt(e.target.value) || 0
                          ),
                        }))
                      }
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      From{" "}
                      {edgePositionSettings.side === "left" ? "Left" : "Right"}{" "}
                      (mm)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="2000"
                      value={edgePositionSettings.fromSide}
                      onChange={(e) =>
                        setEdgePositionSettings((prev) => ({
                          ...prev,
                          fromSide: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Heading Selector */}
                <div className="flex justify-center pt-2">
                  <RadialHeadingSelector
                    heading={edgePositionSettings.heading}
                    onChange={(heading) =>
                      setEdgePositionSettings((prev) => ({
                        ...prev,
                        heading,
                      }))
                    }
                    size={100}
                  />
                </div>

                {/* Apply Position Button */}
                <button
                  onClick={async () => {
                    if (positionPreview) {
                      try {
                        if (onResetTelemetry) {
                          await onResetTelemetry(false);
                        }

                        setRobotPosition(positionPreview);
                        // Save the current settings as the last position for reset
                        setLastPositionSettings({
                          side: edgePositionSettings.side,
                          fromBottom: edgePositionSettings.fromBottom,
                          fromSide: edgePositionSettings.fromSide,
                          heading: edgePositionSettings.heading,
                        });
                      } catch (error) {
                        console.error(
                          "Failed to start new telemetry path before setting position:",
                          error
                        );
                        // Continue with position setting even if telemetry path start fails
                        setRobotPosition(positionPreview);
                        setLastPositionSettings({
                          side: edgePositionSettings.side,
                          fromBottom: edgePositionSettings.fromBottom,
                          fromSide: edgePositionSettings.fromSide,
                          heading: edgePositionSettings.heading,
                        });
                      }
                      telemetryHistory.startNewPath();
                    }
                    setIsSettingPosition(false);
                  }}
                  className="w-full px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
                >
                  ✓ Apply Position{" "}
                  {positionPreview &&
                    `(${Math.round(positionPreview.x)}mm, ${Math.round(positionPreview.y)}mm)`}
                </button>

                {/* Quick-Set Buttons - Instantly apply position with telemetry reset */}
                <div className="flex gap-1">
                  <button
                    onClick={async () => {
                      // Quick-set to bottom left position
                      try {
                        if (onResetTelemetry) {
                          await onResetTelemetry(false);
                        }

                        const bottomLeftPosition =
                          calculateRobotPositionFromEdges("left", 0, 0, 0);
                        setRobotPosition(bottomLeftPosition);
                        // Save the position settings for reset button
                        setLastPositionSettings({
                          side: "left",
                          fromBottom: 0,
                          fromSide: 0,
                          heading: 0,
                        });

                        // Close the position setting interface
                        setIsSettingPosition(false);
                      } catch (error) {
                        console.error(
                          "Failed to set bottom left position:",
                          error
                        );
                        // Continue with position setting even if telemetry path start fails
                        const bottomLeftPosition =
                          calculateRobotPositionFromEdges("left", 0, 0, 0);
                        setRobotPosition(bottomLeftPosition);
                        setLastPositionSettings({
                          side: "left",
                          fromBottom: 0,
                          fromSide: 0,
                          heading: 0,
                        });
                        setIsSettingPosition(false);
                      }

                      // Start a new telemetry path (preserving history)
                      telemetryHistory.startNewPath();
                    }}
                    className="flex-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
                  >
                    ↙️ Bottom Left
                  </button>
                  <button
                    onClick={async () => {
                      // Quick-set to bottom right position
                      try {
                        if (onResetTelemetry) {
                          await onResetTelemetry(false);
                        }

                        const bottomRightPosition =
                          calculateRobotPositionFromEdges("right", 0, 0, 0);
                        setRobotPosition(bottomRightPosition);
                        // Save the position settings for reset button
                        setLastPositionSettings({
                          side: "right",
                          fromBottom: 0,
                          fromSide: 0,
                          heading: 0,
                        });

                        // Close the position setting interface
                        setIsSettingPosition(false);
                      } catch (error) {
                        console.error(
                          "Failed to set bottom right position:",
                          error
                        );
                        // Continue with position setting even if telemetry path start fails
                        const bottomRightPosition =
                          calculateRobotPositionFromEdges("right", 0, 0, 0);
                        setRobotPosition(bottomRightPosition);
                        setLastPositionSettings({
                          side: "right",
                          fromBottom: 0,
                          fromSide: 0,
                          heading: 0,
                        });
                        setIsSettingPosition(false);
                      }

                      // Start a new telemetry path (preserving history)
                      telemetryHistory.startNewPath();
                    }}
                    className="flex-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
                  >
                    ↘️ Bottom Right
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Control Mode Toggle - Only visible for real robots when hub program is running */}
          {(robotType === "virtual" ||
            (robotType === "real" && isProgramRunning)) && (
            <ControlModeToggle
              controlMode={controlMode}
              setControlMode={setControlMode}
              onEnterSplineMode={() => enterSplinePathMode()}
              onExitSplineMode={exitSplinePathMode}
            />
          )}

          {/* Manual Controls (Step/Hold modes) - Only visible for virtual robots or real robots when hub program is running */}
          {controlMode !== "spline" &&
            (robotType === "virtual" ||
              (robotType === "real" && isProgramRunning)) && (
              <div>
                <ManualControls
                  controlMode={controlMode}
                  distance={distance}
                  setDistance={setDistance}
                  angle={angle}
                  setAngle={setAngle}
                  driveSpeed={driveSpeed}
                  setDriveSpeed={setDriveSpeed}
                  executingCommand={executingCommand}
                  isFullyConnected={isFullyConnected}
                  onUpdatePreview={updatePreview}
                  onUpdateDualPreview={updateDualPreview}
                  onSendStepDrive={sendStepDrive}
                  onSendStepTurn={sendStepTurn}
                  onStartContinuousDrive={startContinuousDrive}
                  onStopContinuousDrive={stopContinuousDrive}
                  onStartContinuousTurn={startContinuousTurn}
                  onStopContinuousTurn={stopContinuousTurn}
                  onSendStop={sendStop}
                  onStopExecutingCommand={stopExecutingCommand}
                  showGridOverlay={showGridOverlay}
                  setShowGridOverlay={setShowGridOverlay}
                  showTrajectoryOverlay={showTrajectoryOverlay}
                  setShowTrajectoryOverlay={setShowTrajectoryOverlay}
                />

                {/* Motor Controls */}
                <MotorControls
                  controlMode={controlMode}
                  availableMotors={availableMotors}
                  motorSpeed={motorSpeed}
                  setMotorSpeed={setMotorSpeed}
                  motorAngle={motorAngle}
                  setMotorAngle={setMotorAngle}
                  telemetryData={telemetryData}
                  onSendMotorCommand={sendMotorCommand}
                  onStartContinuousMotor={startContinuousMotor}
                  onStopContinuousMotor={stopContinuousMotor}
                />
              </div>
            )}

          {/* Spline Controls - Only visible for virtual robots or real robots when hub program is running */}
          {controlMode === "spline" &&
            (robotType === "virtual" ||
              (robotType === "real" && isProgramRunning)) && (
              <SplineControls
                currentSplinePath={currentSplinePath}
                splinePaths={splinePaths}
                onExecutePath={handleExecutePath}
                onExitSplineMode={exitSplinePathMode}
              />
            )}
        </div>
      </div>

      {/* Hub Menu Interface */}
      {hubMenuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Hub Control</h3>
              <button
                onClick={() => setHubMenuOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <HubMenuInterface />
          </div>
        </div>
      )}
    </div>
  );
}
