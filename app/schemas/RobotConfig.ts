export interface RobotConfig {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;

  // Physical dimensions (in LEGO studs)
  dimensions: {
    width: number; // Number of studs across (1 stud = 8mm)
    length: number; // Number of studs long
    height?: number; // Optional height in studs
  };

  // Wheel configuration (in studs from robot center)
  wheels: {
    left: WheelPosition;
    right: WheelPosition;
  };

  // Center of rotation (automatically calculated from wheel positions)
  centerOfRotation: {
    distanceFromLeftEdge: number; // studs from left edge of robot
    distanceFromTop: number; // studs from top edge of robot (Y=0 at top, Y+ down)
  };

  // Visual appearance
  appearance: {
    primaryColor: string;
    secondaryColor: string;
    wheelColor: string;
    showStuds: boolean;
    showGrid: boolean;
  };

  // Robot capabilities
  capabilities: {
    maxSpeed: number; // mm/s
    turnRadius: number; // mm
    hasGyro: boolean;
    hasColorSensor: boolean;
    hasDistanceSensor: boolean;
  };

  // Metadata
  tags: string[];
  isDefault: boolean;
}

interface WheelPosition {
  distanceFromEdge: number; // studs from left/right edge of robot (wheels are symmetric)
  distanceFromTop: number; // studs from top edge of robot (Y=0 at top, Y+ down)
  diameter: number; // mm
  width: number; // mm
}

interface LegoStud {
  x: number; // stud position (0-based)
  y: number; // stud position (0-based)
  type: "empty" | "filled" | "wheel" | "sensor" | "motor";
  color?: string;
}

interface RobotBuilderState {
  selectedTool: "select" | "fill" | "wheel" | "sensor" | "motor" | "eraser";
  selectedColor: string;
  gridSize: number; // studs
  showGrid: boolean;
  showStuds: boolean;
  zoom: number;
  pan: { x: number; y: number };
}

// Default robot configuration
export const DEFAULT_ROBOT_CONFIG: RobotConfig = {
  id: "default",
  name: "Default FLL Robot",
  description: "Standard 180mm × 200mm FLL robot with center wheels",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),

  dimensions: {
    width: 22, // 22 studs × 8mm = 176mm (close to 180mm)
    length: 25, // 25 studs × 8mm = 200mm
    height: 4, // 4 studs high
  },

  wheels: {
    left: {
      distanceFromEdge: 2, // 2 studs from left/right edge
      distanceFromTop: 10, // 10 studs from top edge
      diameter: 56, // Standard LEGO wheel diameter
      width: 20, // Standard LEGO wheel width
    },
    right: {
      distanceFromEdge: 2, // 2 studs from left/right edge (symmetric)
      distanceFromTop: 10, // 10 studs from top edge
      diameter: 56, // Standard LEGO wheel diameter
      width: 20, // Standard LEGO wheel width
    },
  },

  centerOfRotation: {
    distanceFromLeftEdge: 11, // Auto-calculated: (2 + (22-2)) / 2 = 11 studs from left edge
    distanceFromTop: 10, // Same Y as wheels: 10 studs from top edge
  },

  appearance: {
    primaryColor: "#007bff",
    secondaryColor: "#0056b3",
    wheelColor: "#333333",
    showStuds: true,
    showGrid: true,
  },

  capabilities: {
    maxSpeed: 300, // mm/s
    turnRadius: 90, // mm
    hasGyro: true,
    hasColorSensor: true,
    hasDistanceSensor: true,
  },

  tags: ["default", "fll", "standard"],
  isDefault: true,
};

// LEGO stud size constants
export const LEGO_STUD_SIZE_MM = 8; // 1 stud = 8mm

// Convert studs to mm
export const studsToMm = (studs: number): number => studs * LEGO_STUD_SIZE_MM;

// Automatically calculate center of rotation from wheel positions
export const calculateCenterOfRotation = (config: RobotConfig) => {
  // Center of rotation is at the midpoint between the wheels along the axle
  // X position: midpoint between left and right wheels
  const leftWheelX = config.wheels.left.distanceFromEdge;
  const rightWheelX =
    config.dimensions.width - config.wheels.right.distanceFromEdge;
  const centerOfRotationX = (leftWheelX + rightWheelX) / 2;

  // Y position: same as wheel Y position (distance from top edge)
  // STANDARDIZED COORDINATE SYSTEM: Y=0 at top, Y+ points down
  // This matches the world coordinate system used throughout the application
  const centerOfRotationY = config.wheels.left.distanceFromTop;

  return {
    distanceFromLeftEdge: centerOfRotationX,
    distanceFromTop: centerOfRotationY,
  };
};
