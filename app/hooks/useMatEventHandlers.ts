import { useCallback } from "react";
import { useJotaiGameMat } from "./useJotaiGameMat";

interface CanvasUtils {
  canvasToMm: (canvasX: number, canvasY: number) => { x: number; y: number };
  mmToCanvas: (x: number, y: number) => { x: number; y: number };
  scale: number;
}

export function useMatEventHandlers(canvasUtils: CanvasUtils) {
  const {
    robotPosition,
    isMouseMovementPlanningMode,
    updateMouseMovementGhost,
    exitMouseMovementPlanningMode,
    calculateMovementCommands,
  } = useJotaiGameMat();

  const { canvasToMm, mmToCanvas } = canvasUtils;

  /**
   * Check if a point is within the robot bounds
   */
  const isPointInRobot = useCallback((mouseX: number, mouseY: number, robotPos: { x: number; y: number }) => {
    const robotCanvasPos = mmToCanvas(robotPos.x, robotPos.y);
    const distance = Math.sqrt(
      Math.pow(mouseX - robotCanvasPos.x, 2) + Math.pow(mouseY - robotCanvasPos.y, 2)
    );
    return distance <= 50; // 50px radius for click detection
  }, [mmToCanvas]);

  /**
   * Handle canvas click events
   */
  const handleCanvasClick = useCallback(async (
    event: React.MouseEvent<HTMLCanvasElement>,
    robotIsConnected: boolean,
    sendTurnCommand: (angle: number, speed: number) => Promise<void>,
    sendDriveCommand: (distance: number, speed: number) => Promise<void>,
    waitForDesiredHeading: (targetHeading: number) => Promise<void>
  ) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Convert to mat coordinates
    const matCoords = canvasToMm(mouseX, mouseY);

    // Check if clicking on robot to enter planning mode
    if (!isMouseMovementPlanningMode && isPointInRobot(mouseX, mouseY, robotPosition)) {
      // enterMouseMovementPlanningMode();
      return;
    }

    // If in planning mode, execute movement commands
    if (isMouseMovementPlanningMode) {
      const commands = calculateMovementCommands(matCoords.x, matCoords.y);
      
      // Store movement commands for debugging
      console.log("Movement commands:", {
        commands,
      });

      // Execute movement commands (turn then drive)
      if (robotIsConnected && commands.turnAngle !== 0) {
        try {
          // Send turn command first
          await sendTurnCommand(commands.turnAngle, 100); // 100 deg/s speed

          // Wait for robot to reach desired heading and maintain it
          await waitForDesiredHeading(commands.targetHeading);

          if (commands.driveDistance > 5) {
            // Only drive if distance is meaningful
            await sendDriveCommand(commands.driveDistance, 200); // 200 mm/s speed
          }
        } catch (error) {
          console.error("Failed to execute movement commands:", error);
        }
      } else if (robotIsConnected && commands.driveDistance > 5) {
        // Just drive if no turn needed
        try {
          await sendDriveCommand(commands.driveDistance, 200);
        } catch (error) {
          console.error("Failed to execute drive command:", error);
        }
      }

      // Exit planning mode after executing commands
      exitMouseMovementPlanningMode();
    }
  }, [
    canvasToMm,
    isMouseMovementPlanningMode,
    isPointInRobot,
    robotPosition,
    calculateMovementCommands,
    exitMouseMovementPlanningMode,
  ]);

  /**
   * Handle canvas mouse move events
   */
  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseMovementPlanningMode) return;

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Convert to mat coordinates
    const matCoords = canvasToMm(mouseX, mouseY);
    updateMouseMovementGhost(matCoords.x, matCoords.y);
  }, [canvasToMm, isMouseMovementPlanningMode, updateMouseMovementGhost]);

  /**
   * Handle mouse leave to cancel planning mode
   */
  const handleCanvasMouseLeave = useCallback(() => {
    if (isMouseMovementPlanningMode) {
      exitMouseMovementPlanningMode();
    }
  }, [isMouseMovementPlanningMode, exitMouseMovementPlanningMode]);

  return {
    handleCanvasClick,
    handleCanvasMouseMove,
    handleCanvasMouseLeave,
    isPointInRobot,
  };
}