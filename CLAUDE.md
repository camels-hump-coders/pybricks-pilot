# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PyBricks Pilot is a web-based interface for programming and controlling LEGO Spike Prime robots with Pybricks firmware. It provides real-time telemetry, remote control, and a virtual competition mat for FLL teams.

## Development Commands

```bash
# Start development server (available at http://localhost:5173)
npm run dev

# Build for production (outputs to build/client/)
npm run build

# Build for GitHub Pages deployment
GITHUB_PAGES=true npm run build

# Type checking
npm run typecheck

# Start production server (requires build first)
npm run start
```

## Architecture Overview

### Core Technology Stack
- **React Router v7** in SPA mode (`ssr: false`) - single route app at `/`
- **TailwindCSS v4** with Vite plugin for styling
- **Web Bluetooth API** for LEGO hub communication
- **Pyodide** for in-browser Python compilation
- **@pybricks/mpy-cross-v6** for MicroPython bytecode compilation

### Application Structure

**Single Route Application**: The app uses a single route (`routes/home.tsx`) with collapsible sections for different functionalities, prioritized as:
1. Manual Controls (RobotController)
2. Robot Telemetry (TelemetryDashboard with CompetitionMat)  
3. Program Management (ProgramManager)

### Key Services & Data Flow

**Bluetooth Communication**: 
- `services/bluetooth.ts` - Low-level Web Bluetooth wrapper
- `services/pybricksHub.ts` - High-level hub management, program upload/execution
- Uses specific Pybricks UUIDs and handles both command sending and telemetry receiving

**Code Instrumentation System**:
- `utils/codeInstrumentation.ts` - Automatically injects `assets/pybrickspilot.py` module into user programs
- `assets/pybrickspilot.py` - MicroPython module providing telemetry and remote control capabilities
- Auto-detects hardware (motors, sensors, drivebase) from user code patterns
- Supports parallel execution using Pybricks multitask API

**Python Compilation**:
- `services/mpyCrossCompiler.ts` - Wraps @pybricks/mpy-cross-v6 for bytecode compilation
- `workers/pythonCompilerWorker.ts` - Web Worker for Pyodide-based syntax checking
- `services/indexedDBFileSystem.ts` - Persistent file storage using File System Access API

**Competition Mat System**:
- `components/CompetitionMat.tsx` - Virtual 93" × 45" FLL mat with robot visualization
- Tracks robot position using telemetry data (distance/angle from drivebase)
- Handles coordinate transformation (bottom-left origin, Y+ upward)  
- Separates manual heading adjustments from telemetry-based rotation

### State Management

**React Query**: Used via `@tanstack/react-query` for async operations (mutations only, no queries)

**Custom Hooks**:
- `usePybricksHub.ts` - Central hub connection, telemetry, and command state
- `useFileSystem.ts` - File browser integration with File System Access API
- `useNotifications.ts` - Toast notifications system
- `usePythonCompiler.ts` - Code compilation and syntax checking

### Key Implementation Details

**Web Bluetooth Requirements**:
- Requires HTTPS in production (GitHub Pages provides this)
- Only works in Chrome, Edge, Opera (not Firefox/Safari)
- Hub must have Pybricks firmware installed

**GitHub Pages Deployment**:
- Configured as SPA with `404.html` and routing hack for client-side navigation  
- Uses `/fll-pybricks-ui/` base path when `GITHUB_PAGES=true`
- Automatic deployment via `.github/workflows/deploy.yml`

**PybricksPilot Integration**:
The `pybrickspilot.py` module is automatically injected into user programs to provide:
- Non-blocking telemetry transmission using `read_input_byte()`
- Parallel execution with user code using `multitask()`
- Hardware auto-registration and command processing
- Support for both sync and async user program patterns

## Working with This Codebase

**Adding New Telemetry Data**: Extend `TelemetryData` interface in `services/pybricksHub.ts` and add corresponding UI components in `components/` directory.

**Modifying Robot Commands**: Update both the frontend command functions in `usePybricksHub.ts` and the corresponding handlers in `assets/pybrickspilot.py`.

**Competition Mat Changes**: The `CompetitionMat.tsx` component handles complex coordinate transformations and robot state tracking. Be careful with the separation between `telemetryReference`, `currentPosition`, and `manualHeadingAdjustment` state.

**File System Integration**: Uses File System Access API when available, with IndexedDB fallback. File persistence is handled in `services/indexedDBFileSystem.ts`.

## Browser Limitations

PyBricks Pilot requires Web Bluetooth API support, which limits browser compatibility:
- ✅ Chrome 56+, Edge 79+, Opera 43+
- ❌ Firefox, Safari (no Web Bluetooth support)
- ✅ Must be served over HTTPS in production

## Testing with Connected Robot

When testing UI features or debugging robot connectivity, follow this workflow:

### Setup Process
1. Start the development server with `npm run dev` (runs on http://localhost:5173)
2. Use Playwright MCP to open a browser and navigate to the development URL
3. Notify the user that the browser is ready for robot connection
4. The user will connect the physical robot to the webpage
5. You can then automate UI testing and observe console logs directly

### Testing Workflow with Playwright MCP

```javascript
// Example testing workflow
// 1. Open browser and navigate to the app
await playwright.navigate('http://localhost:5173');

// 2. Wait for user to connect robot
console.log("Browser ready - please connect the robot to the webpage");

// 3. After robot is connected, you can:
// - Test UI interactions
// - Monitor telemetry data
// - Execute robot commands
// - Observe console logs for debugging
// - Test mat editor features
// - Verify scoring functionality

// 4. Use screenshots to verify visual elements
await playwright.screenshot();
```

### Key Testing Areas
- **Connection Flow**: Test hub connection/disconnection
- **Telemetry**: Verify real-time data updates from the robot
- **Commands**: Test manual control commands (drive, turn, stop)
- **Program Upload**: Test code upload and execution
- **Mat Visualization**: Verify robot position tracking on virtual mat
- **Custom Mats**: Test mat editor, corner selection, and de-skewing
- **Scoring**: Test scoring object placement and collision detection

### Console Monitoring
When using Playwright MCP, you have direct access to browser console logs, which is essential for:
- Debugging Bluetooth connection issues
- Monitoring telemetry data flow
- Tracking command execution
- Identifying JavaScript errors
- Viewing debug output from `window.DEBUG` flag

### Important Notes
- Always inform the user when the browser is ready for robot connection
- The robot must have Pybricks firmware installed
- Web Bluetooth requires user interaction to initiate connection
- The user will handle the physical robot connection process
- Use Playwright's wait functions to handle async operations