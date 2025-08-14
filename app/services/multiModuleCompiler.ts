import pybricksPilotCode from "../assets/pybrickspilot.py?raw";
import type { PythonFile } from "../types/fileSystem";
import { dependencyResolver } from "./dependencyResolver";
import { mpyCrossCompiler } from "./mpyCrossCompiler";

interface MultiModuleCompilationResult {
  success: boolean;
  multiFileBlob?: Blob;
  error?: string;
  modules?: string[];
}

/**
 * Converts a file path to a Python module name
 * Examples:
 * - "robot/debug.py" -> "robot.debug"
 * - "example/program.py" -> "example.program"
 * - "foo.py" -> "foo"
 * - "src/lib/utils.py" -> "src.lib.utils"
 */
function filePathToModuleName(filePath: string): string {
  // Remove .py extension
  let modulePath = filePath.replace(/\.py$/, "");

  // Replace path separators with dots
  modulePath = modulePath.replace(/[\/\\]/g, ".");

  return modulePath;
}

/**
 * Generates the hub menu main module for multiple numbered programs
 */
function generateHubMenuMainModule(
  programs: Array<{
    name: string;
    number: number;
    side: string;
    moduleName: string;
  }>
): string {
  const programList = programs
    .map(
      (prog) =>
        `    {"num": ${prog.number}, "name": "${prog.name}", "side": "${prog.side}", "file": "${prog.name}", "main": program_${prog.name}},`
    )
    .join("\n");

  return `"""
Auto-generated hub menu system for PybricksPilot
This module provides program selection using hub buttons and LED display
"""

from pybricks.hubs import PrimeHub
from pybricks.parameters import Button, Color
from pybricks.tools import wait, StopWatch, run_task, multitask
from pybricks import version
from pybrickspilot import background_telemetry_task

${programs.map((p) => `from ${p.moduleName} import main as program_${p.name}`).join("\n")}

print("PyBricks Pilot Menu v1.0")
print(f"PyBricks {version}")

# Initialize the hub
hub = PrimeHub()

# Set stop button to Bluetooth button to free up CENTER for program selection
hub.system.set_stop_button(Button.BLUETOOTH)

# Program list (generated from your numbered programs)
PROGRAMS = [
${programList}
]

def show_program_number(num):
    """Display a program number on the hub display"""
    hub.display.number(num)

def check_ui_commands():
    """Check for incoming commands from UI via stdin (non-blocking)"""
    try:
        from pybricks.tools import read_input_byte
        stdin_data = []
        while True:
            try:
                # Try to read a byte using Pybricks non-blocking method
                byte = read_input_byte()
                if byte is None:
                    break
                if byte == ord('\\n'):
                    # Complete command received
                    if stdin_data:
                        command = bytes(stdin_data).decode('utf-8').strip()
                        return command
                    break
                stdin_data.append(byte)
            except:
                break
    except:
        pass
    return None

def run_selected_program(program_info):
    """Execute the selected program"""
    print(f"[PILOT:POSITION_RESET]")  # Signal for position reset
    print(f"Running Program {program_info['num']}: {program_info['name']}")
    print(f"Starting side: {program_info['side']}")
    
    # Set hub light to red for program running
    hub.light.on(Color.RED)
    
    # Import and run the selected program
    try:
        # Dynamic import based on filename
        run_task(multitask(program_info['main'](), background_telemetry_task(), race=True))
        print(f"Program {program_info['num']} completed successfully")
    except Exception as e:
        print(f"Error running program {program_info['num']}: {e}")
        # Show error on display
        hub.display.text("ERR")
        wait(2000)
    
    # Return hub light to green for menu mode
    hub.light.on(Color.GREEN)

def main_menu():
    """Main menu loop"""
    if not PROGRAMS:
        print("No programs configured!")
        hub.display.number(0)
        return
    
    current_index = 0
    
    print(f"PyBricks Pilot Menu - {len(PROGRAMS)} programs available")
    print("Controls: Left/Right buttons to navigate, Center button to select")
    print("Note: Bluetooth button stops programs")
    print("Status: Green light = menu mode, Red light = program running")
    print("Auto-advance: Menu advances to next program after completion")
    
    # Set hub light to green for menu mode
    hub.light.on(Color.GREEN)
    
    # Show initial program
    show_program_number(PROGRAMS[current_index]['num'])
    hub.speaker.beep(frequency=440, duration=100)
    
    # Send initial menu status to UI
    print(f"[PILOT:MENU_STATUS] selected={PROGRAMS[current_index]['num']} total={len(PROGRAMS)} state=menu")
    
    while True:
        # Check for UI commands first
        ui_command = check_ui_commands()
        if ui_command:
            try:
                import json
                command_data = json.loads(ui_command)
                if command_data.get('action') == 'select_program':
                    # UI wants to select a specific program number
                    target_num = command_data.get('program_number')
                    for i, prog in enumerate(PROGRAMS):
                        if prog['num'] == target_num:
                            current_index = i
                            show_program_number(PROGRAMS[current_index]['num'])
                            hub.speaker.beep(frequency=440, duration=100)
                            print(f"UI Selected: Program {PROGRAMS[current_index]['num']} - {PROGRAMS[current_index]['name']}")
                            print(f"[PILOT:MENU_STATUS] selected={PROGRAMS[current_index]['num']} total={len(PROGRAMS)} state=menu")
                            break
                elif command_data.get('action') == 'run_selected':
                    # UI wants to run the currently selected program
                    selected = PROGRAMS[current_index]
                    hub.speaker.beep(frequency=660, duration=200)
                    print(f"UI Starting Program {selected['num']}: {selected['name']}")
                    print(f"[PILOT:MENU_STATUS] selected={selected['num']} total={len(PROGRAMS)} state=running")
                    
                    # Run the program
                    run_selected_program(selected)
                    
                    # Auto-advance to next program (wrap around)
                    current_index = (current_index + 1) % len(PROGRAMS)
                    
                    # Return to menu after program completes
                    print("Returning to menu...")
                    print(f"Auto-advanced to Program {PROGRAMS[current_index]['num']}: {PROGRAMS[current_index]['name']}")
                    show_program_number(PROGRAMS[current_index]['num'])
                    print(f"[PILOT:MENU_STATUS] selected={PROGRAMS[current_index]['num']} total={len(PROGRAMS)} state=menu")
                    wait(1000)
            except:
                print(f"Invalid UI command: {ui_command}")
        
        # Check for button presses (non-blocking)
        pressed = hub.buttons.pressed()
        
        if Button.LEFT in pressed:
            # Previous program
            current_index = (current_index - 1) % len(PROGRAMS)
            show_program_number(PROGRAMS[current_index]['num'])
            hub.speaker.beep(frequency=330, duration=100)
            print(f"Selected: Program {PROGRAMS[current_index]['num']} - {PROGRAMS[current_index]['name']}")
            print(f"[PILOT:MENU_STATUS] selected={PROGRAMS[current_index]['num']} total={len(PROGRAMS)} state=menu")
            wait(300)  # Debounce
            
        elif Button.RIGHT in pressed:
            # Next program
            current_index = (current_index + 1) % len(PROGRAMS)
            show_program_number(PROGRAMS[current_index]['num'])
            hub.speaker.beep(frequency=550, duration=100)
            print(f"Selected: Program {PROGRAMS[current_index]['num']} - {PROGRAMS[current_index]['name']}")
            print(f"[PILOT:MENU_STATUS] selected={PROGRAMS[current_index]['num']} total={len(PROGRAMS)} state=menu")
            wait(300)  # Debounce
            
        elif Button.CENTER in pressed:
            # Run selected program
            selected = PROGRAMS[current_index]
            hub.speaker.beep(frequency=660, duration=200)
            print(f"Starting Program {selected['num']}: {selected['name']}")
            print(f"[PILOT:MENU_STATUS] selected={selected['num']} total={len(PROGRAMS)} state=running")
            
            # Run the program
            run_selected_program(selected)
            
            # Auto-advance to next program (wrap around)
            current_index = (current_index + 1) % len(PROGRAMS)
            
            # Return to menu after program completes
            print("Returning to menu...")
            print(f"Auto-advanced to Program {PROGRAMS[current_index]['num']}: {PROGRAMS[current_index]['name']}")
            show_program_number(PROGRAMS[current_index]['num'])
            print(f"[PILOT:MENU_STATUS] selected={PROGRAMS[current_index]['num']} total={len(PROGRAMS)} state=menu")
            wait(1000)
        
        wait(50)  # Small delay to prevent excessive CPU usage

# Run the menu
if __name__ == "__main__":
    try:
        main_menu()
    except KeyboardInterrupt:
        print("Menu interrupted")
        hub.display.off()
        hub.light.off()
    except Exception as e:
        print(f"Menu error: {e}")
        hub.display.off()
        hub.light.off()
`;
}

/**
 * Generates the __main__ module that imports and orchestrates the other modules
 */
function generateMainModule(userModuleName: string): string {
  return `"""
Auto-generated __main__ module for PybricksPilot multi-module system
This module imports and orchestrates the execution of user code and telemetry
"""

import pybrickspilot as pilot
from pybricks.tools import run_task, multitask, wait
from pybricks.hubs import PrimeHub
from pybricks.parameters import Button

# Initialize hub and set stop button to Bluetooth
hub = PrimeHub()
hub.system.set_stop_button(Button.BLUETOOTH)

# Import the user's main function
try:
    from ${userModuleName} import run as main
except ImportError as e:
    try:
        from ${userModuleName} import main
    except ImportError as e:
      print(f"[PILOT] Error: Could not import main function from ${userModuleName}")
      print(f"[PILOT] Make sure your file has an 'async def main():' function")
      print(f"[PILOT] Import error: {e}")
      raise

# Print startup message
print("[PILOT] Starting PybricksPilot multi-module system")
print("[PILOT] User module: ${userModuleName}")

async def main_task():
    """Run the user's main function"""
    print("[PILOT] Starting user program")
    try:
        await main()
    except Exception as e:
        print(f"[PILOT] User program error: {e}")
        raise
    finally:
        print("[PILOT] User program completed")

# Run both tasks in parallel
print("[PILOT] Starting parallel tasks")
run_task(multitask(pilot.background_telemetry_task(), main_task()))
`;
}

class MultiModuleCompiler extends EventTarget {
  private emitDebugEvent(
    type: string,
    message: string,
    details?: Record<string, any>
  ): void {
    const debugEvent = {
      timestamp: Date.now(),
      type,
      message,
      details,
    };

    const customEvent = new CustomEvent("debugEvent", {
      detail: debugEvent,
    });
    this.dispatchEvent(customEvent);
  }

  /**
   * Creates a multi-file .mpy blob by combining multiple individual .mpy files
   * This follows the exact Pybricks encoding pattern: size + null-terminated name + mpy binary
   */
  private async createMultiFileBlob(
    modules: Array<{ name: string; blob: Blob }>
  ): Promise<Blob> {
    const blobParts: ArrayBuffer[] = [];

    // Helper functions matching Pybricks exactly
    const encodeUInt32LE = (value: number): ArrayBuffer => {
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      view.setUint32(0, value, true);
      return buf;
    };

    const cString = (str: string): Uint8Array => {
      const encoder = new TextEncoder();
      return encoder.encode(str + "\x00");
    };

    // Each file is encoded as: size, module name (null-terminated), and mpy binary
    for (const module of modules) {
      const mpyBytes = new Uint8Array(await module.blob.arrayBuffer());
      const lengthBytes = encodeUInt32LE(mpyBytes.length);
      const nameBytes = cString(module.name);

      blobParts.push(lengthBytes);
      blobParts.push(nameBytes.buffer);
      blobParts.push(mpyBytes.buffer);
    }

    // Create the final blob
    return new Blob(blobParts);
  }

  /**
   * Compiles multiple Python modules into a single multi-file blob for upload
   * Automatically resolves and includes all local dependencies
   */
  async compileMultiModule(
    selectedFile: PythonFile,
    fileContent: string,
    availableFiles: PythonFile[]
  ): Promise<MultiModuleCompilationResult> {
    try {
      const modules: string[] = [];

      // Calculate the module name for the user's file
      const userModuleName = filePathToModuleName(
        selectedFile.relativePath || selectedFile.name
      );

      this.emitDebugEvent("upload", "Starting multi-module compilation", {
        userFile: selectedFile.name,
        userModule: userModuleName,
      });

      // 1. Resolve all dependencies
      this.emitDebugEvent("upload", "Resolving dependencies");
      const resolved = await dependencyResolver.resolveDependencies(
        selectedFile,
        fileContent,
        availableFiles
      );

      if (resolved.unresolvedImports.length > 0) {
        this.emitDebugEvent("upload", "Found unresolved imports", {
          unresolvedImports: resolved.unresolvedImports,
        });
      }

      this.emitDebugEvent("upload", "Dependencies resolved", {
        dependencyCount: resolved.dependencies.length,
        dependencies: resolved.dependencies.map((d) => d.moduleName),
      });

      // 2. Compile all modules (pybrickspilot + dependencies + __main__)
      const compilationTasks: Promise<{ name: string; result: any }>[] = [];

      // Always include pybrickspilot
      compilationTasks.push(
        mpyCrossCompiler
          .compileToBytecode("pybrickspilot.py", pybricksPilotCode)
          .then((result) => ({ name: "pybrickspilot", result }))
      );

      // Compile all resolved dependencies
      for (const dep of resolved.dependencies) {
        compilationTasks.push(
          mpyCrossCompiler
            .compileToBytecode(dep.file.name, dep.content)
            .then((result) => ({ name: dep.moduleName, result }))
        );
      }

      // Always include __main__ last
      compilationTasks.push(
        mpyCrossCompiler
          .compileToBytecode("__main__.py", generateMainModule(userModuleName))
          .then((result) => ({ name: "__main__", result }))
      );

      this.emitDebugEvent("upload", "Compiling all modules", {
        moduleCount: compilationTasks.length,
      });

      const compilationResults = await Promise.all(compilationTasks);

      // 3. Check all compilation results and collect successful ones
      const compiledModules: { name: string; blob: Blob }[] = [];

      for (const { name, result } of compilationResults) {
        if (!result.success || !result.file) {
          throw new Error(`Failed to compile ${name} module: ${result.error}`);
        }
        compiledModules.push({ name, blob: result.file });
        modules.push(name);
      }

      this.emitDebugEvent("upload", "Creating multi-file format", {
        modules: modules,
        totalModules: compiledModules.length,
      });

      // 4. Create proper multi-file .mpy format
      const multiFileBlob = await this.createMultiFileBlob(compiledModules);

      this.emitDebugEvent("upload", "Multi-module compilation complete", {
        modules: modules,
        totalSize: multiFileBlob.size,
        approach: "true-multi-file",
      });

      return {
        success: true,
        multiFileBlob: multiFileBlob,
        modules: modules,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.emitDebugEvent("error", "Multi-module compilation failed", {
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Compiles multiple numbered programs into a hub menu system
   * Uses existing dependency resolution and multi-file blob creation
   */
  async compileHubMenu(
    allPrograms: PythonFile[],
    availableFiles: PythonFile[]
  ): Promise<MultiModuleCompilationResult> {
    try {
      const modules: string[] = [];

      // Filter and prepare numbered programs
      const numberedPrograms = allPrograms
        .filter((file) => file.programNumber && !file.isDirectory)
        .sort((a, b) => (a.programNumber || 0) - (b.programNumber || 0))
        .map((file) => ({
          name: file.name.replace(".py", ""),
          moduleName: filePathToModuleName(file.relativePath),
          number: file.programNumber!,
          side: file.programSide || "right",
          file: file,
        }));

      if (numberedPrograms.length === 0) {
        throw new Error("No numbered programs found");
      }

      this.emitDebugEvent("upload", "Starting hub menu compilation", {
        programCount: numberedPrograms.length,
        programs: numberedPrograms.map((p) => ({
          name: p.name,
          moduleName: p.moduleName,
          number: p.number,
          side: p.side,
        })),
      });

      // 1. Compile all numbered programs and resolve their dependencies
      const allDependencies = new Map<
        string,
        { file: PythonFile; content: string; moduleName: string }
      >();
      const allProgramContents = new Map<string, string>();

      for (const program of numberedPrograms) {
        // Read program content
        const file = await program.file.handle.getFile();
        const content = await file.text();
        allProgramContents.set(program.moduleName, content);

        // Resolve dependencies for this program
        this.emitDebugEvent(
          "upload",
          `Resolving dependencies for ${program.name}`
        );
        const resolved = await dependencyResolver.resolveDependencies(
          program.file,
          content,
          availableFiles
        );

        // Add all dependencies to our map (avoiding duplicates)
        for (const dep of resolved.dependencies) {
          if (!allDependencies.has(dep.moduleName)) {
            allDependencies.set(dep.moduleName, dep);
          }
        }
      }

      this.emitDebugEvent("upload", "Dependencies resolved for all programs", {
        totalDependencies: allDependencies.size,
        dependencies: Array.from(allDependencies.keys()),
      });

      // 2. Compile all modules (pybrickspilot + dependencies + programs + __main__)
      const compilationTasks: Promise<{ name: string; result: any }>[] = [];

      // Always include pybrickspilot
      compilationTasks.push(
        mpyCrossCompiler
          .compileToBytecode("pybrickspilot.py", pybricksPilotCode)
          .then((result) => ({ name: "pybrickspilot", result }))
      );

      // Compile all resolved dependencies
      for (const dep of allDependencies.values()) {
        compilationTasks.push(
          mpyCrossCompiler
            .compileToBytecode(dep.file.name, dep.content)
            .then((result) => ({ name: dep.moduleName, result }))
        );
      }

      // Compile all numbered programs
      for (const [programName, content] of allProgramContents) {
        compilationTasks.push(
          mpyCrossCompiler
            .compileToBytecode(`${programName}.py`, content)
            .then((result) => ({ name: programName, result }))
        );
      }

      // Generate and compile the hub menu __main__ module
      const hubMenuCode = generateHubMenuMainModule(numberedPrograms);
      compilationTasks.push(
        mpyCrossCompiler
          .compileToBytecode("__main__.py", hubMenuCode)
          .then((result) => ({ name: "__main__", result }))
      );

      this.emitDebugEvent("upload", "Compiling all modules for hub menu", {
        moduleCount: compilationTasks.length,
      });

      const compilationResults = await Promise.all(compilationTasks);

      // 3. Check all compilation results and collect successful ones
      const compiledModules: { name: string; blob: Blob }[] = [];

      for (const { name, result } of compilationResults) {
        if (!result.success || !result.file) {
          throw new Error(`Failed to compile ${name} module: ${result.error}`);
        }
        compiledModules.push({ name, blob: result.file });
        modules.push(name);
      }

      this.emitDebugEvent("upload", "Creating multi-file format for hub menu", {
        modules: modules,
        totalModules: compiledModules.length,
      });

      // 4. Create proper multi-file .mpy format using existing logic
      const multiFileBlob = await this.createMultiFileBlob(compiledModules);

      this.emitDebugEvent("upload", "Hub menu compilation complete", {
        modules: modules,
        totalSize: multiFileBlob.size,
        programCount: numberedPrograms.length,
        approach: "hub-menu-system",
      });

      return {
        success: true,
        multiFileBlob: multiFileBlob,
        modules: modules,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.emitDebugEvent("error", "Hub menu compilation failed", {
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

export const multiModuleCompiler = new MultiModuleCompiler();
