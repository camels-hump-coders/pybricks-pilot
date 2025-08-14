import { atom } from "jotai";
import type { GameMatConfig } from "../../schemas/GameMatConfig";
import type { RobotConfig } from "../../schemas/RobotConfig";
import { DEFAULT_ROBOT_CONFIG, studsToMm } from "../../schemas/RobotConfig";

export interface RobotPosition {
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top edge, positive = downward)
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
}

export interface MovementPreview {
  type: "drive" | "turn" | null;
  direction: "forward" | "backward" | "left" | "right" | null;
  positions: {
    primary: RobotPosition | null;
    secondary: RobotPosition | null;
  };
  // New: trajectory projection showing where robot will end up after next move
  // and extending to the end of the board for alignment visualization
  trajectoryProjection?: {
    nextMoveEnd: RobotPosition | null; // Where robot will be after next move
    boardEndProjection: RobotPosition | null; // Extended projection to board edge
    trajectoryPath: RobotPosition[]; // Path points for the trajectory line
  };
  // New: secondary trajectory projection for showing both options when hovering over sliders
  secondaryTrajectoryProjection?: {
    nextMoveEnd: RobotPosition | null;
    boardEndProjection: RobotPosition | null;
    trajectoryPath: RobotPosition[];
  };
}

export interface ObjectiveState {
  completed: boolean;
  points: number;
  selectedChoiceId?: string;
}

export interface ScoringState {
  [objectId: string]: {
    objectives: {
      [objectiveId: string]: ObjectiveState;
    };
  };
}

// Mat dimensions constants
const MAT_WIDTH_MM = 2356; // Official FLL mat width
const MAT_HEIGHT_MM = 1137; // Official FLL mat height

// Grid overlay state
export const showGridOverlayAtom = atom<boolean>(false);

// Helper functions for robot positioning
export const calculateRobotPosition = (
  robotConfig: RobotConfig,
  position: "bottom-right" | "bottom-left" | "center"
): RobotPosition => {
  const robotWidthMm = studsToMm(robotConfig.dimensions.width);
  const robotLengthMm = studsToMm(robotConfig.dimensions.length);
  const centerOfRotationFromLeftMm = studsToMm(robotConfig.centerOfRotation.distanceFromLeftEdge);
  const centerOfRotationFromTopMm = studsToMm(robotConfig.centerOfRotation.distanceFromTop);

  // SIMPLIFIED MODEL: Position represents the center of rotation, not robot body center
  // For edge positions, we want the robot's physical edge to be flush against the mat edge
  // We need to calculate where to place the center of rotation to achieve this

  switch (position) {
    case "bottom-right":
      return {
        // Place center of rotation such that right edge of robot body is flush with mat right edge
        x: MAT_WIDTH_MM - (robotWidthMm - centerOfRotationFromLeftMm),
        // Place center of rotation such that bottom edge of robot body is flush with mat bottom edge
        y: MAT_HEIGHT_MM - (robotLengthMm - centerOfRotationFromTopMm),
        heading: 0, // Facing north (forward)
      };
    case "bottom-left":
      return {
        // Place center of rotation such that left edge of robot body is flush with mat left edge
        x: centerOfRotationFromLeftMm,
        // Place center of rotation such that bottom edge of robot body is flush with mat bottom edge
        y: MAT_HEIGHT_MM - (robotLengthMm - centerOfRotationFromTopMm),
        heading: 0, // Facing north (forward)
      };
    case "center":
      return {
        x: MAT_WIDTH_MM / 2, // Center of mat width
        y: MAT_HEIGHT_MM / 2, // Center of mat height
        heading: 0, // Facing north (forward)
      };
    default:
      // Default to bottom-right
      return {
        x: MAT_WIDTH_MM - (robotWidthMm - centerOfRotationFromLeftMm),
        y: MAT_HEIGHT_MM - (robotLengthMm - centerOfRotationFromTopMm),
        heading: 0,
      };
  }
};

// Robot position atoms
export const robotPositionAtom = atom<RobotPosition>(
  calculateRobotPosition(DEFAULT_ROBOT_CONFIG, "bottom-right")
);

export const isSettingPositionAtom = atom<boolean>(false);
export const mousePositionAtom = atom<RobotPosition | null>(null);
export const manualHeadingAdjustmentAtom = atom<number>(0);

// Telemetry reference for tracking robot movement
export const telemetryReferenceAtom = atom<{
  distance: number;
  angle: number;
  position: RobotPosition;
} | null>(null);

// Game mat configuration atoms
export const customMatConfigAtom = atom<GameMatConfig | null>(null);
export const scoringStateAtom = atom<ScoringState>({});
export const totalScoreAtom = atom<number>(0);

// Movement preview atom
export const movementPreviewAtom = atom<MovementPreview | null>(null);

// Perpendicular motion preview atom - for showing opposite motion during active movement
export const perpendicularPreviewAtom = atom<{
  show: boolean;
  activeMovementType: "drive" | "turn" | null;
  hoveredButtonType: "drive" | "turn" | null;
  hoveredDirection: "forward" | "backward" | "left" | "right" | null;
  distance: number;
  angle: number;
}>({
  show: false,
  activeMovementType: null,
  hoveredButtonType: null,
  hoveredDirection: null,
  distance: 100,
  angle: 45,
});

// Path visualization atoms
export const showPathAtom = atom<boolean>(true);
export const pathColorModeAtom = atom<"time" | "speed" | "heading">("time");
export const pathOpacityAtom = atom<number>(0.7);
export const maxPathPointsAtom = atom<number>(1000);

// Control mode atom
export const controlModeAtom = atom<"incremental" | "continuous">(
  "incremental"
);

// Derived atoms
export const currentScoreAtom = atom((get) => {
  const scoringState = get(scoringStateAtom);
  const matConfig = get(customMatConfigAtom);

  if (!matConfig?.missions) return 0;

  return matConfig.missions.reduce((total, mission) => {
    const missionState = scoringState[mission.id];
    if (!missionState?.objectives) return total;

    return (
      total +
      Object.values(missionState.objectives).reduce((sum, objState) => {
        return sum + (objState.completed ? objState.points : 0);
      }, 0)
    );
  }, 0);
});

// Action atoms
export const setRobotPositionAtom = atom(
  null,
  (get, set, position: RobotPosition) => {
    set(robotPositionAtom, position);
    // Reset telemetry reference when manually setting position
    set(telemetryReferenceAtom, {
      distance: 0,
      angle: 0,
      position,
    });
  }
);

export const updateScoringAtom = atom(
  null,
  (
    get,
    set,
    update: { missionId: string; objectiveId: string; state: ObjectiveState }
  ) => {
    const currentState = get(scoringStateAtom);
    set(scoringStateAtom, {
      ...currentState,
      [update.missionId]: {
        ...currentState[update.missionId],
        objectives: {
          ...currentState[update.missionId]?.objectives,
          [update.objectiveId]: update.state,
        },
      },
    });
  }
);

export const resetScoringAtom = atom(null, (get, set) => {
  set(scoringStateAtom, {});
  set(totalScoreAtom, 0);
});
