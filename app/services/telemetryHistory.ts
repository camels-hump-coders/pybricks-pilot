import type { TelemetryData } from "./pybricksHub";

export interface TelemetryPoint {
  timestamp: number;
  x: number; // Position in mm
  y: number; // Position in mm
  heading: number; // Rotation in degrees
  isCmdKeyPressed: boolean;
  data: TelemetryData;
}

export interface TelemetryPath {
  id: string;
  startTime: number;
  endTime: number;
  points: TelemetryPoint[];
}

export type ColorMode =
  | "none"
  | "speed"
  | "motorLoad"
  | "colorSensor"
  | "distanceSensor"
  | "reflectionSensor"
  | "forceSensor";

export interface PathVisualizationOptions {
  showPath: boolean;
  showMarkers: boolean;
  colorMode: ColorMode;
  opacity: number;
  strokeWidth: number;
}

class TelemetryHistoryService {
  private currentPath: TelemetryPath | null = null;
  private allPaths: TelemetryPath[] = [];
  private maxHistorySize = 10000; // Maximum points to keep in memory
  private isRecording = false;
  private isProgramRunning = false;
  private lastPosition = { x: 0, y: 0, heading: 0 };

  startRecording(): void {
    if (this.isRecording) return;

    this.currentPath = {
      id: `path-${Date.now()}`,
      startTime: Date.now(),
      endTime: 0,
      points: [],
    };
    this.isRecording = true;
  }

  stopRecording(): void {
    if (!this.isRecording || !this.currentPath) return;

    this.currentPath.endTime = Date.now();
    this.allPaths.push(this.currentPath);
    this.currentPath = null;
    this.isRecording = false;
  }

  addTelemetryPoint(
    telemetry: TelemetryData,
    x: number,
    y: number,
    heading: number,
    isCmdKeyPressed: boolean
  ): void {
    if (!this.isRecording || !this.currentPath) {
      return;
    }

    // Only add point if position has changed significantly (more than 5mm or 2 degrees)
    const distChange = Math.sqrt(
      Math.pow(x - this.lastPosition.x, 2) +
        Math.pow(y - this.lastPosition.y, 2)
    );
    const headingChange = Math.abs(heading - this.lastPosition.heading);

    if (distChange < 5 && headingChange < 2) return;

    const point: TelemetryPoint = {
      timestamp: Date.now(),
      x,
      y,
      heading,
      isCmdKeyPressed,
      data: { ...telemetry }, // Clone the telemetry data
    };

    this.currentPath.points.push(point);
    this.lastPosition = { x, y, heading };

    // Limit history size
    if (this.currentPath.points.length > this.maxHistorySize) {
      this.currentPath.points.shift();
    }
  }

  getCurrentPath(): TelemetryPath | null {
    return this.currentPath;
  }

  getAllPaths(): TelemetryPath[] {
    return this.allPaths;
  }

  clearHistory(): void {
    this.allPaths = [];
    this.currentPath = null;
  }

  clearCurrentPath(): void {
    if (this.currentPath) {
      this.currentPath.points = [];
      this.currentPath.startTime = Date.now();
    }
  }

  isRecordingActive(): boolean {
    return this.isRecording;
  }

  getIsProgramRunning(): boolean {
    return this.isProgramRunning;
  }

  // Automatic recording methods
  onProgramStart(): void {
    this.isProgramRunning = true;
    this.startRecording();
  }

  onProgramStop(): void {
    this.isProgramRunning = false;
    this.stopRecording();
  }

  onMatReset(): void {
    this.stopRecording(); // Stop current recording if any
    this.clearHistory(); // Clear all history
    this.startRecording(); // Start fresh recording
  }

  // Ensure recording is active when telemetry data is available
  ensureRecordingActive(): void {
    if (!this.isRecording) {
      this.startRecording();
    }
  }

  // Add initial position point when recording starts
  addInitialPosition(x: number, y: number, heading: number): void {
    if (!this.isRecording || !this.currentPath) {
      return;
    }

    // Create a dummy telemetry data object for the initial position
    const initialTelemetry: any = {
      drivebase: { distance: 0, angle: 0 },
      motors: {},
      sensors: {},
      hub: { battery: 100, imu: { heading: heading } },
    };

    const point: TelemetryPoint = {
      timestamp: Date.now(),
      x,
      y,
      heading,
      isCmdKeyPressed: false,
      data: initialTelemetry,
    };

    this.currentPath.points.push(point);
    this.lastPosition = { x, y, heading };
  }

  getColorForPoint(point: TelemetryPoint, colorMode: ColorMode): string {
    switch (colorMode) {
      case "none":
        return "#3b82f6"; // Default blue

      case "speed":
        if (point.data.drivebase?.state?.drive_speed !== undefined) {
          const speed = Math.abs(point.data.drivebase.state.drive_speed);
          const maxSpeed = 500; // mm/s typical max
          const intensity = Math.min(speed / maxSpeed, 1);
          return this.getGradientColor(intensity, "speed");
        }
        return "#3b82f6";

      case "motorLoad":
        const motors = point.data.motors;
        if (motors) {
          const loads = Object.values(motors)
            .map((m) => m.load || 0)
            .filter((load) => load !== undefined);
          if (loads.length > 0) {
            const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
            const maxLoad = 100; // Percentage
            const intensity = Math.min(Math.abs(avgLoad) / maxLoad, 1);
            return this.getGradientColor(intensity, "load");
          }
        }
        return "#3b82f6";

      case "colorSensor":
        const colorSensor = point.data.sensors?.color;
        if (colorSensor?.color) {
          return this.mapPybricksColor(colorSensor.color);
        }
        return "#3b82f6";

      case "distanceSensor":
        const distanceSensor = point.data.sensors?.ultrasonic;
        if (distanceSensor?.distance !== undefined) {
          const distance = distanceSensor.distance;
          const maxDistance = 2000; // mm
          const intensity = 1 - Math.min(distance / maxDistance, 1);
          return this.getGradientColor(intensity, "distance");
        }
        return "#3b82f6";

      case "reflectionSensor":
        const reflectionSensor = point.data.sensors?.color;
        if (reflectionSensor?.reflection !== undefined) {
          const reflection = reflectionSensor.reflection;
          const intensity = reflection / 100;
          return this.getGradientColor(intensity, "reflection");
        }
        return "#3b82f6";

      case "forceSensor":
        const forceSensor = point.data.sensors?.force;
        if (forceSensor?.force !== undefined) {
          const force = Math.abs(forceSensor.force);
          const maxForce = 10; // Newtons
          const intensity = Math.min(force / maxForce, 1);
          return this.getGradientColor(intensity, "force");
        }
        return "#3b82f6";

      default:
        return "#3b82f6";
    }
  }

  private getGradientColor(intensity: number, type: string): string {
    // Clamp intensity between 0 and 1
    intensity = Math.max(0, Math.min(1, intensity));

    switch (type) {
      case "speed":
        // Green (slow) to Yellow to Red (fast)
        if (intensity < 0.5) {
          const r = Math.round(255 * (intensity * 2));
          return `rgb(${r}, 255, 0)`;
        } else {
          const g = Math.round(255 * (2 - intensity * 2));
          return `rgb(255, ${g}, 0)`;
        }

      case "load":
        // Blue (low) to Red (high)
        const r = Math.round(255 * intensity);
        const b = Math.round(255 * (1 - intensity));
        return `rgb(${r}, 0, ${b})`;

      case "distance":
        // Red (close) to Green (far)
        const dr = Math.round(255 * intensity);
        const dg = Math.round(255 * (1 - intensity));
        return `rgb(${dr}, ${dg}, 0)`;

      case "reflection":
        // Black (low) to White (high)
        const gray = Math.round(255 * intensity);
        return `rgb(${gray}, ${gray}, ${gray})`;

      case "force":
        // Light Blue (low) to Dark Red (high)
        if (intensity < 0.5) {
          const fr = Math.round(135 + 120 * (intensity * 2));
          const fg = Math.round(206 - 206 * (intensity * 2));
          const fb = Math.round(235 - 235 * (intensity * 2));
          return `rgb(${fr}, ${fg}, ${fb})`;
        } else {
          const fr = 255;
          const fg = Math.round(100 * (2 - intensity * 2));
          const fb = Math.round(100 * (2 - intensity * 2));
          return `rgb(${fr}, ${fg}, ${fb})`;
        }

      default:
        return "#3b82f6";
    }
  }

  private mapPybricksColor(color: string | any): string {
    // Handle different color formats from Pybricks
    if (typeof color === "string") {
      // Handle enum string values like "Color.RED"
      const colorName = color.replace("Color.", "").toUpperCase();
      const colorMap: Record<string, string> = {
        BLACK: "#000000",
        BLUE: "#0000FF",
        GREEN: "#00FF00",
        YELLOW: "#FFFF00",
        RED: "#FF0000",
        WHITE: "#FFFFFF",
        BROWN: "#8B4513",
        ORANGE: "#FFA500",
        PURPLE: "#800080",
        CYAN: "#00FFFF",
        MAGENTA: "#FF00FF",
        NONE: "#808080",
      };
      return colorMap[colorName] || "#808080";
    }

    // Handle RGB arrays or objects
    if (Array.isArray(color) && color.length >= 3) {
      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    }

    if (
      color &&
      typeof color === "object" &&
      "r" in color &&
      "g" in color &&
      "b" in color
    ) {
      return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }

    return "#808080"; // Default gray
  }

  exportToJSON(): string {
    return JSON.stringify(
      {
        paths: this.allPaths,
        currentPath: this.currentPath,
      },
      null,
      2
    );
  }

  importFromJSON(json: string): void {
    try {
      const data = JSON.parse(json);
      this.allPaths = data.paths || [];
      this.currentPath = data.currentPath || null;
    } catch (error) {
      console.error("Failed to import telemetry history:", error);
    }
  }
}

export const telemetryHistory = new TelemetryHistoryService();
