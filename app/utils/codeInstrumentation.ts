import pybricksPilotCode from "../assets/pybrickspilot.py?raw";

export interface InstrumentationOptions {
  enableTelemetry?: boolean;
  telemetryInterval?: number;
  enableRemoteControl?: boolean;
  autoDetectHardware?: boolean;
  debugMode?: boolean;
}

/**
 * Analyzes user code to automatically detect hardware components
 */
export function analyzeUserCode(code: string): {
  hasHub: boolean;
  motors: string[];
  sensors: string[];
  hasDrivebase: boolean;
  hasGyro: boolean;
} {
  const lines = code.split("\n");
  const result = {
    hasHub: false,
    motors: [] as string[],
    sensors: [] as string[],
    hasDrivebase: false,
    hasGyro: false,
  };

  // Patterns to detect hardware initialization
  const hubPattern = /(\w+)\s*=\s*\w*Hub\s*\(/;
  const motorPattern = /(\w+)\s*=\s*Motor\s*\(/;
  const sensorPattern =
    /(\w+)\s*=\s*(ColorSensor|UltrasonicSensor|ForceSensor|RotationSensor|GyroSensor)\s*\(/;
  const drivebasePattern = /(\w+)\s*=\s*DriveBase\s*\(/;
  const gyroPattern = /(\w+)\s*=\s*GyroSensor\s*\(/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("#")) continue;

    // Check for hub
    const hubMatch = trimmed.match(hubPattern);
    if (hubMatch) {
      result.hasHub = true;
    }

    // Check for motors
    const motorMatch = trimmed.match(motorPattern);
    if (motorMatch) {
      result.motors.push(motorMatch[1]);
    }

    // Check for sensors
    const sensorMatch = trimmed.match(sensorPattern);
    if (sensorMatch) {
      result.sensors.push(sensorMatch[1]);
      if (sensorMatch[2] === "GyroSensor") {
        result.hasGyro = true;
      }
    }

    // Check for drivebase
    const drivebaseMatch = trimmed.match(drivebasePattern);
    if (drivebaseMatch) {
      result.hasDrivebase = true;
    }

    // Check for gyro
    const gyroMatch = trimmed.match(gyroPattern);
    if (gyroMatch) {
      result.hasGyro = true;
    }
  }

  return result;
}

/**
 * Generates auto-instrumentation code based on detected hardware
 */
function generateInstrumentationCode(
  analysis: ReturnType<typeof analyzeUserCode>,
  options: InstrumentationOptions = {}
): string {
  let instrumentationCode = "\n# === PybricksPilot Auto-Instrumentation ===\n";
  // Don't import - the pilot functions are already injected above
  instrumentationCode += "# PybricksPilot functions are now available\n\n";

  // Configure pilot settings
  if (options.enableTelemetry !== undefined) {
    instrumentationCode += `set_telemetry_enabled(${options.enableTelemetry ? "True" : "False"})\n`;
  }

  if (options.telemetryInterval) {
    instrumentationCode += `set_telemetry_interval(${options.telemetryInterval})\n`;
  }

  instrumentationCode += "\n# Auto-detected hardware registration:\n";

  // Determine whether to use basic or advanced setup
  const hasMultipleMotors = analysis.motors.length > 2;
  const hasMultipleSensors = analysis.sensors.length > 1;
  const useAdvancedSetup = hasMultipleMotors || hasMultipleSensors;

  if (useAdvancedSetup) {
    instrumentationCode +=
      "# Using advanced setup for multiple motors/sensors\n";
    instrumentationCode += "try:\n";

    // Build motors dictionary
    instrumentationCode += "    _motors_dict = {}\n";
    const motorNames = ["left", "right", "arm", "lift", "grab"];
    analysis.motors.forEach((motorVar, index) => {
      let motorName = motorNames[index] || `motor${index + 1}`;

      // Try to infer name from variable name
      const varLower = motorVar.toLowerCase();
      if (varLower.includes("left")) motorName = "left";
      else if (varLower.includes("right")) motorName = "right";
      else if (varLower.includes("arm")) motorName = "arm";
      else if (varLower.includes("lift")) motorName = "lift";
      else if (varLower.includes("grab")) motorName = "grab";

      instrumentationCode += `    try: _motors_dict["${motorName}"] = ${motorVar}\n`;
      instrumentationCode += `    except: pass\n`;
    });

    // Build sensors dictionary
    instrumentationCode += "    _sensors_dict = {}\n";
    const sensorNames = ["color", "distance", "force", "rotation", "gyro"];
    analysis.sensors.forEach((sensorVar, index) => {
      let sensorName = sensorNames[index] || `sensor${index + 1}`;

      // Try to infer name from variable name
      const varLower = sensorVar.toLowerCase();
      if (varLower.includes("color")) sensorName = "color";
      else if (varLower.includes("distance") || varLower.includes("ultrasonic"))
        sensorName = "distance";
      else if (varLower.includes("force") || varLower.includes("touch"))
        sensorName = "force";
      else if (varLower.includes("rotation") || varLower.includes("angle"))
        sensorName = "rotation";
      else if (varLower.includes("gyro")) sensorName = "gyro";

      instrumentationCode += `    try: _sensors_dict["${sensorName}"] = ${sensorVar}\n`;
      instrumentationCode += `    except: pass\n`;
    });

    // Find drivebase variable
    instrumentationCode += "    _drivebase = None\n";
    if (analysis.hasDrivebase) {
      instrumentationCode += "    try: _drivebase = robot\n";
      instrumentationCode += "    except:\n";
      instrumentationCode += "        try: _drivebase = drive_base\n";
      instrumentationCode += "        except:\n";
      instrumentationCode += "            try: _drivebase = drivebase\n";
      instrumentationCode += "            except: pass\n";
    }

    // Call setup_advanced_robot
    if (analysis.hasHub) {
      instrumentationCode += "    setup_advanced_robot(\n";
      instrumentationCode += "        hub=hub,\n";
      instrumentationCode += "        motors_dict=_motors_dict,\n";
      instrumentationCode += "        sensors_dict=_sensors_dict,\n";
      instrumentationCode += "        drivebase=_drivebase\n";
      instrumentationCode += "    )\n";
    }

    instrumentationCode += "except Exception as e:\n";
    instrumentationCode += "    print('[PILOT] Advanced setup failed:', e)\n";
    instrumentationCode +=
      "    print('[PILOT] Falling back to individual registration')\n";
    // Fallback to individual registration
    instrumentationCode += "    try: register_hub(hub)\n";
    instrumentationCode += "    except: pass\n";
    instrumentationCode += "except:\n";
    instrumentationCode +=
      "    print('[PILOT] Hardware registration failed')\n";
  } else {
    // Use basic setup for simple robots (hub + 2 motors + drivebase)
    instrumentationCode +=
      "# Using basic setup for simple robot configuration\n";
    instrumentationCode += "try:\n";

    // Find left/right motors
    let leftMotor = "None";
    let rightMotor = "None";

    analysis.motors.forEach((motorVar) => {
      const varLower = motorVar.toLowerCase();
      if (varLower.includes("left")) {
        leftMotor = motorVar;
      } else if (varLower.includes("right")) {
        rightMotor = motorVar;
      } else if (leftMotor === "None") {
        leftMotor = motorVar; // First motor becomes left
      } else if (rightMotor === "None") {
        rightMotor = motorVar; // Second motor becomes right
      }
    });

    // Find drivebase
    let drivebaseVar = "None";
    if (analysis.hasDrivebase) {
      drivebaseVar = "robot"; // Try common names
      instrumentationCode += "    _drivebase = None\n";
      instrumentationCode += "    try: _drivebase = robot\n";
      instrumentationCode += "    except:\n";
      instrumentationCode += "        try: _drivebase = drive_base\n";
      instrumentationCode += "        except:\n";
      instrumentationCode += "            try: _drivebase = drivebase\n";
      instrumentationCode += "            except: _drivebase = None\n";
      drivebaseVar = "_drivebase";
    }

    if (analysis.hasHub && leftMotor !== "None" && rightMotor !== "None") {
      instrumentationCode += `    setup_basic_robot(\n`;
      instrumentationCode += `        hub=hub,\n`;
      instrumentationCode += `        left_motor=${leftMotor},\n`;
      instrumentationCode += `        right_motor=${rightMotor},\n`;
      instrumentationCode += `        drivebase=${drivebaseVar}\n`;
      instrumentationCode += `    )\n`;

      // Register any additional sensors
      analysis.sensors.forEach((sensorVar, index) => {
        const sensorNames = ["color", "distance", "force", "rotation", "gyro"];
        let sensorName = sensorNames[index] || `sensor${index + 1}`;

        const varLower = sensorVar.toLowerCase();
        if (varLower.includes("color")) sensorName = "color";
        else if (
          varLower.includes("distance") ||
          varLower.includes("ultrasonic")
        )
          sensorName = "distance";
        else if (varLower.includes("force") || varLower.includes("touch"))
          sensorName = "force";
        else if (varLower.includes("rotation") || varLower.includes("angle"))
          sensorName = "rotation";
        else if (varLower.includes("gyro")) sensorName = "gyro";

        instrumentationCode += `    try: register_sensor("${sensorName}", ${sensorVar})\n`;
        instrumentationCode += `    except: pass\n`;
      });
    }

    instrumentationCode += "except Exception as e:\n";
    instrumentationCode += "    print('[PILOT] Basic setup failed:', e)\n";
    instrumentationCode +=
      "    print('[PILOT] Falling back to individual registration')\n";
    // Fallback to individual registration
    instrumentationCode += "    try: register_hub(hub)\n";
    instrumentationCode += "    except: pass\n";
    instrumentationCode += "except:\n";
    instrumentationCode +=
      "    print('[PILOT] Hardware registration failed')\n";
  }

  instrumentationCode += "\n# === End Auto-Instrumentation ===\n\n";

  return instrumentationCode;
}

/**
 * Wraps user code with parallel instrumentation system using standard contract
 */
function wrapWithInstrumentation(
  code: string,
  options: InstrumentationOptions = {}
): string {
  // Check if the user code already has a main() function (sync or async)
  const hasMainFunction = /(async\s+)?def\s+main\s*\(/.test(code);
  const isMainAsync = /async\s+def\s+main\s*\(/.test(code);

  let wrappedCode = "# PybricksPilot Standard Contract Wrapper\n";
  wrappedCode += "# User hardware initialization happens at module level\n";
  wrappedCode += "# User main() function runs in parallel with telemetry\n\n";

  if (hasMainFunction) {
    // User already follows the contract - just add the user code as-is
    wrappedCode += "# User code (already has main() function)\n";

    // Convert main() to async_main() without using inspect module
    // Parse user code to extract main function content
    const lines = code.split("\n");
    let setupLines: string[] = [];
    let mainFunctionLines: string[] = [];
    let inMainFunction = false;
    let mainIndentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Detect main function start (sync or async)
      if (
        (trimmedLine.startsWith("def main(") ||
          trimmedLine.startsWith("async def main(")) &&
        trimmedLine.includes(":")
      ) {
        inMainFunction = true;
        mainIndentLevel = line.length - line.trimStart().length; // Get indentation level
        continue; // Skip the def main(): line
      }

      // If we're in main function
      if (inMainFunction) {
        // Check if this line ends the function (unindented non-empty line)
        const currentIndentLevel = line.length - line.trimStart().length;
        if (trimmedLine && currentIndentLevel <= mainIndentLevel) {
          // End of main function
          inMainFunction = false;
          setupLines.push(line); // This line belongs to setup
        } else {
          // Inside main function - remove one level of indentation
          if (line.trim()) {
            const unindentedLine = line.substring(mainIndentLevel + 4); // Remove main function indentation
            mainFunctionLines.push(unindentedLine);
          } else {
            mainFunctionLines.push(""); // Keep empty lines
          }
        }
      } else {
        // Not in main function - this is setup code
        setupLines.push(line);
      }
    }

    // Replace user code with just the setup portion
    wrappedCode += setupLines.join("\n");
    wrappedCode += "\n\n";

    // Create async version of main function
    wrappedCode += "# Async version of main() for parallel execution\n";
    wrappedCode += "async def async_main():\n";
    wrappedCode += `    \"\"\"User's main program ${isMainAsync ? "(already async)" : "converted to async"}\"\"\"\n`;

    // Add main function content with proper indentation and await conversion
    const asyncMainCode = mainFunctionLines
      .map((line) => {
        if (line.trim() === "") return line;
        const indented = "    " + line; // Add async function indentation
        if (isMainAsync) {
          // Function is already async, don't modify wait() calls
          return indented;
        } else {
          // Convert wait() to await wait() for sync functions
          // Be very specific: only convert standalone wait() calls, not method calls or parameters
          return indented.replace(
            /(\s|^)wait\s*\(\s*(\d+)/g,
            "$1await wait($2"
          );
        }
      })
      .join("\n");

    wrappedCode += asyncMainCode;
    wrappedCode += "\n\n";
  } else {
    // User doesn't have main() function - wrap their code in one
    // Separate imports/hardware setup from main program logic
    const lines = code.split("\n");
    const setupLines: string[] = [];
    const mainLines: string[] = [];

    let inMainSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Detect start of main program logic
      if (
        !inMainSection &&
        (trimmedLine.startsWith("print(") ||
          trimmedLine.startsWith("for ") ||
          trimmedLine.startsWith("while ") ||
          (trimmedLine.includes("drive") && trimmedLine.includes("(")) ||
          (trimmedLine.includes("turn") && trimmedLine.includes("(")) ||
          (trimmedLine.includes("light.") && trimmedLine.includes("(")))
      ) {
        inMainSection = true;
      }

      // Hardware/imports go in setup
      if (!inMainSection) {
        setupLines.push(line);
      } else {
        mainLines.push(line);
      }
    }

    // Add user setup code
    wrappedCode += "# User hardware setup (module level)\n";
    wrappedCode += setupLines.join("\n");
    wrappedCode += "\n\n";

    // Create main() function from their program logic
    wrappedCode += "# User main() function (auto-generated)\n";
    wrappedCode += "def main():\n";
    wrappedCode += '    """User\'s main program logic"""\n';

    // Add main program logic, properly indented
    const indentedMainCode = mainLines
      .map((line) => (line.trim() === "" ? line : "    " + line))
      .join("\n");

    wrappedCode += indentedMainCode;
    wrappedCode += "\n\n";

    // Create async version for parallel execution
    wrappedCode += "# Async version of main() for parallel execution\n";
    wrappedCode += "async def async_main():\n";
    wrappedCode += '    """Async version of user\'s main program"""\n';

    // Convert wait() calls and indent for async function
    const asyncMainCode = mainLines
      .map((line) => {
        if (line.trim() === "") return line;
        const indented = "    " + line;
        // Convert wait() to await wait()
        // Be very specific: only convert standalone wait() calls, not method calls or parameters
        return indented.replace(/(\s|^)wait\s*\(\s*(\d+)/g, "$1await wait($2");
      })
      .join("\n");

    wrappedCode += asyncMainCode;
    wrappedCode += "\n\n";
  }

  // Add the parallel execution logic
  wrappedCode += "# PybricksPilot Parallel Execution\n";
  wrappedCode += "print('[PILOT] Initializing with standard contract...')\n";
  wrappedCode += "\n";
  wrappedCode += "try:\n";
  ("    print('[PILOT] Starting parallel execution: main() + telemetry')\n");
  wrappedCode +=
    "    run_task(run_with_parallel_instrumentation(async_main))\n";
  wrappedCode += "except Exception as e:\n";
  wrappedCode += "    print('[PILOT] Contract execution error:', e)\n";

  return wrappedCode;
}

/**
 * Main function to instrument user code with pybrickspilot
 */
export function instrumentUserCode(
  userCode: string,
  options: InstrumentationOptions = {}
): {
  instrumentedCode: string;
  analysis: ReturnType<typeof analyzeUserCode>;
  injectedModuleSize: number;
} {
  // Analyze user code
  const analysis = analyzeUserCode(userCode);

  // Generate instrumentation
  const instrumentationCode =
    options.autoDetectHardware !== false
      ? generateInstrumentationCode(analysis, options)
      : "\nimport pybrickspilot as pilot\n\n";

  // Add smart telemetry without breaking code structure
  const processedUserCode = wrapWithInstrumentation(userCode, options);

  // Combine everything
  const instrumentedCode =
    pybricksPilotCode + "\n\n" + instrumentationCode + processedUserCode;

  return {
    instrumentedCode,
    analysis,
    injectedModuleSize: pybricksPilotCode.length + instrumentationCode.length,
  };
}
