import { atom } from "jotai";
import type { HubInfo } from "../../services/bluetooth";
import type {
  DebugEvent,
  ProgramStatus,
  TelemetryData,
} from "../../services/pybricksHub";

// Connection state atoms
const hubInfoAtom = atom<HubInfo | null>(null);
const isConnectedAtom = atom<boolean>(false);
const connectionErrorAtom = atom<Error | null>(null);

// Telemetry atoms
const telemetryDataAtom = atom<TelemetryData | null>(null);
const telemetryHistoryAtom = atom<TelemetryData[]>([]);

// Program state atoms
const programStatusAtom = atom<ProgramStatus>({ running: false });
const programOutputLogAtom = atom<string[]>([]);

// Debug atoms
const debugEventsAtom = atom<DebugEvent[]>([]);

// Connection status atoms
const isConnectingAtom = atom<boolean>(false);
const isDisconnectingAtom = atom<boolean>(false);

// Program operation status atoms
export const isUploadingProgramAtom = atom<boolean>(false);
const isRunningProgramAtom = atom<boolean>(false);
const isStoppingProgramAtom = atom<boolean>(false);
const isSendingCommandAtom = atom<boolean>(false);

// Instrumentation options atoms
const instrumentationEnabledAtom = atom<boolean>(true);
const instrumentationOptionsAtom = atom<{
  enableTelemetry: boolean;
  enableCommands: boolean;
  telemetryInterval: number;
}>({
  enableTelemetry: true,
  enableCommands: true,
  telemetryInterval: 100,
});

// Derived atoms for convenience
const batteryLevelAtom = atom((get) => get(telemetryDataAtom)?.hub?.battery);
const motorDataAtom = atom((get) => get(telemetryDataAtom)?.motors);
const sensorDataAtom = atom((get) => get(telemetryDataAtom)?.sensors);
const imuDataAtom = atom((get) => get(telemetryDataAtom)?.hub?.imu);

// Action atoms for clearing data
const clearDebugEventsAtom = atom(null, (get, set) => {
  set(debugEventsAtom, []);
});

const clearProgramOutputLogAtom = atom(null, (get, set) => {
  set(programOutputLogAtom, []);
});

const resetTelemetryAtom = atom(null, (get, set) => {
  set(telemetryDataAtom, null);
  set(telemetryHistoryAtom, []);
  set(programStatusAtom, { running: false });
  set(programOutputLogAtom, []);
});
