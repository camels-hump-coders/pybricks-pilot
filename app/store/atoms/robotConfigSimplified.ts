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
