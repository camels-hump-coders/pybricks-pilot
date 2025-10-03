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
  private maxHistorySize = 6000; // Maximum points to keep in memory
  private isRecording = false;
  private isProgramRunning = false;
  private lastPosition = { x: 0, y: 0, heading: 0 };
  private lastRecordedMotorAngles = new Map<string, number>();
  private readonly MOTOR_SAMPLE_THRESHOLD = 5; // degrees of motor movement before adding a point
  private selectedPathChangeCallback: ((pathId: string | null) => void) | null =
    null;

  /**
   * Configure the maximum number of points to retain
   * @param maxPoints Maximum number of points (default: 6000, max: 50000)
   */
  setMaxHistorySize(maxPoints: number): void {
    // Clamp between 1000 and 50000 points
    this.maxHistorySize = Math.max(1000, Math.min(50000, maxPoints));
    console.log(
      `[TelemetryHistory] Max history size set to ${this.maxHistorySize} points`,
    );

    // Clean up existing data that exceeds the new limit
    this.cleanupOldData();
  }

  /**
   * Get current retention settings
   */
  getRetentionSettings(): { maxPoints: number } {
    return {
      maxPoints: this.maxHistorySize,
    };
  }

  /**
   * Clean up old telemetry data based on count limits
   */
  private cleanupOldData(): void {
    // Enforce total point count across all paths
    const totalPoints = this.getTotalPointCount();
    if (totalPoints > this.maxHistorySize) {
      this.enforcePointCountLimit();
    }
  }

  /**
   * Get total number of points across all paths
   */
  private getTotalPointCount(): number {
    let total = 0;
    if (this.currentPath) {
      total += this.currentPath.points.length;
    }
    for (const path of this.allPaths) {
      total += path.points.length;
    }
    return total;
  }

  /**
   * Enforce point count limit by removing oldest points
   */
  private enforcePointCountLimit(): void {
    let totalPoints = this.getTotalPointCount();
    while (totalPoints > this.maxHistorySize) {
      // Find the oldest path with points
      let oldestPath: TelemetryPath | null = null;
      let oldestTime = Infinity;

      for (const path of this.allPaths) {
        if (path.points.length > 0 && path.points[0].timestamp < oldestTime) {
          oldestTime = path.points[0].timestamp;
          oldestPath = path;
        }
      }

      if (oldestPath) {
        while (
          oldestPath.points.length > 0 &&
          totalPoints > this.maxHistorySize
        ) {
          oldestPath.points.shift(); // Remove oldest point
          totalPoints -= 1;
        }

        // Remove path if it has no points left
        if (oldestPath.points.length === 0) {
          this.allPaths = this.allPaths.filter((p) => p !== oldestPath);
        }
      } else {
        break; // No more points to remove
      }
    }
  }

  startRecording(): void {
    if (this.isRecording) return;

    this.currentPath = {
      id: `path-${Date.now()}`,
      startTime: Date.now(),
      endTime: 0,
      points: [],
    };
    this.isRecording = true;
    this.lastRecordedMotorAngles.clear();
    this.lastPosition = { x: 0, y: 0, heading: 0 };
  }

  stopRecording(): void {
    if (!this.isRecording || !this.currentPath) return;

    this.currentPath.endTime = Date.now();
    this.allPaths.push(this.currentPath);
    this.currentPath = null;
    this.isRecording = false;
    this.lastRecordedMotorAngles.clear();
    this.lastPosition = { x: 0, y: 0, heading: 0 };
  }

  addTelemetryPoint(
    telemetry: TelemetryData,
    x: number,
    y: number,
    heading: number,
    isCmdKeyPressed: boolean,
  ): void {
    if (!this.isRecording || !this.currentPath) {
      return;
    }

    // Adaptive decimation: increase thresholds when paths grow large
    const currentPoints = this.currentPath?.points.length || 0;
    const baseDist = 5;
    const baseHeading = 2;
    const distThreshold =
      currentPoints > 10000 ? 12 : currentPoints > 5000 ? 8 : baseDist;
    const headingThreshold =
      currentPoints > 10000 ? 6 : currentPoints > 5000 ? 4 : baseHeading;

    // Only add point if position has changed significantly
    const distChange = Math.sqrt(
      (x - this.lastPosition.x) ** 2 + (y - this.lastPosition.y) ** 2,
    );
    const headingChange = Math.abs(heading - this.lastPosition.heading);
    const motorChangeDetected = this.hasMotorMovement(telemetry.motors);

    if (
      !motorChangeDetected &&
      distChange < distThreshold &&
      headingChange < headingThreshold
    ) {
      return;
    }

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
    this.updateLastRecordedMotorAngles(telemetry.motors);

    // Periodically clean up old data (every 100 points to avoid performance issues)
    if (this.currentPath.points.length % 100 === 0) {
      this.cleanupOldData();
    }
  }

  getCurrentPath(): TelemetryPath | null {
    return this.currentPath;
  }

  /**
   * Get statistics about current telemetry data
   */
  getDataStatistics(): {
    totalPoints: number;
    totalPaths: number;
    currentPathPoints: number;
    memoryUsageEstimate: string;
  } {
    const totalPoints = this.getTotalPointCount();
    const currentPathPoints = this.currentPath?.points.length || 0;

    // Rough memory estimate (each point is roughly 200-500 bytes)
    const avgBytesPerPoint = 350;
    const estimatedBytes = totalPoints * avgBytesPerPoint;
    const memoryUsageEstimate =
      estimatedBytes > 1024 * 1024
        ? `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(estimatedBytes / 1024).toFixed(1)} KB`;

    return {
      totalPoints,
      totalPaths: this.allPaths.length + (this.currentPath ? 1 : 0),
      currentPathPoints,
      memoryUsageEstimate,
    };
  }

  getAllPaths(): TelemetryPath[] {
    return this.allPaths;
  }

  clearHistory(): void {
    this.allPaths = [];
    this.currentPath = null;
    this.lastRecordedMotorAngles.clear();
  }

  clearCurrentPath(): void {
    if (this.currentPath) {
      this.currentPath.points = [];
      this.currentPath.startTime = Date.now();
      this.lastRecordedMotorAngles.clear();
      this.lastPosition = { x: 0, y: 0, heading: 0 };
    }
  }

  private hasMotorMovement(
    motors?: TelemetryData["motors"],
  ): boolean {
    if (!motors || Object.keys(motors).length === 0) {
      return false;
    }

    if (this.lastRecordedMotorAngles.size === 0) {
      return true;
    }

    for (const [name, data] of Object.entries(motors)) {
      const previous = this.lastRecordedMotorAngles.get(name);
      if (previous === undefined) {
        return true;
      }
      if (Math.abs(data.angle - previous) >= this.MOTOR_SAMPLE_THRESHOLD) {
        return true;
      }
    }

    for (const name of this.lastRecordedMotorAngles.keys()) {
      if (!(name in motors)) {
        return true;
      }
    }

    return false;
  }

  private updateLastRecordedMotorAngles(
    motors?: TelemetryData["motors"],
  ): void {
    this.lastRecordedMotorAngles.clear();
    if (!motors) {
      return;
    }
    for (const [name, data] of Object.entries(motors)) {
      this.lastRecordedMotorAngles.set(name, data.angle);
    }
  }

  deletePath(pathId: string): boolean {
    const initialLength = this.allPaths.length;
    this.allPaths = this.allPaths.filter((path) => path.id !== pathId);
    return this.allPaths.length < initialLength; // Return true if a path was deleted
  }

  isRecordingActive(): boolean {
    return this.isRecording;
  }

  getIsProgramRunning(): boolean {
    return this.isProgramRunning;
  }

  onMatReset(): void {
    this.stopRecording(); // Stop current recording if any
    this.clearHistory(); // Clear all history
    this.startRecording(); // Start fresh recording
  }

  // Start a new telemetry path without clearing existing paths
  startNewPath(): void {
    this.stopRecording(); // Stop current recording and save to allPaths
    this.startRecording(); // Start new recording

    // Auto-select the new path
    if (this.currentPath && this.selectedPathChangeCallback) {
      this.selectedPathChangeCallback(this.currentPath.id);
    }
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

      case "motorLoad": {
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
      }

      case "colorSensor": {
        const colorSensor = point.data.sensors?.color;
        if (colorSensor?.color) {
          return this.mapPybricksColor(colorSensor.color);
        }
        return "#3b82f6";
      }

      case "distanceSensor": {
        const distanceSensor = point.data.sensors?.ultrasonic;
        if (distanceSensor?.distance !== undefined) {
          const distance = distanceSensor.distance;
          const maxDistance = 2000; // mm
          const intensity = 1 - Math.min(distance / maxDistance, 1);
          return this.getGradientColor(intensity, "distance");
        }
        return "#3b82f6";
      }

      case "reflectionSensor": {
        const reflectionSensor = point.data.sensors?.color;
        if (reflectionSensor?.reflection !== undefined) {
          const reflection = reflectionSensor.reflection;
          const intensity = reflection / 100;
          return this.getGradientColor(intensity, "reflection");
        }
        return "#3b82f6";
      }

      case "forceSensor": {
        const forceSensor = point.data.sensors?.force;
        if (forceSensor?.force !== undefined) {
          const force = Math.abs(forceSensor.force);
          const maxForce = 10; // Newtons
          const intensity = Math.min(force / maxForce, 1);
          return this.getGradientColor(intensity, "force");
        }
        return "#3b82f6";
      }

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

      case "load": {
        // Blue (low) to Red (high)
        const r = Math.round(255 * intensity);
        const b = Math.round(255 * (1 - intensity));
        return `rgb(${r}, 0, ${b})`;
      }

      case "distance": {
        // Red (close) to Green (far)
        const dr = Math.round(255 * intensity);
        const dg = Math.round(255 * (1 - intensity));
        return `rgb(${dr}, ${dg}, 0)`;
      }

      case "reflection": {
        // Black (low) to White (high)
        const gray = Math.round(255 * intensity);
        return `rgb(${gray}, ${gray}, ${gray})`;
      }

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
      2,
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

  // Set callback for when selected path should change
  setSelectedPathChangeCallback(
    callback: (pathId: string | null) => void,
  ): void {
    this.selectedPathChangeCallback = callback;
  }

  // Remove the callback
  removeSelectedPathChangeCallback(): void {
    this.selectedPathChangeCallback = null;
  }
}

export const telemetryHistory = new TelemetryHistoryService();
