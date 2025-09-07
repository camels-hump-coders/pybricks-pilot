import type { RobotConfig } from "../schemas/RobotConfig";

// Build the quick start program code based on current robot configuration
export function generateQuickStartCode(config: RobotConfig): string {
  const cfg: any = config as any;

  // Derive drivebase defaults from config if not explicitly provided
  const d = cfg.drivebase || {
    leftMotorPort: "A",
    rightMotorPort: "B",
    leftReversed: false,
    rightReversed: false,
    wheelDiameterMm: cfg?.wheels?.left?.diameter || 56,
    axleTrackMm: cfg?.dimensions?.width ? cfg.dimensions.width * 8 : 120,
  };

  // Additional motors
  const extraMotors = cfg.motors || [];
  const motorLines: string[] = [];
  for (const m of extraMotors) {
    motorLines.push(
      `
try:
    ${m.name} = Motor(Port.${m.port})
    pilot.register_motor("${m.name}", ${m.name})
except Exception as e:
    print("[PILOT] Failed to init motor ${m.name} on ${m.port}:", e)`,
    );
  }

  // Sensors
  const sensors = cfg.sensors || [];
  const sensorLines: string[] = [];
  for (const s of sensors) {
    let cls = "ColorSensor";
    if (s.type === "ultrasonic") cls = "UltrasonicSensor";
    else if (s.type === "force") cls = "ForceSensor";
    else if (s.type === "gyro") cls = "GyroSensor";
    sensorLines.push(
      `
try:
    ${s.name} = ${cls}(Port.${s.port})
    pilot.register_sensor("${s.name}", ${s.name})
except Exception as e:
    print("[PILOT] Failed to init ${s.type} sensor on ${s.port}:", e)`,
    );
  }

  // Async-compatible program used by the hub menu orchestrator
  return `
# Auto-generated Quick Start program by PyBricks Pilot

from pybricks.hubs import PrimeHub
from pybricks.parameters import Port, Direction
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor, GyroSensor
from pybricks.robotics import DriveBase

import pybrickspilot as pilot

hub = PrimeHub()
pilot.register_hub(hub)

# Drivebase motors
left = Motor(Port.${d.leftMotorPort}${d.leftReversed ? ", positive_direction=Direction.COUNTERCLOCKWISE" : ""})
right = Motor(Port.${d.rightMotorPort}${d.rightReversed ? ", positive_direction=Direction.COUNTERCLOCKWISE" : ""})
db = DriveBase(left, right, ${Math.round(d.wheelDiameterMm)}, ${Math.round(d.axleTrackMm)})

pilot.register_drivebase(db)
pilot.register_motor("left", left)
pilot.register_motor("right", right)

${motorLines.join("\n") || "# No extra motors configured"}

${sensorLines.join("\n") || "# No sensors configured"}

async def run():
  print("Running program")
  
`;
}

