import { atom } from "jotai";
import { pybricksHubService } from "../../services/pybricksHub";
import { mpyCrossCompiler } from "../../services/mpyCrossCompiler";
import {
  hubInfoAtom,
  isConnectedAtom,
  connectionErrorAtom,
  telemetryDataAtom,
  programStatusAtom,
  programOutputLogAtom,
  debugEventsAtom,
  isConnectingAtom,
  isDisconnectingAtom,
  isUploadingProgramAtom,
  isRunningProgramAtom,
  isStoppingProgramAtom,
  isSendingCommandAtom,
  resetTelemetryAtom,
} from "../atoms/robotConnection";

// Connect to hub action
export const connectHubAtom = atom(null, async (get, set) => {
  set(isConnectingAtom, true);
  set(connectionErrorAtom, null);
  
  try {
    const info = await pybricksHubService.requestAndConnect();
    if (info) {
      set(hubInfoAtom, info);
      set(isConnectedAtom, true);
    }
    return info;
  } catch (error) {
    set(connectionErrorAtom, error as Error);
    set(isConnectedAtom, false);
    throw error;
  } finally {
    set(isConnectingAtom, false);
  }
});

// Disconnect from hub action
export const disconnectHubAtom = atom(null, async (get, set) => {
  set(isDisconnectingAtom, true);
  
  try {
    await pybricksHubService.disconnect();
    set(hubInfoAtom, null);
    set(isConnectedAtom, false);
    set(telemetryDataAtom, null);
    set(programStatusAtom, { running: false });
  } finally {
    set(isDisconnectingAtom, false);
  }
});

// Upload program action
export const uploadProgramAtom = atom(null, async (get, set, pythonCode: string) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Hub not connected");
  
  set(isUploadingProgramAtom, true);
  
  try {
    await pybricksHubService.uploadProgram(pythonCode);
  } finally {
    set(isUploadingProgramAtom, false);
  }
});

// Run program action
export const runProgramAtom = atom(null, async (get, set) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Hub not connected");
  
  set(isRunningProgramAtom, true);
  set(programOutputLogAtom, []); // Clear previous output
  
  try {
    await pybricksHubService.runProgram();
  } finally {
    set(isRunningProgramAtom, false);
  }
});

// Stop program action
export const stopProgramAtom = atom(null, async (get, set) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Hub not connected");
  
  set(isStoppingProgramAtom, true);
  
  try {
    await pybricksHubService.stopProgram();
  } finally {
    set(isStoppingProgramAtom, false);
  }
});

// Upload and run program action
export const uploadAndRunProgramAtom = atom(null, async (get, set, pythonCode: string) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Hub not connected");
  
  set(programOutputLogAtom, []); // Clear previous output
  set(isUploadingProgramAtom, true);
  
  try {
    // First stop any running program
    await pybricksHubService.stopProgram();
    
    // Wait a bit for the hub to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Upload and run atomically
    await pybricksHubService.uploadAndRunProgram(pythonCode);
  } finally {
    set(isUploadingProgramAtom, false);
  }
});

// Send control command action
export const sendControlCommandAtom = atom(null, async (get, set, command: string) => {
  const isConnected = get(isConnectedAtom);
  if (!isConnected) throw new Error("Hub not connected");
  
  set(isSendingCommandAtom, true);
  
  try {
    await pybricksHubService.sendControlCommand(command);
  } finally {
    set(isSendingCommandAtom, false);
  }
});

// Drive command action
export const sendDriveCommandAtom = atom(null, async (get, set, params: { distance: number; speed: number }) => {
  const command = JSON.stringify({
    action: "drive",
    distance: params.distance,
    speed: params.speed,
  });
  
  const sendCommand = get(sendControlCommandAtom);
  await set(sendControlCommandAtom, command);
});

// Turn command action
export const sendTurnCommandAtom = atom(null, async (get, set, params: { angle: number; speed: number }) => {
  const command = JSON.stringify({
    action: "turn",
    angle: params.angle,
    speed: params.speed,
  });
  
  await set(sendControlCommandAtom, command);
});

// Stop command action
export const sendStopCommandAtom = atom(null, async (get, set) => {
  const command = JSON.stringify({
    action: "stop",
  });
  
  await set(sendControlCommandAtom, command);
});

// Continuous drive command action
export const sendContinuousDriveCommandAtom = atom(
  null,
  async (get, set, params: { speed: number; turnRate: number }) => {
    const command = JSON.stringify({
      action: "drive_continuous",
      speed: params.speed,
      turn_rate: params.turnRate,
    });
    
    await set(sendControlCommandAtom, command);
  }
);

// Motor command action
export const sendMotorCommandAtom = atom(
  null,
  async (get, set, params: { motor: string; angle: number; speed: number }) => {
    const command = JSON.stringify({
      action: "motor",
      motor: params.motor,
      angle: params.angle,
      speed: params.speed,
    });
    
    await set(sendControlCommandAtom, command);
  }
);

// Continuous motor command action
export const sendContinuousMotorCommandAtom = atom(
  null,
  async (get, set, params: { motor: string; speed: number }) => {
    const command = JSON.stringify({
      action: "motor",
      motor: params.motor,
      speed: params.speed,
    });
    
    await set(sendControlCommandAtom, command);
  }
);

// Motor stop command action
export const sendMotorStopCommandAtom = atom(
  null,
  async (get, set, motor: string) => {
    const command = JSON.stringify({
      action: "stop",
      motor,
    });
    
    await set(sendControlCommandAtom, command);
  }
);

// Reset drivebase telemetry action
export const resetDrivebaseTelemetryAtom = atom(null, async (get, set) => {
  const isConnected = get(isConnectedAtom);
  
  // Reset local telemetry state
  set(resetTelemetryAtom);
  
  // Send reset command to robot if connected
  if (isConnected) {
    const resetCommand = JSON.stringify({
      action: "reset_drivebase",
    });
    
    try {
      await set(sendControlCommandAtom, resetCommand);
    } catch {
      // Ignore errors - this is a best-effort reset
    }
  }
});