import { atom } from "jotai";

// Virtual robot specific atoms
export const virtualRobotPositionAtom = atom<{
  x: number;
  y: number;
  heading: number;
} | null>(null);

export const virtualRobotStateAtom = atom<any>(null);

// Virtual robot capabilities
export const virtualRobotCapabilitiesAtom = atom({
  maxMotorCount: 6,
  maxSensorCount: 4,
  drivebaseSupported: true,
  imuSupported: true,
  batteryMonitoring: false, // Virtual robot doesn't have real battery
  programStorage: false, // Virtual robot runs in memory
});
