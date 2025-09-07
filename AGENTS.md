# AGENTS

This repository uses Node.js and TypeScript with React.

- Run `npm run lint` and `npm run typecheck` before committing.
- Use `npm run fmt` to format code.
- Prefer small, descriptive commits written in the imperative mood.
- Follow conventions documented in subdirectory `AGENTS.md` files when modifying code within them.
- Avoid Git LFS pointer issues:
  - Install Git LFS locally with `git lfs install`.
  - After cloning, run `git lfs pull` to download binary files.
  - If pointer text appears in working files, run `git lfs checkout` to replace them.

## Project Overview

- Frontend: React + TypeScript (Vite), state via Jotai atoms.
- Robots: Real Pybricks hubs over Web Bluetooth, and a virtual robot.
- Python upload pipeline compiles user programs to the Pybricks multi-file format and injects a support module that handles telemetry and remote control.

## Key Paths

- Robot connection services: `app/services/pybricksHub.ts`, `app/hooks/useJotaiPybricksHub.ts`, `app/hooks/useJotaiRobotConnection.ts`
- Multi-file compilation: `app/services/multiModuleCompiler.ts`, `app/services/mpyCrossCompiler.ts`, `app/services/dependencyResolver.ts`
- Injected runtime (sent to hub): `app/assets/pybrickspilot.py`
- Program UI: `app/components/ProgramControls.tsx`, `app/components/ProgramManager.tsx`
- Calibration UI: `app/components/CalibrationPanel.tsx`
- Quick Start generators: `app/utils/quickStart.ts`, `app/utils/calibration.ts`
- Robot config state and FS: `app/store/atoms/robotConfigSimplified.ts`, `app/store/atoms/configFileSystem.ts`, `app/services/robotConfigFileSystem.ts`

## State & Config

- Active robot config: `robotConfigAtom` with setter `setActiveRobotAtom` (persists active robot id and resets position).
- Filesystem-backed robot configs live under `config/robots/<robotId>/robot.json`. Use `saveRobotConfigAtom` to persist changes. The “default” robot is not writable.
- Schema highlights: wheel diameters at `config.wheels.left/right.diameter` (mm); axle track stored at `config.drivebase.axleTrackMm` when present; otherwise width×8mm is used as a fallback estimate.

## Program Compilation & Upload

- Real hubs: `pybricksHubService` handles BLE protocol, program upload, and run/stop.
- Multi-module compilation: `multiModuleCompiler`
  - `compileHubMenu(...)` builds a program menu from numbered files.
  - `compileMultiModule(selectedFile, content, availableFiles)` builds a one-off bundle for an ad‑hoc program and resolves local imports (e.g., `import robot`).
- Instrumentation: `pybrickspilot.py` is always included to provide telemetry, remote control, and menu helpers.

## Quick Start & Calibration Flow

- Starter program: `generateQuickStartCode(config)` writes `robot.py` (using current robot ports and dimensions) via the Quick Start UI.
- Calibrate: The “Calibrate” button now uploads and runs a generated calibration program that imports `robot.py` and executes:
  - drive straight 200mm
  - wait 2 seconds
  - turn 360°
- Implementation details:
  - Generator: `app/utils/calibration.ts` → `generateCalibrationProgram()`.
  - Upload/run: `pybricksHubService.uploadAndRunAdhocProgram(name, content, availableFiles)` wires through `useJotaiPybricksHub` and `useJotaiRobotConnection`.
  - UI buttons: `ProgramControls.tsx` and `ProgramManager.tsx` call the ad‑hoc upload; they require hub connected and a `robot.py` present in the mounted directory.
- Calibration panel: `CalibrationPanel.tsx`
  - Inputs measured distance/turn to compute suggested wheel diameter and axle track.
  - Applying values updates the active robot and saves to disk when not the default robot (via `saveRobotConfigAtom`).
  - Includes a “Rerun Calibrate” convenience action.

## Virtual vs Real Robots

- `useJotaiRobotConnection()` selects virtual vs real implementations and exposes common methods:
  - Real-only: `uploadAndRunHubMenu`, `uploadAndRunAdhocProgram`.
  - Common control: `sendDriveCommand`, `sendTurnCommand`, `executeCommandSequence`, etc.
- Program running state and debug:
  - `debugEventsAtom`, `programOutputLogAtom` used to surface recent errors/logs.

## Contributing Notes

- Before commit: run `npm run lint`, `npm run typecheck`, and optionally `npm run fmt`.
- Keep changes focused; avoid fixing unrelated lint in large passes unless requested.
- When updating robot parameters from UI, prefer going through Jotai atoms and `saveRobotConfigAtom` to persist when possible and to ensure downstream consumers update correctly.

## Gotchas

- Calibration requires a `robot.py` in the project (the ad‑hoc program imports it). The Quick Start “Generate Starter Program” produces this file.
- The default robot config cannot be saved to disk; applying settings updates the active in-memory state only.
- BLE upload flow invalidates the existing user program and uploads multi-file bundles; errors are surfaced in the Debug Details panel.
