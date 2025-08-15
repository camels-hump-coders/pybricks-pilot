import { drawRobot, type RobotPosition, type MovementDirection, type RobotPreviewType, type RobotDrawingUtils } from "./robotDrawing";
import { drawTrajectoryProjection, drawNextMoveEndIndicator } from "./trajectoryDrawing";
import type { RobotConfig } from "../../schemas/RobotConfig";
import type { MovementPreview } from "../../store/atoms/gameMat";

interface PerpendicularPreview {
  show: boolean;
  hoveredButtonType?: "drive" | "turn";
  direction?: MovementDirection;
  positions?: RobotPosition[];
  trajectories?: RobotPosition[][];
}

interface MovementPreviewDrawingProps {
  movementPreview: MovementPreview | null;
  currentPosition: RobotPosition | null;
  controlMode: "incremental" | "continuous";
  robotConfig: RobotConfig;
  utils: RobotDrawingUtils;
}

/**
 * Draw movement preview robots and trajectories
 */
export function drawMovementPreview(
  ctx: CanvasRenderingContext2D,
  movementPreview: MovementPreview | null,
  currentPosition: RobotPosition | null,
  controlMode: "incremental" | "continuous",
  robotConfig: RobotConfig,
  utils: RobotDrawingUtils
) {
  if (
    !movementPreview?.positions ||
    !movementPreview.type ||
    !movementPreview.direction ||
    controlMode !== "incremental" ||
    !currentPosition ||
    currentPosition.x <= 0 ||
    currentPosition.y <= 0
  ) {
    return;
  }

  // Draw primary preview robot
  if (movementPreview.positions.primary) {
    drawRobot(
      ctx,
      movementPreview.positions.primary,
      robotConfig,
      utils,
      true,
      "primary",
      movementPreview.direction
    );
  }

  // Draw secondary preview robot
  if (movementPreview.positions.secondary) {
    // Determine the opposite direction for secondary preview
    let oppositeDirection: MovementDirection;
    if (movementPreview.type === "drive") {
      oppositeDirection =
        movementPreview.direction === "forward" ? "backward" : "forward";
    } else {
      oppositeDirection =
        movementPreview.direction === "left" ? "right" : "left";
    }
    drawRobot(
      ctx,
      movementPreview.positions.secondary,
      robotConfig,
      utils,
      true,
      "secondary",
      oppositeDirection
    );
  }

  // Draw trajectory projection path
  if (movementPreview.trajectoryProjection?.trajectoryPath) {
    // Draw very subtle next move end indicator first
    if (movementPreview.trajectoryProjection.nextMoveEnd) {
      drawNextMoveEndIndicator(
        ctx,
        movementPreview.trajectoryProjection.nextMoveEnd,
        movementPreview.direction,
        robotConfig,
        utils
      );
    }

    // Then draw the trajectory path
    drawTrajectoryProjection(
      ctx,
      movementPreview.trajectoryProjection.trajectoryPath,
      movementPreview.direction,
      utils
    );
  }

  // Draw secondary trajectory projection if available
  if (
    movementPreview.secondaryTrajectoryProjection?.trajectoryPath &&
    movementPreview.positions.secondary
  ) {
    // Determine the opposite direction for secondary trajectory
    let oppositeDirection: MovementDirection;
    if (movementPreview.type === "drive") {
      oppositeDirection =
        movementPreview.direction === "forward" ? "backward" : "forward";
    } else {
      oppositeDirection =
        movementPreview.direction === "left" ? "right" : "left";
    }

    // Draw very subtle next move end indicator for secondary trajectory
    if (movementPreview.secondaryTrajectoryProjection.nextMoveEnd) {
      drawNextMoveEndIndicator(
        ctx,
        movementPreview.secondaryTrajectoryProjection.nextMoveEnd,
        oppositeDirection,
        robotConfig,
        utils
      );
    }

    // Draw the secondary trajectory path
    drawTrajectoryProjection(
      ctx,
      movementPreview.secondaryTrajectoryProjection.trajectoryPath,
      oppositeDirection,
      utils
    );
  }
}

/**
 * Draw perpendicular preview trajectories - show ALL movement options when hovering over stop button
 */
export function drawPerpendicularPreview(
  ctx: CanvasRenderingContext2D,
  perpendicularPreview: PerpendicularPreview,
  robotConfig: RobotConfig,
  utils: RobotDrawingUtils
) {
  if (
    !perpendicularPreview.show ||
    !perpendicularPreview.hoveredButtonType ||
    !perpendicularPreview.positions ||
    !perpendicularPreview.trajectories
  ) {
    return;
  }

  // Draw perpendicular preview robots for each direction
  perpendicularPreview.positions.forEach((position, index) => {
    // Map index to direction based on button type
    let direction: MovementDirection;
    if (perpendicularPreview.hoveredButtonType === "drive") {
      direction = index === 0 ? "forward" : "backward";
    } else {
      direction = index === 0 ? "left" : "right";
    }

    drawRobot(
      ctx,
      position,
      robotConfig,
      utils,
      true,
      "perpendicular",
      direction
    );
  });

  // Draw perpendicular trajectory projections
  perpendicularPreview.trajectories.forEach((trajectory, index) => {
    // Map index to direction based on button type
    let direction: MovementDirection;
    if (perpendicularPreview.hoveredButtonType === "drive") {
      direction = index === 0 ? "forward" : "backward";
    } else {
      direction = index === 0 ? "left" : "right";
    }

    drawTrajectoryProjection(
      ctx,
      trajectory,
      direction,
      utils
    );
  });
}

/**
 * Draw movement planning ghost robot
 */
export function drawMovementPlanningGhost(
  ctx: CanvasRenderingContext2D,
  movementPlanningGhostPosition: RobotPosition | null,
  robotConfig: RobotConfig,
  utils: RobotDrawingUtils
) {
  if (!movementPlanningGhostPosition) {
    return;
  }

  drawRobot(
    ctx,
    movementPlanningGhostPosition,
    robotConfig,
    utils,
    true,
    "planning"
  );
}