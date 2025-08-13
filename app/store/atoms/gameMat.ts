import { atom } from "jotai";
import type { GameMatConfig, Mission } from "../../schemas/GameMatConfig";

export interface RobotPosition {
  x: number; // mm from left edge of mat (0 = left edge)
  y: number; // mm from bottom edge of mat (0 = bottom edge, positive = upward)
  heading: number; // degrees, 0 = north/forward
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

// Robot position atoms
export const robotPositionAtom = atom<RobotPosition>({
  x: 2266, // Bottom right X position (mat width - robot width/2)
  y: 100, // Bottom edge + robot length/2 to keep robot on mat
  heading: 0, // Facing north (forward)
});

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

// Path visualization atoms
export const showPathAtom = atom<boolean>(true);
export const pathColorModeAtom = atom<"time" | "speed" | "heading">("time");
export const pathOpacityAtom = atom<number>(0.7);
export const maxPathPointsAtom = atom<number>(1000);

// Control mode atom
export const controlModeAtom = atom<"incremental" | "continuous">("incremental");

// Derived atoms
export const currentScoreAtom = atom((get) => {
  const scoringState = get(scoringStateAtom);
  const matConfig = get(customMatConfigAtom);
  
  if (!matConfig?.missions) return 0;
  
  return matConfig.missions.reduce((total, mission) => {
    const missionState = scoringState[mission.id];
    if (!missionState?.objectives) return total;
    
    return total + Object.values(missionState.objectives).reduce((sum, objState) => {
      return sum + (objState.completed ? objState.points : 0);
    }, 0);
  }, 0);
});

// Action atoms
export const setRobotPositionAtom = atom(null, (get, set, position: RobotPosition) => {
  set(robotPositionAtom, position);
  // Reset telemetry reference when manually setting position
  set(telemetryReferenceAtom, {
    distance: 0,
    angle: 0,
    position,
  });
});

export const updateScoringAtom = atom(
  null,
  (get, set, update: { missionId: string; objectiveId: string; state: ObjectiveState }) => {
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