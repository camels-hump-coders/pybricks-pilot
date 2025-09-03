import type { PythonFile } from "../types/fileSystem";

interface DependencyInfo {
  file: PythonFile;
  content: string;
  moduleName: string;
  dependencies: string[]; // Module names this file imports
}

interface ResolvedDependencies {
  dependencies: DependencyInfo[];
  unresolvedImports: string[]; // Imports we couldn't resolve locally
}

/**
 * Resolves Python import dependencies recursively within the project directory
 */
class DependencyResolver {
  /**
   * Extracts import statements from Python code
   * Handles: import module, from module import ..., from .relative import ...
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith("#") || !trimmed) continue;

      // Handle "import module" and "import module.submodule"
      const importMatch = trimmed.match(
        /^import\s+([a-zA-Z_][a-zA-Z0-9_.]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_.]*)*)$/,
      );
      if (importMatch) {
        const modules = importMatch[1].split(",").map((m) => m.trim());
        imports.push(...modules);
        continue;
      }

      // Handle "from module import ..." and "from .relative import ..."
      const fromImportMatch = trimmed.match(
        /^from\s+([a-zA-Z_][a-zA-Z0-9_.]*|\.[a-zA-Z_][a-zA-Z0-9_.]*)\s+import/,
      );
      if (fromImportMatch) {
        let module = fromImportMatch[1];

        // Handle relative imports like "from .module import"
        if (module.startsWith(".")) {
          // For now, we'll handle relative imports by removing the leading dot
          // This assumes the relative module is in the same directory tree
          module = module.substring(1);
        }

        if (module) {
          imports.push(module);
        }
      }
    }

    return imports;
  }

  /**
   * Converts a module name to possible file paths
   * e.g. "robot.sensors" -> ["robot/sensors.py", "robot/sensors/__init__.py"]
   */
  private moduleNameToFilePaths(moduleName: string): string[] {
    const paths: string[] = [];
    const pathParts = moduleName.split(".");

    // Direct file: robot/sensors.py
    paths.push(`${pathParts.join("/")}.py`);

    // Package with __init__.py: robot/sensors/__init__.py
    if (pathParts.length > 0) {
      paths.push(`${pathParts.join("/")}/__init__.py`);
    }

    return paths;
  }

  /**
   * Recursively flattens a nested file tree into a flat array of all files
   */
  private flattenFileTree(files: PythonFile[]): PythonFile[] {
    const flattened: PythonFile[] = [];

    const traverse = (fileList: PythonFile[], parentPath = "") => {
      for (const file of fileList) {
        // Calculate the full relative path
        const fullPath = parentPath ? `${parentPath}/${file.name}` : file.name;

        // Create a copy with updated relativePath
        const fileWithPath = {
          ...file,
          relativePath: fullPath,
        };

        if (file.isDirectory && file.children) {
          // Recursively process children
          traverse(file.children, fullPath);
        } else {
          // Add non-directory files to the flattened list
          flattened.push(fileWithPath);
        }
      }
    };

    traverse(files);
    return flattened;
  }

  /**
   * Finds a Python file by trying different path variations
   */
  private findFileByPath(
    files: PythonFile[],
    targetPath: string,
  ): PythonFile | null {
    // First flatten the file tree to get all files with proper relative paths
    const flatFiles = this.flattenFileTree(files);

    // Try exact match first
    let found = flatFiles.find(
      (f) => f.relativePath === targetPath || f.name === targetPath,
    );
    if (found) return found;

    // Try case-insensitive match
    found = flatFiles.find(
      (f) =>
        f.relativePath?.toLowerCase() === targetPath.toLowerCase() ||
        f.name.toLowerCase() === targetPath.toLowerCase(),
    );
    if (found) return found;

    // Try without the .py extension if it's there
    if (targetPath.endsWith(".py")) {
      const withoutExt = targetPath.slice(0, -3);
      found = flatFiles.find(
        (f) => f.relativePath === withoutExt || f.name === withoutExt,
      );
      if (found) return found;
    }

    return null;
  }

  /**
   * Resolves a module name to a PythonFile
   */
  private resolveModuleToFile(
    moduleName: string,
    files: PythonFile[],
  ): PythonFile | null {
    const possiblePaths = this.moduleNameToFilePaths(moduleName);

    for (const path of possiblePaths) {
      const file = this.findFileByPath(files, path);
      if (file) {
        return file;
      }
    }

    console.error(
      `[DependencyResolver] Could not resolve module: ${moduleName}`,
    );
    return null;
  }

  /**
   * Converts file path back to module name
   * e.g. "robot/sensors.py" -> "robot.sensors"
   */
  private filePathToModuleName(filePath: string): string {
    let modulePath = filePath;

    // Remove .py extension
    if (modulePath.endsWith(".py")) {
      modulePath = modulePath.slice(0, -3);
    }

    // Remove __init__ for packages
    if (modulePath.endsWith("/__init__")) {
      modulePath = modulePath.slice(0, -9);
    }

    // Replace path separators with dots
    modulePath = modulePath.replace(/[/\\]/g, ".");

    return modulePath;
  }

  /**
   * Reads file content from a PythonFile
   */
    private async readFileContent(file: PythonFile): Promise<string> {
      try {
        if ("getFile" in file.handle) {
          const fileHandle = await file.handle.getFile();
          return await fileHandle.text();
        }
        return "";
      } catch (error) {
        console.warn(`Failed to read file ${file.name}:`, error);
        return "";
      }
    }

  /**
   * Recursively resolves all dependencies for a given file
   */
  async resolveDependencies(
    entryFile: PythonFile,
    entryContent: string,
    availableFiles: PythonFile[],
  ): Promise<ResolvedDependencies> {
    const resolved = new Map<string, DependencyInfo>();
    const unresolvedImports = new Set<string>();
    const visited = new Set<string>();

    const resolveRecursive = async (
      file: PythonFile,
      content: string,
    ): Promise<void> => {
      const moduleName = this.filePathToModuleName(
        file.relativePath || file.name,
      );

      // Avoid infinite recursion
      if (visited.has(moduleName)) {
        return;
      }
      visited.add(moduleName);

      // Extract imports from this file
      const imports = this.extractImports(content);
      const resolvedDeps: string[] = [];

      // Process each import
      for (const importName of imports) {
        // Skip built-in modules and external libraries
        if (this.isBuiltinModule(importName)) {
          continue;
        }

        // Try to resolve to a local file
        const dependencyFile = this.resolveModuleToFile(
          importName,
          availableFiles,
        );

        if (dependencyFile) {
          const depModuleName = this.filePathToModuleName(
            dependencyFile.relativePath || dependencyFile.name,
          );
          resolvedDeps.push(depModuleName);

          // Recursively resolve dependencies of this dependency
          if (!resolved.has(depModuleName)) {
            const depContent = await this.readFileContent(dependencyFile);
            await resolveRecursive(dependencyFile, depContent);
          }
        } else {
          // This import couldn't be resolved locally
          unresolvedImports.add(importName);
        }
      }

      // Add this file to resolved dependencies
      resolved.set(moduleName, {
        file,
        content,
        moduleName,
        dependencies: resolvedDeps,
      });
    };

    // Start recursive resolution from entry file
    await resolveRecursive(entryFile, entryContent);

    return {
      dependencies: Array.from(resolved.values()),
      unresolvedImports: Array.from(unresolvedImports),
    };
  }

  /**
   * Check if a module is a built-in Python module or external library
   */
  private isBuiltinModule(moduleName: string): boolean {
    // Common Python built-in modules and Pybricks modules
    const builtinModules = new Set([
      // Python built-ins
      "sys",
      "os",
      "time",
      "math",
      "random",
      "json",
      "collections",
      "itertools",
      "functools",
      "re",
      "string",
      "datetime",
      "calendar",
      "hashlib",
      "hmac",
      "base64",
      "struct",
      "array",
      "copy",
      "pickle",
      "io",
      "threading",
      "queue",
      "asyncio",
      "concurrent",
      "multiprocessing",

      // Pybricks modules
      "pybricks",
      "pybricks.hubs",
      "pybricks.pupdevices",
      "pybricks.parameters",
      "pybricks.robotics",
      "pybricks.iodevices",
      "pybricks.media",
      "pybricks.tools",
      "pybricks.geometry",
      "pybricks.nxtdevices",
      "pybrickspilot",

      // MicroPython modules
      "micropython",
      "gc",
      "utime",
      "uos",
      "ujson",
      "ure",
      "ustruct",
      "ubinascii",
      "uhashlib",
      "uheapq",
      "uio",
      "urandom",
      "uselect",
      "usocket",
      "ussl",
      "uzlib",
      "machine",
      "network",
    ]);

    // Check if the module or its top-level package is built-in
    const topLevel = moduleName.split(".")[0];
    return builtinModules.has(moduleName) || builtinModules.has(topLevel);
  }
}

export const dependencyResolver = new DependencyResolver();
