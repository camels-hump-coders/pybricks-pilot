import { atom } from "jotai";
import type { RobotConfig } from "../../schemas/RobotConfig";
import { DEFAULT_ROBOT_CONFIG } from "../../schemas/RobotConfig";
import { userPreferences } from "../../services/userPreferences";
import {
  calculateRobotPosition,
  manualHeadingAdjustmentAtom,
  setRobotPositionAtom,
} from "./gameMat";

// Current robot configuration atom - the source of truth for UI
export const robotConfigAtom = atom<RobotConfig>(DEFAULT_ROBOT_CONFIG);

// Robot builder open state
export const robotBuilderOpenAtom = atom<boolean>(false);

// Loading/error states for robot operations
const _robotConfigLoadingAtom = atom<boolean>(false);
const _robotConfigErrorAtom = atom<string | null>(null);

// Action to set the current robot config and persist the selection
export const setActiveRobotAtom = atom(
  null,
  (_get, set, config: RobotConfig) => {
    // Update the UI atom
    set(robotConfigAtom, config);

    // Save the active robot ID to localStorage for persistence
    userPreferences.setActiveRobotId(config.id);

    // Reset robot position with new config
    const newPosition = calculateRobotPosition(config, "bottom-right");
    set(setRobotPositionAtom, newPosition);
    set(manualHeadingAdjustmentAtom, 0);

    console.log("Robot config set to:", config.name, "ID:", config.id);
  },
);

// Initialize robot configuration from localStorage + filesystem
export const initializeActiveRobotAtom = atom(
  null,
  async (_get, set, availableRobots: RobotConfig[]) => {
    const storedActiveId = userPreferences.getActiveRobotId();

    // Try to find the stored active robot in the available robots
    let activeRobot = null;
    if (storedActiveId) {
      activeRobot = availableRobots.find(
        (robot) => robot.id === storedActiveId,
      );
    }

    // If not found or no stored ID, use first available robot (or default)
    if (!activeRobot) {
      activeRobot =
        availableRobots.length > 0 ? availableRobots[0] : DEFAULT_ROBOT_CONFIG;
    }

    // Set the active robot
    set(setActiveRobotAtom, activeRobot);
  },
);

// Derived atoms
const _robotDimensionsAtom = atom((get) => {
  const config = get(robotConfigAtom);
  return {
    widthMm: config.dimensions.width * 8, // Convert studs to mm
    lengthMm: config.dimensions.length * 8,
    widthStuds: config.dimensions.width,
    lengthStuds: config.dimensions.length,
  };
});

const _robotWheelbaseAtom = atom((get) => {
  const config = get(robotConfigAtom);
  return {
    leftWheel: config.wheels.left,
    rightWheel: config.wheels.right,
    wheelbase:
      config.dimensions.width - config.wheels.left.distanceFromEdge * 2,
    centerOffset: config.centerOfRotation,
  };
});

const _robotAppearanceAtom = atom((get) => {
  const config = get(robotConfigAtom);
  return config.appearance;
});

// Robot builder state atoms (UI state, not persisted)
const robotBuilderStateAtom = atom({
  selectedTool: "select" as
    | "select"
    | "fill"
    | "wheel"
    | "sensor"
    | "motor"
    | "eraser",
  selectedColor: "#007bff",
  showGrid: true,
  showStuds: true,
  zoom: 1,
  pan: { x: 0, y: 0 },
});

const _updateRobotBuilderStateAtom = atom(
  null,
  (
    get,
    set,
    updates: Partial<{
      selectedTool: "select" | "fill" | "wheel" | "sensor" | "motor" | "eraser";
      selectedColor: string;
      showGrid: boolean;
      showStuds: boolean;
      zoom: number;
      pan: { x: number; y: number };
    }>,
  ) => {
    const currentState = get(robotBuilderStateAtom);
    set(robotBuilderStateAtom, { ...currentState, ...updates });
  },
);
