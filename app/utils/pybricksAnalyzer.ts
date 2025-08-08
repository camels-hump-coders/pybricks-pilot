export interface PybricksAnalysis {
  isPybricksCode: boolean;
  detectedHubs: string[];
  detectedMotors: string[];
  detectedSensors: string[];
  hasMainFunction: boolean;
  hasLoops: boolean;
  hasTelemetry: boolean;
  warnings: string[];
  suggestions: string[];
}

export function analyzePybricksCode(code: string): PybricksAnalysis {
  const lines = code.split("\n");
  const analysis: PybricksAnalysis = {
    isPybricksCode: false,
    detectedHubs: [],
    detectedMotors: [],
    detectedSensors: [],
    hasMainFunction: false,
    hasLoops: false,
    hasTelemetry: false,
    warnings: [],
    suggestions: [],
  };

  // Check for Pybricks imports
  const pybricksImportPattern = /from\s+pybricks|import\s+pybricks/;
  analysis.isPybricksCode = pybricksImportPattern.test(code);

  // Detect hub types
  const hubPatterns = [
    {
      pattern: /PrimeHub|TechnicHub|CityHub|MoveHub|EssentialHub/,
      hub: "LEGO Hub",
    },
    { pattern: /EV3Brick/, hub: "EV3 Brick" },
  ];

  for (const { pattern, hub } of hubPatterns) {
    if (pattern.test(code) && !analysis.detectedHubs.includes(hub)) {
      analysis.detectedHubs.push(hub);
    }
  }

  // Detect motors
  const motorPatterns = [
    { pattern: /Motor\(Port\.[A-F]\)/, type: "Single Motor" },
    { pattern: /DriveBase/, type: "Drive Base" },
  ];

  for (const { pattern, type } of motorPatterns) {
    if (pattern.test(code) && !analysis.detectedMotors.includes(type)) {
      analysis.detectedMotors.push(type);
    }
  }

  // Detect sensors
  const sensorPatterns = [
    { pattern: /ColorSensor/, type: "Color Sensor" },
    { pattern: /UltrasonicSensor/, type: "Ultrasonic Sensor" },
    { pattern: /TouchSensor/, type: "Touch Sensor" },
    { pattern: /GyroSensor/, type: "Gyro Sensor" },
    { pattern: /ForceSensor/, type: "Force Sensor" },
  ];

  for (const { pattern, type } of sensorPatterns) {
    if (pattern.test(code) && !analysis.detectedSensors.includes(type)) {
      analysis.detectedSensors.push(type);
    }
  }

  // Check for main function
  analysis.hasMainFunction = /def\s+main\s*\(/.test(code);

  // Check for loops
  analysis.hasLoops = /(while|for)\s+/.test(code);

  // Check for telemetry patterns
  analysis.hasTelemetry = /print\(|hub\.display|hub\.light\.on/.test(code);

  // Generate warnings and suggestions
  if (analysis.isPybricksCode) {
    if (!analysis.hasMainFunction) {
      analysis.suggestions.push(
        "Consider using a main() function to organize your code"
      );
    }

    if (!analysis.hasTelemetry) {
      analysis.suggestions.push(
        "Add print() statements or hub display updates for debugging"
      );
    }

    if (analysis.detectedMotors.length === 0 && analysis.isPybricksCode) {
      analysis.warnings.push(
        "No motors detected - make sure to import and initialize motors"
      );
    }

    if (analysis.detectedHubs.length === 0 && analysis.isPybricksCode) {
      analysis.warnings.push(
        "No hub detected - make sure to import and initialize your hub"
      );
    }

    // Check for common issues
    if (
      code.includes("time.sleep") &&
      !code.includes("from time import sleep")
    ) {
      analysis.warnings.push(
        'Use "from time import sleep" or "wait()" from pybricks.tools'
      );
    }

    if (code.includes("while True:") && !code.includes("wait(")) {
      analysis.warnings.push(
        "Consider adding wait() calls in infinite loops to prevent blocking"
      );
    }

    // Check for proper imports
    if (
      analysis.detectedMotors.length > 0 &&
      !code.includes("from pybricks.pupdevices import Motor")
    ) {
      analysis.warnings.push(
        'Missing motor import: add "from pybricks.pupdevices import Motor"'
      );
    }

    if (
      analysis.detectedSensors.length > 0 &&
      !code.includes("from pybricks.pupdevices import")
    ) {
      analysis.warnings.push("Missing sensor imports from pybricks.pupdevices");
    }
  }

  return analysis;
}

export function generatePybricksTemplate(
  hubType: "prime" | "essential" | "inventor" = "prime"
): string {
  const templates = {
    prime: `
from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor
from pybricks.parameters import Color, Direction, Port, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait

# === Hardware Setup (Module Level) ===
# All hardware initialization must happen here, before main() is called
# This ensures hardware is ready before parallel execution begins

# Initialize the hub
hub = PrimeHub()

# Initialize motors (adjust ports as needed)
left_motor = Motor(Port.B, Direction.COUNTERCLOCKWISE)
right_motor = Motor(Port.A, Direction.CLOCKWISE)

# Initialize sensors (adjust ports as needed)  
color_sensor = ColorSensor(Port.C)
distance_sensor = UltrasonicSensor(Port.D)

# Initialize drive base
robot = DriveBase(left_motor, right_motor, wheel_diameter=56, axle_track=114)

# === PybricksPilot Hardware Registration ===
# Register all hardware with PybricksPilot for automatic telemetry and control
setup_basic_robot(
    hub=hub,
    left_motor=left_motor,
    right_motor=right_motor,
    drivebase=robot
)

# === PybricksPilot Standard Contract ===
# Your main program logic goes in the main() function below
# Hardware setup happens above (module level)
# main() runs in parallel with telemetry and remote control

def main():
    """
    Main program function - runs in parallel with PybricksPilot telemetry
    
    PybricksPilot Features:
    - Real-time telemetry streams continuously (every 100ms)
    - Remote control commands processed immediately  
    - Hardware monitoring and JSON data export
    - True parallel execution using Pybricks multitask
    """
    print("=== PybricksPilot Standard Contract Demo ===")
    print("This main() function runs in parallel with telemetry!")
    
    # Allow sensors to initialize
    print("Initializing sensors...")
    wait(1000)  # Give sensors time to stabilize
    
    # Main program loop
    for i in range(20):
        print(f"Loop iteration: {i + 1}")
        
        # Check sensors - handle sensor initialization gracefully
        try:
            distance = distance_sensor.distance()
            # Handle case where sensor returns <wait> object during initialization
            if not isinstance(distance, (int, float)):
                distance = 1000  # Safe default - assume path is clear
        except:
            distance = 1000  # Safe fallback
            
        try:
            detected_color = color_sensor.color()
            # Handle case where sensor returns <wait> object
            if not hasattr(detected_color, 'name'):  # Not a proper Color enum
                detected_color = Color.NONE  # Safe default
        except:
            detected_color = Color.NONE  # Safe fallback
        
        print(f"Distance: {distance} mm, Color: {detected_color}")
        
        # Simple behavior based on sensors
        if distance > 200:  # Path is clear
            robot.drive(100, 0)  # Drive forward
            hub.light.on(Color.GREEN)
            print("Driving forward - path clear")
        else:  # Obstacle detected
            robot.stop()
            robot.turn(45)  # Turn 45 degrees
            hub.light.on(Color.YELLOW)
            print("Obstacle detected - turning")
        
        # Check for black line
        if detected_color == Color.BLACK:
            robot.stop()
            hub.light.on(Color.RED)
            print("Black line detected - stopping")
            wait(500)  # Automatically becomes: await wait(500)
        
        wait(100)  # Automatically becomes: await wait(100)
    
    print("=== Main Program Complete ===")
    print("Telemetry continues running indefinitely!")
    robot.stop()
    hub.light.off()

# Note: PybricksPilot will automatically call main() in parallel with telemetry
`,
    essential: `
from pybricks.hubs import EssentialHub
from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Color, Direction, Port, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait

# Initialize the hub
hub = EssentialHub()

# Initialize motors (adjust ports as needed)
left_motor = Motor(Port.A, Direction.COUNTERCLOCKWISE)
right_motor = Motor(Port.B, Direction.CLOCKWISE)

# Initialize sensor (adjust port as needed)
color_sensor = ColorSensor(Port.C)

# Initialize drive base  
robot = DriveBase(left_motor, right_motor, wheel_diameter=56, axle_track=114)

# === PybricksPilot Hardware Registration ===
# Register hardware with PybricksPilot for telemetry and control
setup_basic_robot(
    hub=hub,
    left_motor=left_motor, 
    right_motor=right_motor,
    drivebase=robot
)

# Register sensor separately (Essential Hub focused demo)
register_sensor("color", color_sensor)

# === PybricksPilot Essential Hub Demo ===
# This program showcases PybricksPilot auto-instrumentation
# with LEGO Essential Hub (2-port hub)

print("=== Essential Hub Demo Starting ===")
print("PybricksPilot will auto-detect and monitor:")
print("- Hub battery and status") 
print("- Left and right motors")
print("- Color sensor readings")
print("- Drive base movements")

# Allow sensors to initialize
print("Initializing color sensor...")
wait(1000)  # Give sensor time to stabilize

# Simple line following behavior
for i in range(30):
    print("Scan", i + 1, "- checking for line...")
    
    # Read color sensor with error handling
    try:
        detected_color = color_sensor.color()
        if not hasattr(detected_color, 'name'):  # Handle <wait> object
            detected_color = Color.NONE
    except:
        detected_color = Color.NONE
        
    try:
        reflection = color_sensor.reflection()
        if not isinstance(reflection, (int, float)):  # Handle <wait> object
            reflection = 50  # Safe default
    except:
        reflection = 50  # Safe default
    
    print("Color:", detected_color, "Reflection:", reflection, "%")
    
    # Simple line following logic
    if reflection < 30:  # Dark surface (line)
        # On the line - drive forward
        robot.drive(50, 0)
        hub.light.on(Color.GREEN)
        print("On line - driving straight")
        
    elif reflection > 70:  # Light surface
        # Off the line - turn to search
        robot.drive(30, 90)  # Drive and turn
        hub.light.on(Color.YELLOW)  
        print("Off line - searching...")
        
    else:  # Medium reflection
        # Edge of line - slight adjustment
        robot.drive(40, -30)
        hub.light.on(Color.BLUE)
        print("Line edge - adjusting course")
    
    # PybricksPilot provides automatic:
    # - Real-time telemetry streaming
    # - Remote control capabilities  
    # - Hardware monitoring and diagnostics
    
    wait(200)  # Short delay

print("=== Demo Complete ===")
robot.stop()
hub.light.off()
`,
    inventor: `
from pybricks.hubs import InventorHub
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor
from pybricks.parameters import Color, Direction, Port, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait

# Initialize the hub
hub = InventorHub()

# Initialize motors (adjust ports as needed)
left_motor = Motor(Port.B, Direction.COUNTERCLOCKWISE)
right_motor = Motor(Port.A, Direction.CLOCKWISE)
arm_motor = Motor(Port.C)

# Initialize sensors (adjust ports as needed)
color_sensor = ColorSensor(Port.D)
distance_sensor = UltrasonicSensor(Port.E)
force_sensor = ForceSensor(Port.F)

# Initialize drive base
robot = DriveBase(left_motor, right_motor, wheel_diameter=56, axle_track=114)

# === PybricksPilot Hardware Registration ===
# Use advanced setup for multiple motors and sensors
motors_dict = {
    "left": left_motor,
    "right": right_motor,
    "arm": arm_motor
}

sensors_dict = {
    "color": color_sensor,
    "distance": distance_sensor,
    "force": force_sensor
}

setup_advanced_robot(
    hub=hub,
    motors_dict=motors_dict,
    sensors_dict=sensors_dict,
    drivebase=robot
)

# === PybricksPilot Inventor Hub Demo ===
# Advanced demo showcasing multiple sensors and actuators
# with full PybricksPilot instrumentation

print("=== Inventor Hub Advanced Demo ===")
print("PybricksPilot will monitor:")
print("- Hub battery, IMU, and system status")
print("- 3 motors: left_motor, right_motor, arm_motor") 
print("- 3 sensors: color, distance, force")
print("- Drive base with full state tracking")

# Allow sensors to initialize
print("Initializing sensors...")
wait(2000)  # Give all sensors time to stabilize

# Advanced robot behavior demonstration
for mission in range(10):
    print("=== Mission", mission + 1, "===")
    
    # Sensor readings with error handling
    try:
        distance = distance_sensor.distance()
        if not isinstance(distance, (int, float)):
            distance = 1000  # Safe default
    except:
        distance = 1000
        
    try:
        color = color_sensor.color()
        if not hasattr(color, 'name'):
            color = Color.NONE
    except:
        color = Color.NONE
        
    try:
        reflection = color_sensor.reflection()
        if not isinstance(reflection, (int, float)):
            reflection = 50  # Safe default
    except:
        reflection = 50
        
    try:
        force_pressed = force_sensor.pressed()
        if not isinstance(force_pressed, bool):
            force_pressed = False  # Safe default
    except:
        force_pressed = False
        
    try:
        force_value = force_sensor.force()
        if not isinstance(force_value, (int, float)):
            force_value = 0  # Safe default
    except:
        force_value = 0
    
    print("Sensors - Distance:", distance, "Color:", color, "Force:", force_value)
    
    # Complex behavior based on multiple sensors
    if force_pressed:
        # Force sensor pressed - emergency stop
        robot.stop()
        arm_motor.stop()
        hub.light.on(Color.RED)
        print("EMERGENCY STOP - Force sensor activated!")
        
        # Wait for release
        while force_sensor.pressed():
            wait(100)
        
    elif distance < 100:
        # Obstacle close - avoid it
        print("Obstacle avoidance mode")
        robot.stop()
        
        # Use arm to check obstacle
        arm_motor.run_angle(200, 90)  # Raise arm
        wait(500)
        
        # Turn away from obstacle
        robot.turn(90)
        hub.light.on(Color.YELLOW)
        
        # Lower arm
        arm_motor.run_angle(200, -90)
        
    elif color == Color.RED:
        # Red detected - special action
        print("Red target detected - executing pickup sequence")
        robot.stop()
        
        # Pickup sequence
        hub.light.on(Color.MAGENTA)
        arm_motor.run_angle(300, 180)  # Arm down
        wait(500)
        robot.straight(50)  # Approach
        arm_motor.run_angle(300, -180)  # Arm up
        robot.straight(-50)  # Back away
        
    elif reflection < 20:
        # Dark line - follow it
        print("Line following mode")
        robot.drive(100, 0)  # Drive forward
        hub.light.on(Color.GREEN)
        
    else:
        # Normal exploration
        print("Exploration mode")
        robot.drive(80, 10)  # Drive with slight turn
        hub.light.on(Color.BLUE)
        
        # Occasional arm movement
        if mission % 3 == 0:
            arm_motor.run_angle(150, 45)
            wait(200)
            arm_motor.run_angle(150, -45)
    
    # PybricksPilot provides comprehensive monitoring:
    # - All motor angles, speeds, and loads
    # - All sensor values in real-time  
    # - Hub battery, IMU (accelerometer, gyro)
    # - Drive base distance, angle, and state
    # - Remote control capabilities for all actuators
    
    wait(300)  # Mission delay

print("=== All Missions Complete ===")
robot.stop()
arm_motor.run_angle(200, 0)  # Return arm to neutral
hub.light.off()
`,
  };

  return templates[hubType];
}
