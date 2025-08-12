import { atom } from "jotai";
import type { RobotConnectionOptions } from "../../services/robotInterface";
import { robotConnectionManager } from "../../services/robotInterface";
import {
  connectionErrorAtom,
  hubInfoAtom,
  isConnectedAtom,
  isConnectingAtom,
  isDisconnectingAtom,
  isRunningProgramAtom,
  isSendingCommandAtom,
  isStoppingProgramAtom,
  isUploadingProgramAtom,
  programOutputLogAtom,
  programStatusAtom,
  resetRobotTypeAtom,
  resetTelemetryAtom,
  robotTypeAtom,
  telemetryDataAtom,
} from "../atoms/robotConnection";
import {
  virtualRobotPositionAtom,
  virtualRobotStateAtom,
} from "../atoms/virtualRobot";

// Connect to robot action (supports both real and virtual)
export const connectRobotAtom = atom(
  null,
  async (get, set, options: RobotConnectionOptions) => {
    set(isConnectingAtom, true);
    set(connectionErrorAtom, null);

    try {
      const info = await robotConnectionManager.connect(options);
      if (info) {
        set(hubInfoAtom, info);
        set(isConnectedAtom, true);
        set(robotTypeAtom, options.robotType);
      }
      return info;
    } catch (error) {
      set(connectionErrorAtom, error as Error);
      set(isConnectedAtom, false);
      throw error;
    } finally {
      set(isConnectingAtom, false);
    }
  }
);

// Disconnect from robot action
export const disconnectRobotAtom = atom(null, async (get, set) => {
  set(isDisconnectingAtom, true);

  try {
    await robotConnectionManager.disconnect();
    set(hubInfoAtom, null);
    set(isConnectedAtom, false);
    set(telemetryDataAtom, null);
    set(programStatusAtom, { running: false });
    set(virtualRobotPositionAtom, null);
    set(virtualRobotStateAtom, null);
  } finally {
    set(isDisconnectingAtom, false);
  }
});

// Upload program action
export const uploadProgramAtom = atom(
  null,
  async (get, set, pythonCode: string) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(isUploadingProgramAtom, true);

    try {
      await robotConnectionManager.uploadProgram(pythonCode);
    } finally {
      set(isUploadingProgramAtom, false);
    }
  }
);

// Run program action
export const runProgramAtom = atom(null, async (get, set) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Robot not connected");

  set(isRunningProgramAtom, true);
  set(programOutputLogAtom, []); // Clear previous output

  try {
    await robotConnectionManager.runProgram();
  } finally {
    set(isRunningProgramAtom, false);
  }
});

// Stop program action
export const stopProgramAtom = atom(null, async (get, set) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Robot not connected");

  set(isStoppingProgramAtom, true);

  try {
    await robotConnectionManager.stopProgram();
  } finally {
    set(isStoppingProgramAtom, false);
  }
});

// Upload and run program action
export const uploadAndRunProgramAtom = atom(
  null,
  async (get, set, pythonCode: string) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(programOutputLogAtom, []); // Clear previous output

    // First upload, then run
    await set(uploadProgramAtom, pythonCode);
    await set(runProgramAtom);
  }
);

// Send control command action
export const sendControlCommandAtom = atom(
  null,
  async (get, set, command: string) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(isSendingCommandAtom, true);

    try {
      await robotConnectionManager.sendControlCommand(command);
    } finally {
      set(isSendingCommandAtom, false);
    }
  }
);

// Drive command action
export const sendDriveCommandAtom = atom(
  null,
  async (get, set, params: { distance: number; speed: number }) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(isSendingCommandAtom, true);

    try {
      await robotConnectionManager.drive(params.distance, params.speed);
    } finally {
      set(isSendingCommandAtom, false);
    }
  }
);

// Turn command action
export const sendTurnCommandAtom = atom(
  null,
  async (get, set, params: { angle: number; speed: number }) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(isSendingCommandAtom, true);

    try {
      await robotConnectionManager.turn(params.angle, params.speed);
    } finally {
      set(isSendingCommandAtom, false);
    }
  }
);

// Stop command action
export const sendStopCommandAtom = atom(null, async (get, set) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Robot not connected");

  set(isSendingCommandAtom, true);

  try {
    await robotConnectionManager.stop();
  } finally {
    set(isSendingCommandAtom, false);
  }
});

// Continuous drive command action
export const sendContinuousDriveCommandAtom = atom(
  null,
  async (get, set, params: { speed: number; turnRate: number }) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(isSendingCommandAtom, true);

    try {
      await robotConnectionManager.driveContinuous(
        params.speed,
        params.turnRate
      );
    } finally {
      set(isSendingCommandAtom, false);
    }
  }
);

// Motor command actions
export const sendMotorCommandAtom = atom(
  null,
  async (get, set, params: { motor: string; angle: number; speed: number }) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(isSendingCommandAtom, true);

    try {
      await robotConnectionManager.setMotorAngle(
        params.motor,
        params.angle,
        params.speed
      );
    } finally {
      set(isSendingCommandAtom, false);
    }
  }
);

export const sendContinuousMotorCommandAtom = atom(
  null,
  async (get, set, params: { motor: string; speed: number }) => {
    const isConnected = get(isConnectedAtom);
    if (!isConnected) throw new Error("Robot not connected");

    set(isSendingCommandAtom, true);

    try {
      await robotConnectionManager.setMotorSpeed(params.motor, params.speed);
    } finally {
      set(isSendingCommandAtom, false);
    }
  }
);

// Virtual robot specific actions
export const resetVirtualRobotPositionAtom = atom(null, async (get, set) => {
  const robotType = get(robotTypeAtom);
  const isConnected = get(isConnectedAtom);

  if (robotType === "virtual" && isConnected) {
    await robotConnectionManager.resetVirtualRobotPosition?.();
    // Update local state
    set(virtualRobotPositionAtom, { x: 0, y: 0, heading: 0 });
  }
});

export const setVirtualRobotPositionAtom = atom(
  null,
  async (get, set, params: { x: number; y: number; heading: number }) => {
    const robotType = get(robotTypeAtom);
    const isConnected = get(isConnectedAtom);

    if (robotType === "virtual" && isConnected) {
      await robotConnectionManager.setVirtualRobotPosition?.(
        params.x,
        params.y,
        params.heading
      );
      // Update local state
      set(virtualRobotPositionAtom, params);
    }
  }
);

export const getVirtualRobotStateAtom = atom(null, (get, set) => {
  const robotType = get(robotTypeAtom);

  if (robotType === "virtual") {
    const state = robotConnectionManager.getVirtualRobotState?.() || null;
    set(virtualRobotStateAtom, state);
    return state;
  }

  return null;
});

// Reset robot connection
export const resetRobotConnectionAtom = atom(null, async (get, set) => {
  // Reset telemetry first
  set(resetTelemetryAtom);

  // Then reset robot type and connection state
  set(resetRobotTypeAtom);

  // Send reset command if connected
  const isConnected = get(isConnectedAtom);
  if (isConnected) {
    try {
      const command = JSON.stringify({
        action: "reset_drivebase",
      });
      await set(sendControlCommandAtom, command);
    } catch (error) {
      console.error("Error resetting robot connection:", error);
      // Ignore errors - this is a best-effort reset
    }
  }
});
