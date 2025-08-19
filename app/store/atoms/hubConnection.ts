import { atom } from "jotai";
import type { HubInfo } from "../../services/bluetooth";
import type {
  DebugEvent,
  ProgramStatus,
  TelemetryData,
} from "../../services/pybricksHub";

// Connection state atoms
const _hubInfoAtom = atom<HubInfo | null>(null);
const _isConnectedAtom = atom<boolean>(false);
const _connectionErrorAtom = atom<Error | null>(null);

// Telemetry atoms
const telemetryDataAtom = atom<TelemetryData | null>(null);
const telemetryHistoryAtom = atom<TelemetryData[]>([]);

// Program state atoms
const programStatusAtom = atom<ProgramStatus>({ running: false });
const programOutputLogAtom = atom<string[]>([]);

// Debug atoms
const debugEventsAtom = atom<DebugEvent[]>([]);

// Connection status atoms
const _isConnectingAtom = atom<boolean>(false);
const _isDisconnectingAtom = atom<boolean>(false);

// Program operation status atoms
export const isUploadingProgramAtom = atom<boolean>(false);
const _isRunningProgramAtom = atom<boolean>(false);
const _isStoppingProgramAtom = atom<boolean>(false);
const _isSendingCommandAtom = atom<boolean>(false);

// Instrumentation options atoms
const _instrumentationEnabledAtom = atom<boolean>(true);
const _instrumentationOptionsAtom = atom<{
  enableTelemetry: boolean;
  enableCommands: boolean;
  telemetryInterval: number;
}>({
  enableTelemetry: true,
  enableCommands: true,
  telemetryInterval: 100,
});

// Derived atoms for convenience
const _batteryLevelAtom = atom((get) => get(telemetryDataAtom)?.hub?.battery);
const _motorDataAtom = atom((get) => get(telemetryDataAtom)?.motors);
const _sensorDataAtom = atom((get) => get(telemetryDataAtom)?.sensors);
const _imuDataAtom = atom((get) => get(telemetryDataAtom)?.hub?.imu);

// Action atoms for clearing data
const _clearDebugEventsAtom = atom(null, (_get, set) => {
  set(debugEventsAtom, []);
});

const _clearProgramOutputLogAtom = atom(null, (_get, set) => {
  set(programOutputLogAtom, []);
});

const _resetTelemetryAtom = atom(null, (_get, set) => {
  set(telemetryDataAtom, null);
  set(telemetryHistoryAtom, []);
  set(programStatusAtom, { running: false });
  set(programOutputLogAtom, []);
});
