import pybricksPilotCode from "../assets/pybrickspilot.py?raw";
import type { PythonFile } from "../types/fileSystem";
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
 * Generates the __main__ module that imports and orchestrates the other modules
 */
function generateMainModule(userModuleName: string): string {
  return `"""
Auto-generated __main__ module for PybricksPilot multi-module system
This module imports and orchestrates the execution of user code and telemetry
"""

import pybrickspilot as pilot
from pybricks.tools import run_task, multitask, wait

# Import the user's main function
try:
    from ${userModuleName} import main
except ImportError as e:
    print(f"[PILOT] Error: Could not import main function from ${userModuleName}")
    print(f"[PILOT] Make sure your file has a 'def main():' function")
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
   */
  async compileMultiModule(
    selectedFile: PythonFile,
    fileContent: string
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

      // 1. Compile all three modules separately
      this.emitDebugEvent("upload", "Compiling all modules separately");

      const [pilotResult, userResult, mainResult] = await Promise.all([
        mpyCrossCompiler.compileToBytecode(
          "pybrickspilot.py",
          pybricksPilotCode
        ),
        mpyCrossCompiler.compileToBytecode(selectedFile.name, fileContent),
        mpyCrossCompiler.compileToBytecode(
          "__main__.py",
          generateMainModule(userModuleName)
        ),
      ]);

      // Check all compilation results
      if (!pilotResult.success || !pilotResult.file) {
        throw new Error(
          `Failed to compile pybrickspilot module: ${pilotResult.error}`
        );
      }
      if (!userResult.success || !userResult.file) {
        throw new Error(`Failed to compile user module: ${userResult.error}`);
      }
      if (!mainResult.success || !mainResult.file) {
        throw new Error(
          `Failed to compile __main__ module: ${mainResult.error}`
        );
      }

      modules.push("pybrickspilot");
      modules.push(userModuleName);
      modules.push("__main__");

      this.emitDebugEvent("upload", "Creating true multi-file format", {
        modules: modules,
        approach: "multi-file",
      });

      // 2. Create proper multi-file .mpy format
      const multiFileBlob = await this.createMultiFileBlob([
        { name: "pybrickspilot", blob: pilotResult.file },
        { name: userModuleName, blob: userResult.file },
        { name: "__main__", blob: mainResult.file },
      ]);

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
}

export const multiModuleCompiler = new MultiModuleCompiler();
