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
}

export const multiModuleCompiler = new MultiModuleCompiler();
