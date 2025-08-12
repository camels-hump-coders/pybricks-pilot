import { compile as mpyCrossCompileV6 } from "@pybricks/mpy-cross-v6";
import wasmUrl from "@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm?url";

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
    details?: Record<string, any>
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
    pythonCode: string
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
        "Code cleaned and prepared for compilation"
      );

      // Compile using mpy-cross v6 with options that might be needed for Pybricks
      const options: string[] = [
        // Add any compilation options that Pybricks might use
        // Try to match what Pybricks Code does for compilation
      ];

      this.emitDebugEvent("upload", "Invoking mpy-cross compiler", {
        options: options.length > 0 ? options : "default",
      });

      const result = await mpyCrossCompileV6(
        fileName,
        cleanCode,
        options.length > 0 ? options : undefined,
        wasmUrl
      );

      if (result.status !== 0 || !result.mpy) {
        const errorMsg = result.err?.join("\n") || "Unknown error";
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

      // Create the multi-file format exactly like Pybricks Code
      const blobParts: BlobPart[] = [];
      // Pybricks uses '__main__' as module name even when filename is '__main__.py'
      const moduleName = "__main__";

      this.emitDebugEvent("upload", "Creating multi-file format", {
        moduleName,
        mpySize: result.mpy.length,
      });

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

      // Each file is encoded as: size, module name, and mpy binary
      const lengthBytes = encodeUInt32LE(result.mpy.length);
      const nameBytes = cString(moduleName);

      this.emitDebugEvent("upload", "Multi-file format components created", {
        moduleName,
        mpyLength: result.mpy.length,
        lengthBytesHex: Array.from(new Uint8Array(lengthBytes))
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
        nameBytesSize: nameBytes.length,
        mpyHeaderHex: Array.from(result.mpy.slice(0, 8))
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" "),
      });

      blobParts.push(lengthBytes);
      blobParts.push(nameBytes as BlobPart);
      blobParts.push(result.mpy as BlobPart);

      // Create the final blob
      const file = new Blob(blobParts);

      const expectedSize = 4 + nameBytes.length + result.mpy.length;
      this.emitDebugEvent("upload", "Final multi-file blob created", {
        blobSize: file.size,
        expectedSize,
        sizeMatch: file.size === expectedSize,
        componentCount: blobParts.length,
      });

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
    mpyBytecode: Uint8Array
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
      `Created multi-file format: ${totalSize} bytes total, entry point: ${fileName}`
    );

    return uint8View;
  }
}

export const mpyCrossCompiler = new MpyCrossCompiler();
