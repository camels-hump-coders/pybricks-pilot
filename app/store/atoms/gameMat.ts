import { atom } from "jotai";
import type { GameMatConfig } from "../../schemas/GameMatConfig";
import type { RobotConfig } from "../../schemas/RobotConfig";
import { DEFAULT_ROBOT_CONFIG, studsToMm } from "../../schemas/RobotConfig";
import type { RobotPosition } from "../../utils/robotPosition";
import { robotConfigAtom } from "./robotConfigSimplified";

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

interface ScoringState {
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

// Trajectory overlay toggle state
export const showTrajectoryOverlayAtom = atom<boolean>(false);

// Helper functions for robot positioning
export const calculateRobotPositionWithDimensions = (
  robotConfig: RobotConfig,
  position: "bottom-right" | "bottom-left" | "center",
  matWidthMm: number = MAT_WIDTH_MM,
  matHeightMm: number = MAT_HEIGHT_MM,
): RobotPosition => {
  const robotWidthMm = studsToMm(robotConfig.dimensions.width);
  const robotLengthMm = studsToMm(robotConfig.dimensions.length);
  const centerOfRotationFromLeftMm = studsToMm(
    robotConfig.centerOfRotation.distanceFromLeftEdge,
  );
  const centerOfRotationFromTopMm = studsToMm(
    robotConfig.centerOfRotation.distanceFromTop,
  );

  // SIMPLIFIED MODEL: Position represents the center of rotation, not robot body center
  // For edge positions, we want the robot's physical edge to be flush against the mat edge
  // We need to calculate where to place the center of rotation to achieve this

  switch (position) {
    case "bottom-right":
      return {
        // Place center of rotation such that right edge of robot body is flush with mat right edge
        x: matWidthMm - (robotWidthMm - centerOfRotationFromLeftMm),
        // Place center of rotation such that bottom edge of robot body is flush with mat bottom edge
        y: matHeightMm - (robotLengthMm - centerOfRotationFromTopMm),
        heading: 0, // Facing north (forward)
      };
    case "bottom-left":
      return {
        // Place center of rotation such that left edge of robot body is flush with mat left edge
        x: centerOfRotationFromLeftMm,
        // Place center of rotation such that bottom edge of robot body is flush with mat bottom edge
        y: matHeightMm - (robotLengthMm - centerOfRotationFromTopMm),
        heading: 0, // Facing north (forward)
      };
    case "center":
      return {
        x: matWidthMm / 2, // Center of mat width
        y: matHeightMm / 2, // Center of mat height
        heading: 0, // Facing north (forward)
      };
    default:
      // Default to bottom-right
      return {
        x: matWidthMm - (robotWidthMm - centerOfRotationFromLeftMm),
        y: matHeightMm - (robotLengthMm - centerOfRotationFromTopMm),
        heading: 0,
      };
  }
};

// Backward compatibility function using hardcoded dimensions
export const calculateRobotPosition = (
  robotConfig: RobotConfig,
  position: "bottom-right" | "bottom-left" | "center",
): RobotPosition => {
  return calculateRobotPositionWithDimensions(
    robotConfig,
    position,
    MAT_WIDTH_MM,
    MAT_HEIGHT_MM,
  );
};

// Robot position atoms - derived atom that uses current mat and robot config
export const robotPositionAtom = atom<RobotPosition>(
  // Initial value using default dimensions
  calculateRobotPosition(DEFAULT_ROBOT_CONFIG, "bottom-right"),
);

// Derived atom that recalculates initial position when mat or robot config changes
const initialRobotPositionAtom = atom((get) => {
  const robotConfig = get(robotConfigAtom);
  const matConfig = get(customMatConfigAtom);

  // Use mat dimensions from config if available, otherwise use defaults
  const matWidthMm = matConfig?.dimensions?.widthMm || MAT_WIDTH_MM;
  const matHeightMm = matConfig?.dimensions?.heightMm || MAT_HEIGHT_MM;

  return calculateRobotPositionWithDimensions(
    robotConfig,
    "bottom-right",
    matWidthMm,
    matHeightMm,
  );
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

// Perpendicular motion preview atom - for showing all 4 possible movement options
interface PerpendicularPreviewGhost {
  position: RobotPosition;
  type: "drive" | "turn";
  direction: "forward" | "backward" | "left" | "right";
  color: string; // CSS color for the ghost robot
  label: string; // Description for the movement
}

export const perpendicularPreviewAtom = atom<{
  show: boolean;
  ghosts: PerpendicularPreviewGhost[];
  distance: number;
  angle: number;
}>({
  show: false,
  ghosts: [],
  distance: 100,
  angle: 45,
});

// Path visualization atoms
export const showPathAtom = atom<boolean>(true);
export const pathColorModeAtom = atom<"time" | "speed" | "heading">("time");
export const pathOpacityAtom = atom<number>(0.7);
export const maxPathPointsAtom = atom<number>(1000);

export type ControlMode = "incremental" | "continuous" | "mission" | "program";

// Control mode atom
export const controlModeAtom = atom<ControlMode>("program");

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
  },
);

export const updateScoringAtom = atom(
  null,
  (
    get,
    set,
    update: { missionId: string; objectiveId: string; state: ObjectiveState },
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
  },
);

export const resetScoringAtom = atom(null, (get, set) => {
  set(scoringStateAtom, {});
  set(totalScoreAtom, 0);
});

// Spline path action atoms
export const createSplinePathAtom = atom(null, (get, set, name: string) => {
  // Always start with current robot position as first point
  const currentRobotPosition = get(robotPositionAtom);
  const firstPoint: SplinePathPoint = {
    id: `point_${Date.now()}_start`,
    position: currentRobotPosition,
    timestamp: Date.now(),
  };

  const newPath: SplinePath = {
    id: `path_${Date.now()}`,
    name,
    points: [firstPoint],
    isComplete: false,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };

  set(currentSplinePathAtom, newPath);
  set(isSplinePathModeAtom, true);
  set(selectedSplinePointIdAtom, null);

  const paths = get(splinePathsAtom);
  set(splinePathsAtom, [...paths, newPath]);

  return newPath.id;
});

export const addSplinePointAtom = atom(
  null,
  (get, set, position: RobotPosition) => {
    const currentPath = get(currentSplinePathAtom);
    if (!currentPath) return null;

    const newPoint: SplinePathPoint = {
      id: `point_${Date.now()}`,
      position,
      timestamp: Date.now(),
    };

    const updatedPath = {
      ...currentPath,
      points: [...currentPath.points, newPoint],
      modifiedAt: Date.now(),
    };

    set(currentSplinePathAtom, updatedPath);

    // Update the path in the paths array
    const paths = get(splinePathsAtom);
    const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
    if (pathIndex >= 0) {
      paths[pathIndex] = updatedPath;
      set(splinePathsAtom, [...paths]);
    }

    return newPoint.id;
  },
);

export const updateSplinePointAtom = atom(
  null,
  (get, set, pointId: string, updates: Partial<SplinePathPoint>) => {
    const currentPath = get(currentSplinePathAtom);
    if (!currentPath) return;

    const pointIndex = currentPath.points.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) return;

    const updatedPoints = [...currentPath.points];
    updatedPoints[pointIndex] = { ...updatedPoints[pointIndex], ...updates };

    const updatedPath = {
      ...currentPath,
      points: updatedPoints,
      modifiedAt: Date.now(),
    };

    set(currentSplinePathAtom, updatedPath);

    // Update the path in the paths array
    const paths = get(splinePathsAtom);
    const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
    if (pathIndex >= 0) {
      paths[pathIndex] = updatedPath;
      set(splinePathsAtom, [...paths]);
    }
  },
);

export const deleteSplinePointAtom = atom(null, (get, set, pointId: string) => {
  const currentPath = get(currentSplinePathAtom);
  if (!currentPath) return;

  // Prevent deletion of the first point (robot starting position)
  const pointToDelete = currentPath.points.find((p) => p.id === pointId);
  if (!pointToDelete) return;

  const pointIndex = currentPath.points.findIndex((p) => p.id === pointId);
  if (pointIndex === 0) {
    // Cannot delete the first point - it's the robot's starting position
    console.warn(
      "Cannot delete the first spline point (robot starting position)",
    );
    return;
  }

  const updatedPath = {
    ...currentPath,
    points: currentPath.points.filter((p) => p.id !== pointId),
    modifiedAt: Date.now(),
  };

  set(currentSplinePathAtom, updatedPath);

  // Update the path in the paths array
  const paths = get(splinePathsAtom);
  const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
  if (pathIndex >= 0) {
    paths[pathIndex] = updatedPath;
    set(splinePathsAtom, [...paths]);
  }

  // Clear selection if this point was selected
  if (get(selectedSplinePointIdAtom) === pointId) {
    set(selectedSplinePointIdAtom, null);
  }
});

export const completeSplinePathAtom = atom(null, (get, set) => {
  const currentPath = get(currentSplinePathAtom);
  if (!currentPath) return;

  const updatedPath = {
    ...currentPath,
    isComplete: true,
    modifiedAt: Date.now(),
  };

  set(currentSplinePathAtom, updatedPath);

  // Update the path in the paths array
  const paths = get(splinePathsAtom);
  const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
  if (pathIndex >= 0) {
    paths[pathIndex] = updatedPath;
    set(splinePathsAtom, [...paths]);
  }

  set(isSplinePathModeAtom, false);
  set(selectedSplinePointIdAtom, null);
});

export const cancelSplinePathAtom = atom(null, (get, set) => {
  const currentPath = get(currentSplinePathAtom);
  if (!currentPath) return;

  // Remove the current path from paths array if it's incomplete
  if (!currentPath.isComplete) {
    const paths = get(splinePathsAtom);
    set(
      splinePathsAtom,
      paths.filter((p) => p.id !== currentPath.id),
    );
  }

  set(currentSplinePathAtom, null);
  set(isSplinePathModeAtom, false);
  set(selectedSplinePointIdAtom, null);
});

// Control point management atoms
export const addControlPointAtom = atom(
  null,
  (
    get,
    set,
    pointId: string,
    controlType: "before" | "after",
    controlPoint: { x: number; y: number },
  ) => {
    const currentPath = get(currentSplinePathAtom);
    if (!currentPath) return;

    const pointIndex = currentPath.points.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) return;

    const updatedPoints = [...currentPath.points];
    const existingPoint = updatedPoints[pointIndex];

    updatedPoints[pointIndex] = {
      ...existingPoint,
      controlPoints: {
        ...existingPoint.controlPoints,
        [controlType]: controlPoint,
      },
    };

    const updatedPath = {
      ...currentPath,
      points: updatedPoints,
      modifiedAt: Date.now(),
    };

    set(currentSplinePathAtom, updatedPath);

    // Update the path in the paths array
    const paths = get(splinePathsAtom);
    const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
    if (pathIndex >= 0) {
      paths[pathIndex] = updatedPath;
      set(splinePathsAtom, [...paths]);
    }
  },
);

export const updateControlPointAtom = atom(
  null,
  (
    get,
    set,
    pointId: string,
    controlType: "before" | "after",
    controlPoint: { x: number; y: number },
  ) => {
    const currentPath = get(currentSplinePathAtom);
    if (!currentPath) return;

    const pointIndex = currentPath.points.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) return;

    const updatedPoints = [...currentPath.points];
    const existingPoint = updatedPoints[pointIndex];

    if (!existingPoint.controlPoints) return;

    updatedPoints[pointIndex] = {
      ...existingPoint,
      controlPoints: {
        ...existingPoint.controlPoints,
        [controlType]: controlPoint,
      },
    };

    const updatedPath = {
      ...currentPath,
      points: updatedPoints,
      modifiedAt: Date.now(),
    };

    set(currentSplinePathAtom, updatedPath);

    // Update the path in the paths array
    const paths = get(splinePathsAtom);
    const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
    if (pathIndex >= 0) {
      paths[pathIndex] = updatedPath;
      set(splinePathsAtom, [...paths]);
    }
  },
);

export const removeControlPointAtom = atom(
  null,
  (get, set, pointId: string, controlType: "before" | "after") => {
    const currentPath = get(currentSplinePathAtom);
    if (!currentPath) return;

    const pointIndex = currentPath.points.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) return;

    const updatedPoints = [...currentPath.points];
    const existingPoint = updatedPoints[pointIndex];

    if (!existingPoint.controlPoints) return;

    const updatedControlPoints = { ...existingPoint.controlPoints };
    delete updatedControlPoints[controlType];

    updatedPoints[pointIndex] = {
      ...existingPoint,
      controlPoints:
        Object.keys(updatedControlPoints).length > 0
          ? updatedControlPoints
          : undefined,
    };

    const updatedPath = {
      ...currentPath,
      points: updatedPoints,
      modifiedAt: Date.now(),
    };

    set(currentSplinePathAtom, updatedPath);

    // Update the path in the paths array
    const paths = get(splinePathsAtom);
    const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
    if (pathIndex >= 0) {
      paths[pathIndex] = updatedPath;
      set(splinePathsAtom, [...paths]);
    }
  },
);

// Tangency handle management atoms
export const updateTangencyHandleAtom = atom(
  null,
  (
    get,
    set,
    pointId: string,
    tangencyHandle: {
      x: number;
      y: number;
      strength: number;
      isEdited: boolean;
      isTangentDriving: boolean;
    },
  ) => {
    const currentPath = get(currentSplinePathAtom);
    if (!currentPath) return;

    const pointIndex = currentPath.points.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) return;

    const updatedPoints = [...currentPath.points];
    const existingPoint = updatedPoints[pointIndex];

    updatedPoints[pointIndex] = {
      ...existingPoint,
      tangencyHandle,
    };

    const updatedPath = {
      ...currentPath,
      points: updatedPoints,
      modifiedAt: Date.now(),
    };

    set(currentSplinePathAtom, updatedPath);

    // Update the path in the paths array
    const paths = get(splinePathsAtom);
    const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
    if (pathIndex >= 0) {
      paths[pathIndex] = updatedPath;
      set(splinePathsAtom, [...paths]);
    }
  },
);

// Automatically add tangency handles to intermediate points
export const addTangencyHandlesToIntermediatePointsAtom = atom(
  null,
  (get, set) => {
    const currentPath = get(currentSplinePathAtom);
    if (!currentPath || currentPath.points.length < 3) return;

    const updatedPoints = currentPath.points.map((point, index) => {
      // Only add tangency handles to intermediate points (not first or last)
      const isIntermediate = index > 0 && index < currentPath.points.length - 1;

      if (isIntermediate && !point.tangencyHandle) {
        // Calculate default curvature handle based on surrounding points
        const prevPoint = currentPath.points[index - 1];
        const nextPoint = currentPath.points[index + 1];

        // Calculate direction vectors
        const incomingVec = {
          x: point.position.x - prevPoint.position.x,
          y: point.position.y - prevPoint.position.y,
        };
        const outgoingVec = {
          x: nextPoint.position.x - point.position.x,
          y: nextPoint.position.y - point.position.y,
        };

        // Calculate average direction (bisector)
        const avgDirection = {
          x: (incomingVec.x + outgoingVec.x) / 2,
          y: (incomingVec.y + outgoingVec.y) / 2,
        };

        // Normalize and scale to create default handle
        const length = Math.sqrt(
          avgDirection.x * avgDirection.x + avgDirection.y * avgDirection.y,
        );
        const defaultHandleLength = 30; // 30mm default

        if (length > 0) {
          return {
            ...point,
            tangencyHandle: {
              x: (avgDirection.x / length) * defaultHandleLength,
              y: (avgDirection.y / length) * defaultHandleLength,
              strength: 0.5, // Default medium curvature
              isEdited: false, // Default unedited state (gray)
              isTangentDriving: false, // Default not driving
            },
          };
        }
      }

      return point;
    });

    const updatedPath = {
      ...currentPath,
      points: updatedPoints,
      modifiedAt: Date.now(),
    };

    set(currentSplinePathAtom, updatedPath);

    // Update the path in the paths array
    const paths = get(splinePathsAtom);
    const pathIndex = paths.findIndex((p) => p.id === currentPath.id);
    if (pathIndex >= 0) {
      paths[pathIndex] = updatedPath;
      set(splinePathsAtom, [...paths]);
    }
  },
);

// Spline path planning atoms
export interface SplinePathPoint {
  id: string;
  position: RobotPosition;
  controlPoints?: {
    before?: { x: number; y: number }; // Control point before this point
    after?: { x: number; y: number }; // Control point after this point
  };
  // SolidWorks-style tangency handles for intermediate points (not start/end)
  tangencyHandle?: {
    // Handle direction and magnitude
    x: number; // Offset from point position (end-point position)
    y: number; // Offset from point position (end-point position)
    strength: number; // 0-1, how much curvature to apply

    // SolidWorks-style state
    isEdited: boolean; // True if handle has been manually modified (blue vs gray)
    isTangentDriving: boolean; // True if this handle is "tangent driving"

    // Computed grip positions (calculated from x, y, strength)
    // Diamond grip: Controls angle only (at 50% of handle length)
    // Arrow grip: Controls magnitude only (at 80% of handle length)
    // End-point grip: Controls both angle and magnitude (at 100% of handle length)
  };
  timestamp: number;
}

export interface SplinePath {
  id: string;
  name: string;
  points: SplinePathPoint[];
  isComplete: boolean;
  createdAt: number;
  modifiedAt: number;
}

export interface SplinePathCommand {
  type: "drive" | "turn" | "arc";
  distance?: number;
  angle?: number;
  radius?: number;
  speed: number;
  fromPoint: string; // Point ID
  toPoint: string; // Point ID
}

export const isSplinePathModeAtom = atom<boolean>(false);
export const currentSplinePathAtom = atom<SplinePath | null>(null);
export const splinePathsAtom = atom<SplinePath[]>([]);
export const selectedSplinePointIdAtom = atom<string | null>(null);
export const hoveredSplinePointIdAtom = atom<string | null>(null);
export const hoveredCurvatureHandlePointIdAtom = atom<string | null>(null);
export const splinePathCommandsAtom = atom<SplinePathCommand[]>([]);

// Spline path execution state
export const isExecutingSplinePathAtom = atom<boolean>(false);
export const executingCommandIndexAtom = atom<number>(-1);
