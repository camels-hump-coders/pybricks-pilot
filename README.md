# PyBricks Pilot

A modern web-based interface for programming and controlling LEGO Spike Prime robots with Pybricks. Features real-time telemetry, remote control capabilities, and a virtual competition mat for FLL teams.

## Features

### 🚀 Core Functionality
- **Bluetooth Connection**: Connect to LEGO Spike Prime hubs via Web Bluetooth
- **Live Programming**: Upload and run Python programs directly on the hub
- **Real-time Telemetry**: Monitor motors, sensors, IMU data, and drivebase position
- **Remote Control**: Manual robot control with continuous drive modes

### 🎮 Competition Support
- **Virtual FLL Mat**: Interactive competition mat with proper 93" × 45" dimensions
- **Robot Visualization**: Real-time robot position tracking and movement animation  
- **Click-to-Position**: Easy robot placement and heading adjustment
- **Telemetry Reset**: Reset position and telemetry data for new runs

### 🔧 Development Tools
- **Auto-Instrumentation**: Automatic telemetry injection with PybricksPilot module
- **Program Output Log**: View robot program output and debug information
- **File System Integration**: Browse and edit Python files directly
- **Parallel Execution**: Background telemetry while running user programs

## Getting Started

### Prerequisites
- Modern web browser with Web Bluetooth support (Chrome, Edge, Opera)
- LEGO Spike Prime hub with Pybricks firmware

### Installation

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Usage

1. **Connect**: Click "Connect" to pair with your Pybricks hub
2. **Control**: Use manual controls to test robot movement
3. **Program**: Upload Python programs and monitor execution
4. **Track**: Watch your robot's position on the virtual competition mat

## Building for Production

```bash
npm run build
```

## Deployment

### GitHub Pages

This project is automatically deployed to GitHub Pages using GitHub Actions. When you push to the `main` branch:

1. GitHub Actions will automatically build the project
2. The built static files will be deployed to GitHub Pages
3. The site will be available at: `https://camels-hump-coders.github.io/fll-pybricks-ui/`

#### Manual Setup Required:

1. **Enable GitHub Pages**: Go to your repository settings → Pages
2. **Set Source**: Select "GitHub Actions" as the source
3. **HTTPS**: Ensure "Enforce HTTPS" is enabled

The deployment workflow includes:
- ✅ Automatic building on push to main
- ✅ SPA routing support for React Router
- ✅ Proper asset path handling for GitHub Pages subdirectory
- ✅ Optimized production build

## Technology Stack

- **Frontend**: React 19 with React Router v7
- **Styling**: TailwindCSS 4.x
- **Bluetooth**: Web Bluetooth API
- **Python**: Pyodide for in-browser Python compilation
- **Build**: Vite with TypeScript

## Browser Support

PyBricks Pilot requires a browser that supports the Web Bluetooth API:

- ✅ Chrome 56+
- ✅ Edge 79+  
- ✅ Opera 43+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

---

Built with ❤️ for the FLL and Pybricks communities.