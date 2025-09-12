import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useJotaiGameMat } from "../hooks/useJotaiGameMat";
import { missionRecorder } from "../services/missionRecorder";
import type { TelemetryData } from "../services/pybricksHub";
import { telemetryHistory } from "../services/telemetryHistory";
import { missionFeatureEnabledAtom } from "../store/atoms/featureFlags";
import {
  type PerpendicularPreviewGhost,
  perpendicularPreviewAtom,
  robotPositionAtom,
  showGridOverlayAtom,
  showTrajectoryOverlayAtom,
} from "../store/atoms/gameMat";
import { isUploadingProgramAtom } from "../store/atoms/hubConnection";
import { isProgramRunningAtom } from "../store/atoms/programRunning";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import type { PythonFile } from "../types/fileSystem";
import type { StepCommand } from "../types/missionRecorder";
import type { RobotPosition } from "../utils/robotPosition";
import { ControlModeToggle } from "./ControlModeToggle";
import { ManualControls } from "./ManualControls";
import { MissionControls } from "./MissionControls";
import { MissionRecorderControls } from "./MissionRecorderControls";
import { MotorControls } from "./MotorControls";
import {
  calculatePreviewPosition,
  calculateTrajectoryProjection,
} from "./MovementPreview";
import { PositionControls } from "./PositionControls";
import { ProgramControls } from "./ProgramControls";

interface CompactRobotControllerProps {
  onDriveCommand?: (direction: number, speed: number) => Promise<void>;
  onTurnCommand?: (angle: number, speed: number) => Promise<void>;
  onStopCommand?: () => Promise<void>;
  onContinuousDriveCommand?: (speed: number, turnRate: number) => Promise<void>;
  onArcCommand?: (radius: number, angle: number, speed: number) => Promise<void>;
  onMotorCommand?: (
    motor: string,
    angle: number,
    speed: number,
  ) => Promise<void>;
  onContinuousMotorCommand?: (motor: string, speed: number) => Promise<void>;
  onMotorStopCommand?: (motor: string) => Promise<void>;
  onExecuteCommandSequence?: (commands: StepCommand[]) => Promise<void>;
  telemetryData?: TelemetryData;
  isConnected: boolean;
  className?: string;
  // Robot position now comes from Jotai atoms
  robotType?: "real" | "virtual" | null;
  onResetTelemetry?: (startNewPath?: boolean) => Promise<void>;
  // Program control props
  onStopProgram?: () => Promise<void>;
  onUploadAndRunFile?: (
    file: PythonFile,
    content: string,
    allPrograms: PythonFile[],
  ) => Promise<void>;
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

interface ExecutingCommand {
  type: "drive" | "turn" | "arc";
  direction: "forward" | "backward" | "left" | "right";
  isBackward?: boolean; // for arcs: true when traversing arc backward
  originalParams: {
    distance?: number;
    angle?: number; // for turn or arc sweep
    radius?: number; // for arc
    speed: number;
  };
}

export function CompactRobotController({
  onDriveCommand,
  onTurnCommand,
  onStopCommand,
  onContinuousDriveCommand,
  onArcCommand,
  onMotorCommand,
  onContinuousMotorCommand,
  onMotorStopCommand,
  onExecuteCommandSequence: _onExecuteCommandSequence,
  telemetryData,
  isConnected,
  className = "",
  robotType = "real",
  onResetTelemetry,
  onStopProgram,
  onUploadAndRunFile,
  onPreviewUpdate,
}: CompactRobotControllerProps) {
  // State
  const [distance, setDistance] = useState(100);
  const [angle, setAngle] = useState(45);
  const [driveSpeed, setDriveSpeed] = useState(100);
  const [arcRadius, setArcRadius] = useState(100);
  const [motorSpeed, setMotorSpeed] = useState(100);
  const [motorAngle, setMotorAngle] = useState(45);
  const [executingCommand, setExecutingCommand] =
    useState<ExecutingCommand | null>(null);
  const [activeMotor, setActiveMotor] = useState<string | null>(null);

  // Refs
  const commandChainRef = useRef<Promise<void>>(Promise.resolve());

  // Atoms
  const robotConfig = useAtomValue(robotConfigAtom);
  const currentRobotPosition = useAtomValue(robotPositionAtom);
  const isProgramRunning = useAtomValue(isProgramRunningAtom);
  const isUploadingProgram = useAtomValue(isUploadingProgramAtom);
  const [showGridOverlay, setShowGridOverlay] = useAtom(showGridOverlayAtom);
  const [showTrajectoryOverlay, setShowTrajectoryOverlay] = useAtom(
    showTrajectoryOverlayAtom,
  );
  const [perpendicularPreview, setPerpendicularPreview] = useAtom(
    perpendicularPreviewAtom,
  );

  // Game mat state
  const { controlMode, setControlMode } = useJotaiGameMat();

  // Effect to initialize trajectory overlay when enabled
  useEffect(() => {
    if (showTrajectoryOverlay) {
      // Just enable the trajectory overlay - let the distance/angle effect handle the ghosts
    }
  }, [showTrajectoryOverlay]); // Only depend on the toggle, not position or config

  // Effect to update trajectory overlay ghosts when distance/angle changes
  useEffect(() => {
    // Only apply trajectory overlay when in Step mode (incremental) AND the toggle is enabled
    if (
      showTrajectoryOverlay &&
      controlMode === "incremental" &&
      currentRobotPosition &&
      robotConfig
    ) {
      // Only update if there are no hover ghosts currently
      setPerpendicularPreview((prev) => {
        const hasHoverGhosts = prev.ghosts.some((g) => g.isHover);
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
          robotConfig,
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
          robotConfig,
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
          robotConfig,
        );
        const leftTurnThenForward = calculatePreviewPosition(
          leftTurnPosition || currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig,
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
          robotConfig,
        );
        const rightTurnThenForward = calculatePreviewPosition(
          rightTurnPosition || currentRobotPosition,
          distance,
          angle,
          "drive",
          "forward",
          robotConfig,
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

        // Arc previews (all four, computed from distance as arc length and arcRadius)
        const radius = arcRadius;
        const sweepDeg = (distance / Math.max(1, radius)) * (180 / Math.PI);

        const arcFL = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          sweepDeg,
          "arc",
          "left",
          robotConfig,
          { radius },
        );
        const arcFR = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          sweepDeg,
          "arc",
          "right",
          robotConfig,
          { radius },
        );
        const arcBL = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          sweepDeg,
          "arc",
          "left",
          robotConfig,
          { radius, isArcBackward: true },
        );
        const arcBR = calculatePreviewPosition(
          currentRobotPosition,
          distance,
          sweepDeg,
          "arc",
          "right",
          robotConfig,
          { radius, isArcBackward: true },
        );

        if (arcFL)
          ghosts.push({
            position: arcFL,
            type: "arc" as const,
            direction: "left" as const,
            color: "#84cc16", // lime-500 forward-left
            label: `⤴↶ r${radius} ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        if (arcFR)
          ghosts.push({
            position: arcFR,
            type: "arc" as const,
            direction: "right" as const,
            color: "#3b82f6", // blue-500 forward-right
            label: `⤴↷ r${radius} ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        if (arcBL)
          ghosts.push({
            position: arcBL,
            type: "arc" as const,
            direction: "left" as const,
            color: "#ec4899", // pink-500 backward-left
            label: `⤵↶ r${radius} ${distance}mm`,
            isTrajectoryOverlay: true,
          });
        if (arcBR)
          ghosts.push({
            position: arcBR,
            type: "arc" as const,
            direction: "right" as const,
            color: "#f43f5e", // rose-500 backward-right
            label: `⤵↷ r${radius} ${distance}mm`,
            isTrajectoryOverlay: true,
          });

        return {
          show: true,
          ghosts: ghosts,
          distance: distance,
          angle: angle,
          radius: arcRadius,
        };
      });
    }
  }, [
    distance,
    angle,
    arcRadius,
    showTrajectoryOverlay,
    controlMode,
    currentRobotPosition,
    robotConfig, // Only update if there are no hover ghosts currently
    setPerpendicularPreview,
  ]);

  // Separate effect to clear trajectory overlay when disabled OR when not in Step mode
  useEffect(() => {
    if (!showTrajectoryOverlay || controlMode !== "incremental") {
      // Only clear if the current ghosts are trajectory overlay ghosts
      setPerpendicularPreview((prev) => {
        // If all current ghosts are trajectory overlay ghosts, clear them
        const hasOnlyTrajectoryGhosts = prev.ghosts.every(
          (ghost) => ghost.isTrajectoryOverlay === true,
        );
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
  }, [
    showTrajectoryOverlay,
    controlMode,
    distance,
    angle, // Only clear if the current ghosts are trajectory overlay ghosts
    setPerpendicularPreview,
  ]);

  // For virtual robots, manual controls should work when connected regardless of program status
  // For real robots, manual controls work when connected and hub menu program is running
  const isFullyConnected =
    isConnected &&
    !isUploadingProgram &&
    (robotType === "virtual" || isProgramRunning);

  // Available motors (exclude drivebase motors)
  const availableMotors = telemetryData?.motors
    ? Object.keys(telemetryData.motors).filter(
        (name) => !["left", "right"].includes(name),
      )
    : [];

  // Helper functions for continuous control
  function queueCommand(commandFn: () => Promise<void>) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded",
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

  // Helper to compute turn rate for an arc (deg/s)
  function computeTurnRate(speedMmPerS: number, radiusMm: number, left: boolean) {
    const rate = (speedMmPerS / Math.max(1, radiusMm)) * (180 / Math.PI);
    return left ? -rate : rate; // negative for left, positive for right
  }

  async function sendStepDrive(distance: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded",
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
      missionRecorder.record({
        type: "drive",
        distance,
        speed,
      });
    } finally {
      setExecutingCommand(null);
    }
  }

  async function sendStepTurn(angle: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded",
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
      missionRecorder.record({
        type: "turn",
        angle,
        speed,
      });
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

  // Step arc command (discrete)
  async function sendStepArc(
    forward: boolean,
    left: boolean,
    _sweepAngle: number,
    speedPct: number,
  ) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded",
      );
      return;
    }

    const speedMmPerS = speedPct * 10;
    // Compute sweep from configured distance and radius
    const sweepAngle = (distance / Math.max(1, arcRadius)) * (180 / Math.PI);
    const base = Math.abs(sweepAngle);
    // Map sign per backend so virtual forward left/right match previews
    // real: +(right), -(left); virtual: +(right), -(left)
    const angleDeg = left ? -base : +base;

    try {
      setExecutingCommand({
        type: "arc",
        direction: left ? "left" : "right",
        isBackward: !forward,
        originalParams: {
          speed: speedPct,
          radius: arcRadius,
          angle: angleDeg,
          distance: distance,
        },
      });

      if (forward && onArcCommand) {
        await onArcCommand(arcRadius, angleDeg, speedMmPerS);
      } else {
        // Emulate arc with continuous drive + timed stop
        const signedSpeed = forward ? speedMmPerS : -speedMmPerS;
        let turnRate = computeTurnRate(Math.abs(signedSpeed), arcRadius, left);
        if (!forward) turnRate = -turnRate;
        const arcLength = Math.abs(distance);
        const durationMs = Math.max(
          10,
          Math.round((arcLength / Math.max(1, Math.abs(speedMmPerS))) * 1000),
        );
        if (_onExecuteCommandSequence) {
          await _onExecuteCommandSequence([
            { action: "drive_continuous", speed: signedSpeed, turn_rate: turnRate },
            { action: "pause", duration: durationMs },
            { action: "stop" },
          ] as any);
        } else {
          await queueCommand(async () => {
            await onContinuousDriveCommand?.(signedSpeed, turnRate);
            await new Promise((r) => setTimeout(r, durationMs));
            await onStopCommand?.();
          });
        }
      }
    } finally {
      setExecutingCommand(null);
    }
  }

  function sendStop() {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded",
      );
      return;
    }
    onStopCommand?.();
  }

  function sendMotorCommand(motorName: string, angle: number, speed: number) {
    if (!isFullyConnected) {
      console.warn(
        "Robot controls disabled: Hub not connected or control code not loaded",
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

  // Continuous arc controls (hold mode)
  function startContinuousArc(forward: boolean, left: boolean) {
    if (controlMode !== "continuous") return;
    const speedMmPerS = (forward ? 1 : -1) * driveSpeed * 10;
    let turnRate = computeTurnRate(Math.abs(speedMmPerS), arcRadius, left);
    if (!forward) turnRate = -turnRate; // keep ICC on same side when moving backward
    sendContinuousMovement(speedMmPerS, turnRate);
  }

  function stopContinuousArc() {
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
    type: "drive" | "turn" | "arc",
    overrideDistance?: number,
    overrideAngle?: number,
    overrideRadius?: number,
  ) {
    if (onPreviewUpdate && currentRobotPosition) {
      const currentDistance = overrideDistance ?? distance;
      const currentAngle = overrideAngle ?? angle;
      const currentRadius = overrideRadius ?? arcRadius;

      if (type === "drive") {
        // Show both forward and backward previews for drive
        const forwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "forward",
          robotConfig,
        );
        const backwardPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "backward",
          robotConfig,
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
          robotConfig,
        );
        const backwardTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "drive",
          "backward",
          2356,
          1137,
          robotConfig,
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
          robotConfig,
        );
        const rightPosition = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "right",
          robotConfig,
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
          robotConfig,
        );
        const rightTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          currentAngle,
          "turn",
          "right",
          2356,
          1137,
          robotConfig,
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
      } else if (type === "arc") {
        // Show both left and right arc previews (forward arcs)
        const sweepDeg =
          (currentDistance / Math.max(1, currentRadius)) * (180 / Math.PI);
        const leftArcEnd = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          sweepDeg,
          "arc",
          "left",
          robotConfig,
          { radius: currentRadius },
        );
        const rightArcEnd = calculatePreviewPosition(
          currentRobotPosition,
          currentDistance,
          sweepDeg,
          "arc",
          "right",
          robotConfig,
          { radius: currentRadius },
        );

        const leftTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          sweepDeg,
          "arc",
          "left",
          2356,
          1137,
          robotConfig,
          { radius: currentRadius },
        );
        const rightTrajectory = calculateTrajectoryProjection(
          currentRobotPosition,
          currentDistance,
          sweepDeg,
          "arc",
          "right",
          2356,
          1137,
          robotConfig,
          { radius: currentRadius },
        );

        onPreviewUpdate({
          type: "arc",
          direction: "left",
          positions: {
            primary: leftArcEnd,
            secondary: rightArcEnd,
          },
          trajectoryProjection: leftTrajectory,
          secondaryTrajectoryProjection: rightTrajectory,
        });
      }
    }
  }

  function updatePreview(
    type: "drive" | "turn" | "arc" | null,
    direction: "forward" | "backward" | "left" | "right" | null,
    opts?: { radius?: number; isArcBackward?: boolean },
  ) {
    if (onPreviewUpdate && currentRobotPosition && type && direction) {
      const sweepDeg =
        type === "arc"
          ? (distance / Math.max(1, opts?.radius ?? arcRadius)) * (180 / Math.PI)
          : angle;

      const previewPosition = calculatePreviewPosition(
        currentRobotPosition,
        distance,
        sweepDeg,
        type,
        direction,
        robotConfig,
        { radius: opts?.radius ?? arcRadius, isArcBackward: opts?.isArcBackward },
      );

      const trajectoryProjection = calculateTrajectoryProjection(
        currentRobotPosition,
        distance,
        sweepDeg,
        type,
        direction,
        2356,
        1137,
        robotConfig,
        { radius: opts?.radius ?? arcRadius, isArcBackward: opts?.isArcBackward },
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
      const ghostPosition = previewPosition;

      // For turn previews, just show the turn (no forward movement)

      const hoverGhost: PerpendicularPreviewGhost & { isHover: true } = {
        position: ghostPosition,
        type,
        direction,
        color:
          type === "drive"
            ? direction === "forward"
              ? "#10b981"
              : "#f97316"
            : type === "turn"
              ? direction === "left"
                ? "#a855f7"
                : "#06b6d4"
              : direction === "left"
                ? opts?.isArcBackward
                  ? "#ec4899"
                  : "#84cc16"
                : opts?.isArcBackward
                  ? "#f43f5e"
                  : "#3b82f6",
        label:
          type === "drive"
            ? `${direction === "forward" ? "↑" : "↓"} ${distance}mm`
            : type === "turn"
              ? `${direction === "left" ? "↶" : "↷"} ${angle}°`
              : `${opts?.isArcBackward ? "⤵" : "⤴"} r${opts?.radius ?? arcRadius} ${direction === "left" ? "↶" : "↷"} ${angle}°`,
        isHover: true, // Mark this as a hover ghost for bolder rendering
        isBackward: opts?.isArcBackward,
      };

      // If trajectory overlay is on AND in Step mode, add the hover ghost to existing ghosts
      // Otherwise, just show the hover ghost
      if (showTrajectoryOverlay && controlMode === "incremental") {
        // Keep existing ghosts and add hover ghost with higher opacity
        const newPreview = {
          show: true,
          ghosts: [
            ...perpendicularPreview.ghosts.filter(
              (g: PerpendicularPreviewGhost) =>
                // Remove any previous hover ghost (identified by isHover flag)
                // Don't remove trajectory overlay ghosts, we want both turn ghosts visible
                !g.isHover,
            ),
            hoverGhost,
          ],
          distance: distance,
          angle: angle,
          radius: arcRadius,
        };
        setPerpendicularPreview(newPreview);
      } else {
        const newPreview = {
          show: true,
          ghosts: [hoverGhost],
          distance: distance,
          angle: angle,
          radius: arcRadius,
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
        setPerpendicularPreview((prev) => ({
          ...prev,
          ghosts: prev.ghosts.filter(
            (g: PerpendicularPreviewGhost) => !g.isHover,
          ),
        }));
      } else {
        // Clear all ghosts when not hovering and trajectory overlay is off
        setPerpendicularPreview({
          show: false,
          ghosts: [],
          distance: distance,
          angle: angle,
          radius: arcRadius,
        });
      }
    }
  }

  const missionFeatureEnabled = useAtomValue(missionFeatureEnabledAtom);

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

      {/* Main Controls */}
      <div className="p-3">
        <div className="space-y-3 sm:space-y-4">
          {/* Control Mode Toggle - Only visible for real robots when hub program is running */}
          <ControlModeToggle
            controlMode={controlMode}
            setControlMode={setControlMode}
            onEnterMissionMode={() => {
              // Disable overlays and clear hover ghosts when entering mission mode
              setShowGridOverlay(false);
              setShowTrajectoryOverlay(false);
              setPerpendicularPreview((prev) => ({
                ...prev,
                show: false,
                ghosts: [],
              }));
            }}
            onExitMissionMode={() => {
              // Clear any mission-related hover ghosts on exit
              setPerpendicularPreview((prev) => ({
                ...prev,
                show: false,
                ghosts: [],
              }));
            }}
          />

          {controlMode === "program" && (
            <ProgramControls
              onStopProgram={onStopProgram}
              onUploadAndRunFile={onUploadAndRunFile}
            />
          )}

          {/* Manual Controls (Step/Hold modes) - Only visible for virtual robots or real robots when hub program is running */}
          {(controlMode === "incremental" || controlMode === "continuous") &&
            (robotType === "virtual" ||
              (robotType === "real" && isProgramRunning)) && (
              <div>
                <ManualControls
                  controlMode={controlMode}
                  distance={distance}
                  setDistance={setDistance}
                  angle={angle}
                  setAngle={setAngle}
                  arcRadius={arcRadius}
                  setArcRadius={setArcRadius}
                  driveSpeed={driveSpeed}
                  setDriveSpeed={setDriveSpeed}
                  executingCommand={executingCommand}
                  onUpdatePreview={updatePreview}
                  onUpdateDualPreview={updateDualPreview}
                  onSendStepDrive={sendStepDrive}
                  onSendStepTurn={sendStepTurn}
                  onSendStepArc={(forward, left, sweep, speed) =>
                    sendStepArc(forward, left, sweep, speed)
                  }
                  onStartContinuousDrive={startContinuousDrive}
                  onStopContinuousDrive={stopContinuousDrive}
                  onStartContinuousTurn={startContinuousTurn}
                  onStopContinuousTurn={stopContinuousTurn}
                  onStartContinuousArc={startContinuousArc}
                  onStopContinuousArc={stopContinuousArc}
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

                {/* Mission Recorder */}
                {missionFeatureEnabled && (
                  <MissionRecorderControls
                    onDrive={sendStepDrive}
                    onTurn={sendStepTurn}
                  />
                )}
              </div>
            )}

          {/* Mission Controls - Only visible for virtual robots or real robots when hub program is running */}
          {controlMode === "mission" &&
            missionFeatureEnabled &&
            (robotType === "virtual" ||
              (robotType === "real" && isProgramRunning)) && (
              <MissionControls />
            )}

          {/* Position Control Buttons - moved to bottom */}
          <PositionControls onResetTelemetry={onResetTelemetry} />
        </div>
      </div>
    </div>
  );
}
