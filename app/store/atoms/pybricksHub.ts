import { atom } from "jotai";

// Pybricks hub capabilities
export const pybricksHubCapabilitiesAtom = atom({
  maxMotorCount: 6,
  maxSensorCount: 4,
  drivebaseSupported: true,
  imuSupported: true,
  batteryMonitoring: true,
  programStorage: true,
});
