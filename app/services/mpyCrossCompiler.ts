import { compile as mpyCrossCompileV6 } from "@pybricks/mpy-cross-v6";
import wasmUrl from "@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm?url";
import type { InstrumentationOptions } from "../utils/codeInstrumentation";

interface CompilationResult {
  file: Blob; // Change to match Pybricks approach
  success: boolean;
  error?: string;
}

interface DebugEvent {
  timestamp: number;
  type: "connection" | "upload" | "program" | "status" | "error" | "command";
  message: string;
  details?: Record<string, any>;
}

class MpyCrossCompiler extends EventTarget {
  private emitDebugEvent(
    type: "connection" | "upload" | "program" | "status" | "error" | "command",
    message: string,
    details?: Record<string, any>,
  ): void {
    const debugEvent: DebugEvent = {
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

  async compileToBytecode(
    fileName: string,
    pythonCode: string,
  ): Promise<CompilationResult> {
    try {
      this.emitDebugEvent("upload", "Starting MicroPython compilation", {
        fileName,
        codeLength: pythonCode.length,
      });

      // Clean up the code
      let cleanCode = pythonCode.trim();
      if (!cleanCode.endsWith("\n")) {
        cleanCode += "\n";
      }

      this.emitDebugEvent(
        "upload",
        "Code cleaned and prepared for compilation",
      );

      // Compile using mpy-cross v6 with Pybricks-compatible options
      const options: string[] = [
        "-march=armv6m", // ARM Cortex-M0+ architecture (used by LEGO hubs)
      ];

      this.emitDebugEvent("upload", "Invoking mpy-cross compiler", {
        options: options.length > 0 ? options : "default",
      });

      const result = await mpyCrossCompileV6(
        fileName,
        cleanCode,
        options.length > 0 ? options : undefined,
        wasmUrl,
      );

      if (result.status !== 0 || !result.mpy) {
        const errorMsg = result.err?.join("\n") || "Unknown error";
        console.error("MyPy Cross Compile V6 failed:", cleanCode);
        this.emitDebugEvent("error", "Compilation failed", {
          status: result.status,
          error: errorMsg,
        });
        throw new Error(`Compilation failed: ${errorMsg}`);
      }

      this.emitDebugEvent("upload", "MicroPython compilation successful", {
        bytecodeSize: result.mpy.byteLength,
        fileName,
      });

      // Debug: log the first few bytes of the .mpy file to verify format
      const firstBytes = Array.from(result.mpy.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      this.emitDebugEvent("upload", "MPY bytecode generated", {
        headerBytes: firstBytes,
        totalSize: result.mpy.byteLength,
      });

      // Return just the compiled .mpy bytecode as a Blob
      // Multi-file format will be handled by multiModuleCompiler
      // Ensure we have a proper ArrayBuffer by creating a new Uint8Array
      const mpyData = new Uint8Array(result.mpy);
      const file = new Blob([mpyData]);

      return {
        file,
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown compilation error";

      this.emitDebugEvent("error", "Compilation error occurred", {
        error: errorMessage,
        fileName,
      });

      return {
        file: new Blob(),
        success: false,
        error: errorMessage,
      };
    }
  }

  // Create a multi-file format with __main__.py as entry point
  createMultiFileFormat(
    mainFileName: string,
    mpyBytecode: Uint8Array,
  ): Uint8Array {
    // Multi-file format structure:
    // - File count (4 bytes, little endian)
    // - For each file:
    //   - File name length (4 bytes, little endian)
    //   - File name (UTF-8 encoded)
    //   - File data length (4 bytes, little endian)
    //   - File data (.mpy bytecode)

    // Try different naming approaches - some Pybricks versions might expect different formats
    const fileName = "__main__.py"; // Use .py extension even for compiled bytecode
    const fileNameBytes = new TextEncoder().encode(fileName);

    // Calculate total size
    const totalSize =
      4 + // file count
      4 +
      fileNameBytes.byteLength + // filename length + filename
      4 +
      mpyBytecode.byteLength; // file data length + file data

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    let offset = 0;

    // File count (1 file)
    view.setUint32(offset, 1, true); // little endian
    offset += 4;

    // File name length
    view.setUint32(offset, fileNameBytes.byteLength, true);
    offset += 4;

    // File name
    uint8View.set(fileNameBytes, offset);
    offset += fileNameBytes.byteLength;

    // File data length
    view.setUint32(offset, mpyBytecode.byteLength, true);
    offset += 4;

    // File data
    uint8View.set(mpyBytecode, offset);

    console.log(
      `Created multi-file format: ${totalSize} bytes total, entry point: ${fileName}`,
    );

    return uint8View;
  }
}

export const mpyCrossCompiler = new MpyCrossCompiler();
