import { atom } from "jotai";
import type { HubInfo } from "../../services/bluetooth";
import type { ProgramStatus, TelemetryData, DebugEvent } from "../../services/pybricksHub";

// Connection state atoms
export const hubInfoAtom = atom<HubInfo | null>(null);
export const isConnectedAtom = atom<boolean>(false);
export const connectionErrorAtom = atom<Error | null>(null);

// Telemetry atoms
export const telemetryDataAtom = atom<TelemetryData | null>(null);
export const telemetryHistoryAtom = atom<TelemetryData[]>([]);

// Program state atoms
export const programStatusAtom = atom<ProgramStatus>({ running: false });
export const programOutputLogAtom = atom<string[]>([]);

// Debug atoms
export const debugEventsAtom = atom<DebugEvent[]>([]);

// Connection status atoms
export const isConnectingAtom = atom<boolean>(false);
export const isDisconnectingAtom = atom<boolean>(false);

// Program operation status atoms
export const isUploadingProgramAtom = atom<boolean>(false);
export const isRunningProgramAtom = atom<boolean>(false);
export const isStoppingProgramAtom = atom<boolean>(false);
export const isSendingCommandAtom = atom<boolean>(false);

// Instrumentation options atoms
export const instrumentationEnabledAtom = atom<boolean>(true);
export const instrumentationOptionsAtom = atom<{
  enableTelemetry: boolean;
  enableCommands: boolean;
  telemetryInterval: number;
}>({
  enableTelemetry: true,
  enableCommands: true,
  telemetryInterval: 100,
});

// Derived atoms for convenience
export const batteryLevelAtom = atom((get) => get(telemetryDataAtom)?.hub?.battery);
export const motorDataAtom = atom((get) => get(telemetryDataAtom)?.motors);
export const sensorDataAtom = atom((get) => get(telemetryDataAtom)?.sensors);
export const imuDataAtom = atom((get) => get(telemetryDataAtom)?.hub?.imu);

// Action atoms for clearing data
export const clearDebugEventsAtom = atom(null, (get, set) => {
  set(debugEventsAtom, []);
});

export const clearProgramOutputLogAtom = atom(null, (get, set) => {
  set(programOutputLogAtom, []);
});

export const resetTelemetryAtom = atom(null, (get, set) => {
  set(telemetryDataAtom, null);
  set(telemetryHistoryAtom, []);
  set(programStatusAtom, { running: false });
  set(programOutputLogAtom, []);
});