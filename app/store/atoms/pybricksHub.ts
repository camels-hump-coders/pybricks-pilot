import { atom } from "jotai";
import type { HubInfo } from "../../services/bluetooth";

// Pybricks hub specific atoms
export const pybricksHubInfoAtom = atom<HubInfo | null>(null);

// Pybricks hub capabilities
export const pybricksHubCapabilitiesAtom = atom({
  maxMotorCount: 6,
  maxSensorCount: 4,
  drivebaseSupported: true,
  imuSupported: true,
  batteryMonitoring: true,
  programStorage: true,
});